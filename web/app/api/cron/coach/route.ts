/**
 * 새벽 코칭 크론 — 활성 자녀의 편지 + 오늘의 질문을 미리 생성해 둔다.
 *
 * 스케줄: web/vercel.json crons "0 17 * * *" (UTC 17시 = KST 02시, 새벽 2~5시 창)
 * 인증: Vercel Cron 자동 헤더 또는 CRON_SECRET 검증 (enrich 라우트와 동일 패턴)
 *
 * 흐름 (코칭엔진 스펙 §7):
 *   1) 최근 7일 meal_logs가 ≥3일 있는 자녀 enumerate → 마지막 코칭이 오래된 순 정렬(라운드로빈)
 *   2) 자녀별: 식재료·거부·메모·장소 수집 → reds·식품군·시계열 계산 + 집/기관 분해
 *   3) 식단 지문(source_hash)이 직전 편지와 같으면 LLM 스킵·내용 재사용, 다르면 lib/coach로 생성
 *   4) coach_letters(letter_date=오늘 KST)·daily_questions(q_date=오늘 KST) upsert
 *   5) maxDuration 직전 경과시간 가드로 안전 종료 → cron_runs 로깅
 *
 * 결과: 부모가 아침에 앱을 열면 이미 생성된 편지·질문을 read만 한다(클라 생성은 폴백).
 * 주의: 한 실행에서 시간 안에 처리 못 한 자녀는 다음 실행이 '오래된 순'으로 이어받는다(누락 로그).
 */
import { NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { sendCoachLetterPreview, sendReengage, alimtalkReady } from '@/lib/sens';
import { computeSignals, computeFoodGroups, computeTimeseries } from '@/lib/nutrition';
import { generateLetter, generateQuestion, icfqForDate, isIcfqRisk, pickTip, pickQuestionTopic, sanitizeRefusals, cleanRefusal, composeLetter, planFor, type CoachPlan, type Place, type LoggedFood } from '@/lib/coach';
import { periodMetrics, isoWeekKey, monthKey, quarterKey, halfKey, yearKey, type ProgressRow } from '@/lib/progress';
import { kstToday, kstDateNDaysAgo } from '@/lib/date';
import { backfillUnmappedMenus, type BackfillResult } from '@/lib/remapMenus';
import { type CoachSignals } from '@/lib/coachScenarios';
import { chronicGuidanceText } from '@/lib/coachChronic';
import { reexposurePick } from '@/lib/reexposure';
import { neighborsOf } from '@/lib/foodGraph';
import { evaluateSnacks, snackEvalToPrompt } from '@/lib/snack';
import { bmiOf, bmiPercentile, bmiBand, type Sex, type BmiBand } from '@/lib/growth-reference';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Hobby plan 한도

const TIME_BUDGET_MS = 50_000; // maxDuration(60s) 전 안전 종료 — SIGKILL 회피해 cron_runs 정상 마감

type Row = {
  child_id: string; parent_id: string | null; log_date: string; slot: string | null;
  ingredients: string[] | null; refused: string | null; note: string | null;
  texture: string | null; menus: string[] | null; place: string | null; ate_well: boolean | null;
  meal_time: number | null;
};

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  // QA용 좁히기: ?child=<id>로 한 자녀만, ?force=1로 식단지문 캐시를 무시하고 강제 재생성
  // (인증은 위 CRON_SECRET과 동일 — 로컬/크론에서만 도달. P10 등 편지 로직 검증에 사용)
  const qp = new URL(req.url).searchParams;
  const childFilter = qp.get('child');
  const force = qp.get('force') === '1';
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });
  }

  const supabase = await createSupabaseServer();
  const runStart = Date.now();
  // QA: ?date=YYYY-MM-DD로 과거 날짜를 '오늘'처럼 시뮬(편지 며칠치 재작성). force·child와 동일 인증대(CRON_SECRET). 정상 운영은 kstToday.
  const today = qp.get('date') || kstToday();
  const dAgo = (n: number) => new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10);   // today 기준 n일 전(정상 모드=kstDateNDaysAgo와 동일 결과)
  const since = dAgo(6);
  let processed = 0, errors = 0, letters = 0, questions = 0, reused = 0, skippedTime = 0;
  let alimtalkSent = 0;
  const notifiedParents = new Set<string>();   // 부모당 하루 1건 — 다자녀 스팸 방지
  const sensAdmin = alimtalkReady() ? createSupabaseAdmin() : null;   // 설정 있을 때만 admin 생성
  // 일일 정량 지표(어드민 보고서용)
  let lowData = 0, redChildren = 0, gapChildren = 0, daycareChildren = 0, eatenSum = 0, evalChildren = 0;
  const redFreq: Record<string, number> = {};
  const issues: string[] = [];
  let backfill: BackfillResult | null = null;

  const { data: runRow } = await supabase.from('cron_runs').insert({ job_name: 'coach', status: 'running' }).select('id').single();

  try {
    // 0) 야간 미매핑 보강 — menus 있고 ingredients 빈 행을 먼저 백필(영양계산 전). 실패해도 코칭은 계속.
    try {
      backfill = await backfillUnmappedMenus({ windowDays: 60, maxLlmCalls: 8, timeBudgetMs: 6000, sinceFn: kstDateNDaysAgo });
    } catch (e) { console.warn('[cron/coach] backfill skip:', e instanceof Error ? e.message : e); }

    // 식재료 카테고리 맵 (빗대기 영양평가·채소 시계열용) — public 정적 파일에서
    const catMap: Record<string, string> = {};
    try {
      const ij = await fetch(new URL('/ingredients-light.json', req.url)).then((r) => r.json());
      (ij.ingredients || []).forEach((x: { nm: string; cat: string }) => { catMap[x.nm] = x.cat; });
    } catch { /* 카테고리 없어도 NUTRI_MAP 직접 매핑은 동작 */ }
    const catOf = (ing: string) => catMap[ing];
    const catReliable = Object.keys(catMap).length > 0;  // 비면 '채소 없음' 단정 금지(P4)

    // 1) 최근 7일 모든 기록 → 자녀별 그룹
    const { data: rows, error: rErr } = await supabase.from('meal_logs')
      .select('child_id,parent_id,log_date,slot,ingredients,refused,note,texture,menus,place,ate_well,meal_time')
      .gte('log_date', since).lte('log_date', dAgo(1));   // 편지는 '어제까지' 확정 데이터로 평가 — 당일 입력이 편지를 바꾸지 않게
    if (rErr) throw rErr;

    const byChild: Record<string, Row[]> = {};
    (rows || []).forEach((r: Row) => { (byChild[r.child_id] ||= []).push(r); });

    let activeIds = Object.entries(byChild)
      .filter(([, rs]) => new Set(rs.map((r) => r.log_date)).size >= 3)
      .map(([id]) => id);

    // ── 휴면 엔진 — 마지막 끼니 기록일로 휴면 일수 계산(끼니 기록 기준). 활성 + 휴면(2~7일·이력 ≥3일)도 포함해 7일까지 복귀 편지 생성.
    const { data: histRows } = await supabase.from('meal_logs')
      .select('child_id,log_date').gte('log_date', dAgo(30)).lte('log_date', dAgo(1));
    const lastLogByChild: Record<string, string> = {};
    const histDays: Record<string, Set<string>> = {};
    (histRows || []).forEach((r: { child_id: string; log_date: string }) => {
      if (!lastLogByChild[r.child_id] || r.log_date > lastLogByChild[r.child_id]) lastLogByChild[r.child_id] = r.log_date;
      (histDays[r.child_id] ||= new Set()).add(r.log_date);
    });
    const dormancyOf = (cid: string): number => {
      const last = lastLogByChild[cid]; if (!last) return 99;
      return Math.round((Date.parse(today) - Date.parse(last)) / 86400000);
    };
    // 휴면 자녀(이력 ≥3일·휴면 2~7일)를 추가 — 현재 스킵되던 부모도 7일까지 복귀 편지(회유)
    const lapsedIds = Object.keys(histDays).filter((cid) =>
      !activeIds.includes(cid) && (histDays[cid]?.size || 0) >= 3 && dormancyOf(cid) >= 2 && dormancyOf(cid) <= 7);
    activeIds = [...activeIds, ...lapsedIds];

    if (childFilter) activeIds = activeIds.filter((id) => id === childFilter);
    if (!activeIds.length) {
      await supabase.from('cron_runs').update({ status: 'success', finished_at: new Date().toISOString(), processed_count: 0, error_count: 0 }).eq('id', runRow?.id);
      return NextResponse.json({ ok: true, processed: 0, note: '활성 자녀 없음' });
    }

    // 최근 3일 내 편지 → 라운드로빈 정렬 + 식단지문 스킵 + 시나리오 중복 회피 (편지 다양성 위해 2→3일로 확대)
    const { data: recentLetters } = await supabase.from('coach_letters')
      .select('child_id,letter_date,source_hash,letter,oneliner,context')
      .in('child_id', activeIds).gte('letter_date', dAgo(3))
      .order('letter_date', { ascending: false });
    type RecentLetter = { child_id: string; letter_date: string; source_hash: string | null; letter: string; oneliner: string | null; context: Record<string, unknown> | null };
    const lastLetter: Record<string, RecentLetter> = {};
    const recentScenarios: Record<string, string[]> = {};   // 최근 3일 편지가 쓴 scenarioId — 프레임 중복 회피
    const recentPlans: Record<string, CoachPlan[]> = {};     // ⭐ 최근 3일 편지의 구조화 계획(프레임·타깃·무브) — 상태 원장: 의미 중복 회피
    (recentLetters || []).forEach((l: RecentLetter) => {
      if (!lastLetter[l.child_id]) lastLetter[l.child_id] = l;  // 정렬상 첫 = 최신(재사용 판정용 — 오늘자 포함)
      if (l.letter_date >= today) return;   // 원장(중복 회피 이력)은 '과거' 편지만 — 오늘/미래(QA date 시뮬·force 재실행) 자기참조 차단
      const ctx = l.context as { scenarioId?: string; plan?: CoachPlan } | null;
      if (ctx?.scenarioId) (recentScenarios[l.child_id] ||= []).push(ctx.scenarioId);
      if (ctx?.plan?.signature) (recentPlans[l.child_id] ||= []).push(ctx.plan);
    });
    activeIds.sort((a, b) => (lastLetter[a]?.letter_date || '').localeCompare(lastLetter[b]?.letter_date || ''));

    // 자녀 메타 + 오늘 이미 생성된 질문(중복 회피)
    const { data: kids } = await supabase.from('children').select('id,parent_id,nickname,age_band,chronic_conditions,sex,birth_year,birth_month,height_cm,weight_kg').in('id', activeIds);
    type KidMeta = { parent_id: string; nickname: string; age_band: string; chronic: string | null; sex: string | null; birth_year: number | null; birth_month: number | null; height_cm: number | null; weight_kg: number | null };
    const kidMap: Record<string, KidMeta> = {};
    (kids || []).forEach((k: { id: string; parent_id: string; nickname: string; age_band: string; chronic_conditions: string | null; sex: string | null; birth_year: number | null; birth_month: number | null; height_cm: number | null; weight_kg: number | null }) => { kidMap[k.id] = { parent_id: k.parent_id, nickname: k.nickname, age_band: k.age_band, chronic: k.chronic_conditions, sex: k.sex, birth_year: k.birth_year, birth_month: k.birth_month, height_cm: k.height_cm, weight_kg: k.weight_kg }; });
    const { data: todayQs } = await supabase.from('daily_questions').select('child_id').eq('q_date', today).in('child_id', activeIds);
    const hasQToday = new Set((todayQs || []).map((q: { child_id: string }) => q.child_id));
    // 등원 여부 — daycare 컬럼 마이그레이션 전이면 에러(컬럼없음) → 전부 false로 안전 처리
    const daycareMap: Record<string, boolean> = {};
    const { data: dcRows, error: dcErr } = await supabase.from('children').select('id,daycare').in('id', activeIds);
    if (!dcErr) (dcRows || []).forEach((r: { id: string; daycare: boolean | null }) => { daycareMap[r.id] = !!r.daycare; });

    // 미입력 정보 권유용 — 체위(성장) 데이터가 있는 자녀(growth_logs 1행+). 테이블 없으면 안전 처리.
    const hasGrowth = new Set<string>();
    const latestGrowth: Record<string, { height_cm: number | null; weight_kg: number | null }> = {};   // BMI는 최신 체위로(care에서 갱신 가능)
    const { data: grRows, error: grErr } = await supabase.from('growth_logs').select('child_id,measured_on,height_cm,weight_kg').in('child_id', activeIds).order('measured_on', { ascending: false });
    if (!grErr) (grRows || []).forEach((r: { child_id: string; measured_on: string; height_cm: number | null; weight_kg: number | null }) => { hasGrowth.add(r.child_id); if (!latestGrowth[r.child_id]) latestGrowth[r.child_id] = { height_cm: r.height_cm, weight_kg: r.weight_kg }; });   // 정렬상 첫 = 최신

    // 미입력 프로필을 '돌아가며 하나씩' 부드럽게 권유(기대효과 1개 포함). 다그치지 않게 ~4일에 1번·로테이션.
    // 기록 공백(P9) 권유가 떠 있는 날엔 안 띄움(권유 중첩 방지). 체위=명확히 미입력, 만성=선택(없으면 안 넣어도 됨 문구).
    const profileNudgeFor = (cid: string): string | null => {
      const k = kidMap[cid]; if (!k) return null;
      const miss: string[] = [];
      if (!hasGrowth.has(cid) || !k.sex) miss.push('아직 키·몸무게(와 성별)를 안 알려주셨어요 — 한 번 넣어두시면 또래 대비 성장 곡선과 BMI를 함께 봐드릴 수 있어요');
      if (!k.chronic || !String(k.chronic).trim()) miss.push('혹시 변비·아토피·장 트러블처럼 신경 쓰이는 게 있다면 알려주시면, 그에 맞는 식이 방향을 코칭에 자연스럽게 반영해드려요(없으면 안 넣으셔도 돼요)');
      if (miss.length === 0) return null;
      const dayIndex = Math.floor(Date.parse(today) / 86400000);
      let h = 0; for (const c of cid) h = (h + c.charCodeAt(0)) % 997;
      if ((dayIndex + h) % 4 !== 0) return null;   // 약 4일에 한 번만
      return miss[(dayIndex + h) % miss.length];   // 여러 개면 날짜별로 돌아가며 하나씩
    };

    // 또래 대비 체격 밴드(BMI) — 간식 칼로리 방향(stance)용. 최신 growth_logs 체위 우선, 없으면 children 스냅샷.
    // WHO 표는 0~60개월 — 만 5세 초과는 60개월로 근사(홈 BMI 카드와 동일 한계). 값 없으면 null(=maintain).
    const bmiBandFor = (m: KidMeta, cid: string): BmiBand | null => {
      if (m.sex !== 'M' && m.sex !== 'F') return null;
      const g = latestGrowth[cid];
      const height = g?.height_cm ?? m.height_cm;   // 최신 측정 우선(care 갱신 반영), 없으면 onboarding 스냅샷
      const weight = g?.weight_kg ?? m.weight_kg;
      if (!(height && weight && m.birth_year && m.birth_month)) return null;
      const bmi = bmiOf(height, weight);
      if (bmi == null) return null;
      const [ty, tm] = today.split('-').map(Number);
      const ageMonths = (ty - m.birth_year) * 12 + (tm - m.birth_month);
      const pct = bmiPercentile(bmi, m.sex as Sex, ageMonths);
      return pct == null ? null : bmiBand(pct);
    };

    for (const cid of activeIds) {
      // maxDuration 전 안전 종료 — 남은 자녀는 다음 실행(오래된 순)이 이어받음
      if (Date.now() - runStart > TIME_BUDGET_MS) { skippedTime = activeIds.length - (processed + errors); break; }
      const meta = kidMap[cid];
      if (!meta) continue;
      try {
        const dormancy = dormancyOf(cid);
        // ── 휴면 복귀 경로 (dormancy 2~7) — 정상 편지(byDay≥3)와 별개. 과거 데이터 + 팁으로 따뜻한 컴백 + 회유 알림톡 D1/D3/D7.
        if (dormancy >= 2) {
          const { data: recent } = await supabase.from('meal_logs')
            .select('menus,refused,ate_well').eq('child_id', cid).gte('log_date', dAgo(14)).lte('log_date', dAgo(1));
          const fav: Record<string, number> = {}; const refs: string[] = [];
          (recent || []).forEach((r: { menus: string[] | null; refused: string | null; ate_well: boolean | null }) => {
            if (r.refused) refs.push(r.refused);
            if (r.ate_well !== false) (r.menus || []).forEach((m) => { const t = m.trim(); if (t) fav[t] = (fav[t] || 0) + 1; });
          });
          const favoriteFoods = Object.entries(fav).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([m]) => m);
          const { data: pastL } = await supabase.from('coach_letters').select('letter_date,letter').eq('child_id', cid).neq('letter_date', today).order('letter_date', { ascending: false }).limit(5);
          const pastLetters = (pastL || []).map((p: { letter_date: string; letter: string }) => ({ date: p.letter_date, letter: p.letter }));
          const daySeed = Math.floor(Date.parse(today) / 86400000);
          let cidHash = 0; for (let k = 0; k < cid.length; k++) cidHash = (cidHash * 31 + cid.charCodeAt(k)) >>> 0;
          const gen = await generateLetter({
            childName: meta.nickname, ageBand: meta.age_band,
            eatenCount: 0, reds: [], covered: [], missing: [],
            refused: [...new Set(refs)], favoriteFoods, pastLetters,
            chronicGuidance: chronicGuidanceText(meta.chronic),
            dormancyDays: dormancy, dormancyTip: pickTip(daySeed + cidHash),
          });
          if (gen.letter) {
            await supabase.from('coach_letters').upsert(
              { child_id: cid, parent_id: meta.parent_id, letter_date: today, letter: gen.letter, oneliner: gen.oneliner || null, source_hash: `reengage|${dormancy}`, context: { reengage: true, dormancyDays: dormancy, source: 'cron(reengage)' } },
              { onConflict: 'child_id,letter_date' });
            letters++; processed++;
            // 회유 알림톡 — dormancy 2/4/7 = D1/D3/D7. 매일 들어오는 사람(d≤1)은 분기에 안 옴.
            const stage = dormancy === 2 ? 1 : dormancy === 4 ? 2 : dormancy === 7 ? 3 : 0;
            if (stage && sensAdmin && meta.parent_id && !notifiedParents.has(meta.parent_id)) {
              notifiedParents.add(meta.parent_id);
              sendReengage({ admin: sensAdmin, parentId: meta.parent_id, childName: meta.nickname || '우리 아이', stage: stage as 1 | 2 | 3 })
                .then((r) => { if (r.ok) alimtalkSent++; }).catch((e) => console.error('[cron/coach] reengage', e instanceof Error ? e.message : e));
            }
          }
          continue;   // 정상 경로 스킵
        }
        const rs = [...(byChild[cid] || [])].sort((a, b) => b.log_date.localeCompare(a.log_date) || (b.slot || '').localeCompare(a.slot || ''));  // 최신순 — dedup이 최신 끼니를 남김
        const byDate: Record<string, string[]> = {};
        const allIng: string[] = []; const ref: string[] = []; const notes: string[] = [];
        const homeRef: string[] = []; const daycareRef: string[] = [];
        const recentMeals: LoggedFood[] = []; const seenFood = new Set<string>();
        const menuFreq: Record<string, number> = {};
        const favMenu: Record<string, number> = {};   // 잘 먹은(거부 아닌) 메뉴 빈도 — 푸드체이닝 출발점
        const favIngFreq: Record<string, number> = {};   // 잘 먹은(거부 아닌) 식재료 빈도 — 그래프 푸드브릿지 앵커
        const homeByDate: Record<string, string[]> = {}; const homeIng: string[] = [];   // 집 끼니만(place!=daycare) — 코칭 톤 보정용
        const todayMs = Date.parse(today);

        rs.forEach((r) => {
          (byDate[r.log_date] ||= []);
          const atHome = r.place !== 'daycare';   // home 또는 미상 = 집(부모 통제)
          (r.ingredients || []).forEach((i) => {
            byDate[r.log_date].push(i); allIng.push(i);
            if (r.ate_well !== false) favIngFreq[i] = (favIngFreq[i] || 0) + 1;   // 거부 아닌 식재료 = 그래프 브릿지 앵커
            if (atHome) { (homeByDate[r.log_date] ||= []).push(i); homeIng.push(i); }
            const daysAgo = Math.round((todayMs - Date.parse(r.log_date)) / 86400000);
            if (daysAgo <= 3 && !seenFood.has(i)) {
              seenFood.add(i);
              recentMeals.push({ food: i, menu: (r.menus || []).join('·') || undefined, place: (r.place as Place) || null, ateWell: r.ate_well, slot: r.slot || undefined, daysAgo });
            }
          });
          if (r.refused) { ref.push(r.refused); if (r.place === 'home') homeRef.push(r.refused); else if (r.place === 'daycare') daycareRef.push(r.refused); }
          if (r.note) notes.push(r.note);
          if (atHome) (r.menus || []).forEach((mn) => { const k = mn.replace(/\s/g, ''); if (k) menuFreq[k] = (menuFreq[k] || 0) + 1; });   // 집 메뉴만 — 기관 반복은 부모가 못 바꿈
          if (r.ate_well !== false) (r.menus || []).forEach((mn) => { const t = mn.trim(); if (t) favMenu[t] = (favMenu[t] || 0) + 1; });   // 거부 아닌 끼니 = 좋아하는 음식 후보
        });

        const byDay = Object.values(byDate).filter((a) => a.length);
        if (byDay.length < 3) { lowData++; continue; }
        const favoriteFoods = Object.entries(favMenu).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m]) => m);   // 잘 먹는 음식 top8 — 푸드체이닝
        // 검증된 푸드 브릿지: 잘 먹는 식재료 → 그래프상 사촌/궁합(아직 잘 안 먹는 것). 편지가 궁합을 지어내지 않게.
        const likedIng = Object.entries(favIngFreq).sort((a, b) => b[1] - a[1]).map(([n]) => n);
        const likedIngSet = new Set(likedIng);
        const bridgeFacts = (() => {
          const lines: string[] = [];
          for (const liked of likedIng.slice(0, 8)) {
            const nb = neighborsOf(liked).filter((n) => !likedIngSet.has(n.nm));   // 아직 잘 안 먹는 방향 = 도전 다리
            const br = nb.filter((n) => n.kind === 'bridge').slice(0, 3).map((n) => n.nm);
            const pr = nb.filter((n) => n.kind === 'pair').slice(0, 3).map((n) => n.nm);
            const parts = [...(br.length ? [`사촌 ${br.join('·')}`] : []), ...(pr.length ? [`궁합 ${pr.join('·')}`] : [])];
            if (parts.length) lines.push(`${liked} → ${parts.join(', ')}`);
            if (lines.length >= 5) break;
          }
          return lines.join(' / ');
        })();
        const sig = computeSignals(byDay, catOf);
        const reds = sig.filter((s) => s.level === 'red').map((s) => s.nutrient);
        const fg = computeFoodGroups(allIng, catOf);
        // 집 끼니만 평가 — 칭찬/코칭은 부모가 통제하는 집 기준(기관 급식 덕을 부모 칭찬으로 돌리지 않기)
        const homeDays = Object.values(homeByDate).filter((a) => a.length);
        const homeFg = computeFoodGroups(homeIng, catOf);
        const homeReds = homeDays.length ? computeSignals(homeDays, catOf).filter((s) => s.level === 'red').map((s) => s.nutrient) : [];
        const attends = !!daycareMap[cid];
        // 간식 평가(별도 간식 엔진) — 끼니와 분리해 초가공 모니터링·식사 간섭성·BMI 칼로리 방향·좋은 간식 추천. 편지에 부드럽게 합쳐짐(체중 단어 금지).
        const snackBand = bmiBandFor(meta, cid);
        const snackEval = evaluateSnacks({ rows: byChild[cid], band: snackBand, reds });
        const snackEvalText = snackEvalToPrompt(snackEval);
        const uniqRef = [...new Set(ref)];
        const ts = computeTimeseries(byDate, menuFreq, catOf, dAgo(1), { assertNoVeg: catReliable });   // 어제 앵커(평가 기준일)
        // 거부→수용 전환 감지(최근 28일) — 과거 거부했던 식재료를 이후 비거부로 먹기 시작 = '받아들이는 순간'. 코칭이 칭찬.
        try {
          const { data: trData } = await supabase.from('meal_logs')
            .select('log_date,ingredients,refused,ate_well').eq('child_id', cid).gte('log_date', dAgo(27)).lte('log_date', dAgo(1));
          const refFirst: Record<string, string> = {}; const accLast: Record<string, string> = {};
          const transitioned = new Set<string>();
          (trData || []).forEach((r: { log_date: string; ingredients: string[] | null; refused: string | null; ate_well: boolean | null }) => {
            String(r.refused || '').split(/[,，·]/).forEach((tok) => {   // 칩 콤마결합 분리 + ⭐ 메모/'조금 먹음'은 거부 아님 → 드롭(거짓 전환 차단). 음식 토큰 추출 안 함.
              const k = cleanRefusal(tok);
              if (k && (!refFirst[k] || r.log_date < refFirst[k])) refFirst[k] = r.log_date;
            });
            if (r.ate_well !== false) (r.ingredients || []).forEach((i) => { if (!accLast[i] || r.log_date > accLast[i]) accLast[i] = r.log_date; });
          });
          const recentAccCut = dAgo(7);   // 스테일 가드: 수용이 최근 7일 내일 때만 '전환'으로(5일 지난 카레가 매일 안 뜨게)
          let added = 0;
          for (const k of Object.keys(refFirst)) {
            if (added >= 2) break;
            // ⭐ 정규화된 식재료 '정확일치'만(부분문자열 X) + 거부보다 '명백히 이후 날' 수용 + 그 수용이 최근 7일 내
            if (accLast[k] && accLast[k] > refFirst[k] && accLast[k] >= recentAccCut) {
              ts.push(`전에 거부했던 '${k}'를 최근 다시 받아들이기 시작했어요(거부→수용 전환)`); added++; transitioned.add(k);
            }
          }
          // 정밀 재노출 — 거부 식재료별 (최근 한 달) 노출 횟수 + 마지막 노출 후 일수 → 재노출 적기 사실(숫자는 코드가 계산, LLM은 인용만)
          const offerCount: Record<string, number> = {}; const offerLast: Record<string, string> = {};
          (trData || []).forEach((r: { log_date: string; ingredients: string[] | null }) => {
            (r.ingredients || []).forEach((i) => { offerCount[i] = (offerCount[i] || 0) + 1; if (!offerLast[i] || r.log_date > offerLast[i]) offerLast[i] = r.log_date; });
          });
          const offerDaysAgo: Record<string, number> = {};
          Object.entries(offerLast).forEach(([nm, d]) => { offerDaysAgo[nm] = Math.round((todayMs - Date.parse(d)) / 86400000); });
          // 재노출도 정제된 진짜 거부만 + 이미 '전환 축하'된 식재료는 제외(축하 vs 재노출 모순 차단)
          const rxRefs = sanitizeRefusals(uniqRef).filter((f) => !transitioned.has(f));
          const rx = reexposurePick(rxRefs, offerCount, offerDaysAgo);
          if (rx && ts.length < 8) ts.push(rx.fact);   // 시계열 사실로 → 편지가 'N번·M일·적기'를 인용
        } catch { /* 전환 감지는 보조 — 실패해도 코칭 계속 */ }
        // P9 + 보고서: 최근 5일 중 기록된 날(결정론적) — 재사용 분기에서도 쓰도록 위로 끌어올림
        const RECENT_WINDOW = 5;
        const recentLoggedDays = Array.from({ length: RECENT_WINDOW }, (_, i) => dAgo(i + 1))
          .filter((d) => Object.prototype.hasOwnProperty.call(byDate, d)).length;
        // 일일 정량 지표 집계
        evalChildren++; eatenSum += new Set(allIng).size;
        if (reds.length) { redChildren++; reds.forEach((n) => { redFreq[n] = (redFreq[n] || 0) + 1; }); }
        if (recentLoggedDays < RECENT_WINDOW) gapChildren++;
        if (daycareMap[cid]) daycareChildren++;

        // 식단 지문 — 클라가 동일 해시면 재생성 없이 read (home page와 동일 공식)
        // ⭐ srcHash에 today 포함 — 날짜가 바뀌면 식단이 같아도 새 계획으로 재생성(어제 편지로 동결되지 않음·매일 새 편지)
        const srcHash = [...allIng].sort().join(',') + '|' + [...uniqRef].sort().join(',') + '|' + [...reds].sort().join(',') + '|' + notes.length + '|' + today;

        // 3) 편지: 직전 편지와 식단 지문이 같으면 LLM 스킵하고 내용 재사용 (비용·시간 절감)
        const prev = lastLetter[cid];
        let letter = '', oneliner = '';
        let scenarioId: string | null = null, scenarioLabel: string | null = null;   // 오늘의 코칭 시나리오(편지 다양성)
        let planCtx: CoachPlan | null = null;   // ⭐ 오늘의 구조화 계획(프레임·타깃·무브·시그니처) — 상태 원장(의미 중복 회피 이력)
        let coachRegen = false;   // 비중복 가드로 재생성됐는지(어드민 검증용)
        // 발행되면 고정: 오늘 편지가 이미 있으면(prev.letter_date===today) 재사용. srcHash에 today가 들어가 날짜가 바뀌면 새 계획으로 재생성(식단 동일해도 동결되지 않음). force만 강제 재생성.
        const reusedThis = !force && !!prev && !!prev.letter && (prev.source_hash === srcHash || prev.letter_date === today);
        if (reusedThis) {
          letter = prev!.letter; oneliner = prev!.oneliner || ''; reused++;
          const pctx = prev!.context as { scenarioId?: string; scenarioLabel?: string; plan?: CoachPlan } | null;
          scenarioId = pctx?.scenarioId ?? null;          // 재사용은 기존 시나리오·계획 보존(중복 이력 유지)
          scenarioLabel = pctx?.scenarioLabel ?? null;
          planCtx = pctx?.plan ?? null;
        } else {
          // 연속성용 과거 편지 (날짜 라벨만 — buildLetterUser가 순서로 변환). '오늘 이전'만(QA date 시뮬서 미래 편지 누수 차단).
          const { data: pastL } = await supabase.from('coach_letters')
            .select('letter_date,letter').eq('child_id', cid).lt('letter_date', today)
            .order('letter_date', { ascending: false }).limit(5);
          const pastLetters = (pastL || []).map((p: { letter_date: string; letter: string }) => ({ date: p.letter_date, letter: p.letter }));
          // 최근 60일 ICFQ 위험 누적(시나리오 선택 신호)
          let icfqRiskCount = 0;
          try {
            const { data: icfqRows } = await supabase.from('daily_questions')
              .select('answer,context').eq('child_id', cid).gte('q_date', dAgo(60)).not('answer', 'is', null);
            icfqRiskCount = (icfqRows || []).filter((r: { answer: string | null; context: { icfq?: string } | null }) => isIcfqRisk(r.context?.icfq, r.answer)).length;
          } catch { /* ICFQ 집계 실패해도 코칭은 계속 */ }
          // ⭐ 계획 산출(결정론) — 프레임 선택 + 타깃·무브 회전 + 시그니처 중복 회피(상태 원장 기반). 생성 전에 결정.
          const signals: CoachSignals = {
            timeseries: ts, reds, homeReds, missing: fg.missing, homeMissing: homeFg.missing,
            homeRefused: sanitizeRefusals(homeRef), daycareRefused: sanitizeRefusals(daycareRef), refused: sanitizeRefusals(uniqRef),
            notes, favoriteFoods, attendsDaycare: attends, ageBand: meta.age_band,
            recentLoggedDays, recentWindow: RECENT_WINDOW, icfqRiskCount,
          };
          const daySeed = Math.floor(Date.parse(today) / 86400000);
          let cidHash = 0; for (let k = 0; k < cid.length; k++) cidHash = (cidHash * 31 + cid.charCodeAt(k)) >>> 0;
          const precomputed = planFor({ signals, recentScenarioIds: recentScenarios[cid] || [], recentPlans: recentPlans[cid] || [], daySeed, cidHash });
          scenarioId = precomputed.scenario.id; scenarioLabel = precomputed.scenario.label; planCtx = precomputed.plan;
          // ⭐ 통합 작성기(크론·온디맨드 공유) — 계획 주입 → 생성 → 안전 재생성 → 어휘 유사도 재생성
          const base = {
            childName: meta.nickname, ageBand: meta.age_band,
            eatenCount: new Set(allIng).size, reds, covered: fg.covered, missing: fg.missing,
            notes, refused: sanitizeRefusals(uniqRef), favoriteFoods, homeRefused: sanitizeRefusals(homeRef), daycareRefused: sanitizeRefusals(daycareRef),
            timeseries: ts, attendsDaycare: attends, pastLetters,   // timeseries=원본 ts(composeLetter가 최종 시나리오 기준 필터)
            recentWindowDays: RECENT_WINDOW, recentLoggedDays,
            homeMissing: homeFg.missing, homeReds, homeDays: homeDays.length,
            chronicGuidance: chronicGuidanceText(meta.chronic),
            bridgeFacts, snackEval: snackEvalText,
            profileNudge: recentLoggedDays >= RECENT_WINDOW ? profileNudgeFor(cid) : null,
          };
          const detInput = [...ts, ...notes, ...uniqRef].join(' ');
          const out = await composeLetter({ base, precomputed, detInput, daySeed, cidHash });
          letter = out.letter; oneliner = out.oneliner; coachRegen = out.coachRegen;
        }
        if (letter) {
          // QA용 "우리 판단" 스냅샷 — 어드민 쓰레드에서 이 근거로 생성됐음을 보여줌
          const letterCtx = {
            reds, covered: fg.covered, missing: fg.missing, timeseries: ts,
            homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)],
            // P10 분리 근거 — 집 끼니만의 부족(칭찬·코칭은 이 기준). 어드민에서 '전체 OK인데 집은 부족'을 검증.
            homeMissing: homeFg.missing, homeReds, homeDays: homeDays.length,
            eatenCount: new Set(allIng).size, attendsDaycare: !!daycareMap[cid], notesCount: notes.length,
            source: reusedThis ? 'cron(재사용)' : (force ? 'cron(force)' : 'cron'), model: 'haiku-4-5',
            scenarioId, scenarioLabel,   // 오늘의 코칭 시나리오(편지 다양성·중복 회피 이력)
            plan: planCtx,   // ⭐ 구조화 계획(프레임·타깃·무브·시그니처) — 다음날 의미 중복 회피 이력(상태 원장)
            coachRegen,   // 비중복 가드로 재생성됐는지(최근 편지와 유사도 ≥0.45)
            snack: snackEval?.summary || null,   // 간식 엔진 판단 스냅샷(어드민 검증)
          };
          await supabase.from('coach_letters').upsert(
            { child_id: cid, parent_id: meta.parent_id, letter_date: today, letter, oneliner: oneliner || null, source_hash: srcHash, context: letterCtx },
            { onConflict: 'child_id,letter_date' }
          );
          letters++;
          // 새로 생성된 편지면 2줄 미리보기 알림톡(부모당 1건). env·전화번호·동의·템플릿 승인 전까진 자동 무동작.
          if (sensAdmin && !reusedThis && meta.parent_id && !notifiedParents.has(meta.parent_id)) {
            notifiedParents.add(meta.parent_id);
            sendCoachLetterPreview({ admin: sensAdmin, parentId: meta.parent_id, childName: meta.nickname || '우리 아이', preview: oneliner || letter.slice(0, 80) })
              .then((r) => { if (r.ok) alimtalkSent++; })
              .catch(() => {});
          }
        }

        // 3-2) 오늘의 질문 — 아직 없을 때만 (답변 덮어쓰기 방지)
        if (!hasQToday.has(cid)) {
          const { data: pastQ } = await supabase.from('daily_questions')
            .select('question,answer').eq('child_id', cid).neq('q_date', today)
            .order('q_date', { ascending: false }).limit(5);
          const pastQA = (pastQ || []).map((p: { question: string; answer: string | null }) => ({ q: p.question, a: p.answer || '' }));
          // 2주 주기 = ICFQ 위험 스크리너(drip), 그 외 = 일반 LLM 질문
          const icfq = icfqForDate(today);
          let q: { question: string; topic?: string | null; chips?: string[] | null };
          let icfqKey: string | null = null;
          if (icfq) { q = { question: icfq.q, topic: 'icfq', chips: icfq.chips }; icfqKey = icfq.key; }
          else q = await generateQuestion({
            childName: meta.nickname, ageBand: meta.age_band,
            recentMeals, homeRefused: sanitizeRefusals(homeRef), daycareRefused: sanitizeRefusals(daycareRef), refused: sanitizeRefusals(uniqRef), attendsDaycare: daycareMap[cid], pastQA,
            topicHint: pickQuestionTopic(today, [...cid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0)).hint,   // ⭐ 결정론 주제 로테이션(완식 반복 방지)
          });
          if (q.question) {
            const qCtx = { recentMeals: recentMeals.slice(0, 12), homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)], attendsDaycare: !!daycareMap[cid], topic: q.topic || null, source: 'cron', icfq: icfqKey };
            await supabase.from('daily_questions').upsert(
              { child_id: cid, parent_id: meta.parent_id, q_date: today, question: q.question, topic: q.topic || null, chips: q.chips || null, context: qCtx },
              { onConflict: 'child_id,q_date' }
            );
            questions++;
          }
        }
        processed++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[cron/coach] child', cid, msg);
        errors++;
        issues.push(`${kidMap[cid]?.nickname || cid.slice(0, 8)}: 생성 실패 — ${msg}`.slice(0, 160));
      }
    }

    // 병원 차트형 기간 요약 — 현재 주·월·분기·반기·연을 최근 365일 기록으로 재계산해 upsert(멱등).
    // 분기/반기/연도 '현재 기간 전체'를 정확히 집계하려면 1년치가 필요(자녀당 끼니 행수는 적어 부담 작음). 편지 로직과 분리.
    try {
      const { data: wide } = await supabase.from('meal_logs')
        .select('child_id,log_date,ingredients,refused,ate_well,duration_min')
        .in('child_id', activeIds).gte('log_date', dAgo(365)).lte('log_date', dAgo(1));
      const byKid: Record<string, ProgressRow[]> = {};
      (wide || []).forEach((r: ProgressRow & { child_id: string }) => { (byKid[r.child_id] ||= []).push(r); });
      // 현재 기간 키 + 그 키에 속하는지 판정 함수 (한 끼니가 여러 기간에 동시 집계됨)
      const PERIODS: { type: string; key: string; in: (d: string) => boolean }[] = [
        { type: 'week', key: isoWeekKey(today), in: (d) => isoWeekKey(d) === isoWeekKey(today) },
        { type: 'month', key: monthKey(today), in: (d) => monthKey(d) === monthKey(today) },
        { type: 'quarter', key: quarterKey(today), in: (d) => quarterKey(d) === quarterKey(today) },
        { type: 'half', key: halfKey(today), in: (d) => halfKey(d) === halfKey(today) },
        { type: 'year', key: yearKey(today), in: (d) => yearKey(d) === yearKey(today) },
      ];
      const ups: { child_id: string; period_type: string; period_key: string; metrics: object; updated_at: string }[] = [];
      const nowIso = new Date().toISOString();
      for (const cid of activeIds) {
        const rs = byKid[cid] || [];
        for (const p of PERIODS) {
          const rows = rs.filter((r) => p.in(r.log_date));
          if (rows.length) ups.push({ child_id: cid, period_type: p.type, period_key: p.key, metrics: periodMetrics(rows), updated_at: nowIso });
        }
      }
      if (ups.length) await supabase.from('period_summaries').upsert(ups, { onConflict: 'child_id,period_type,period_key' });
    } catch (e) { console.warn('[cron/coach] period_summaries skip:', e instanceof Error ? e.message : e); }

    const topReds = Object.entries(redFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n}(${c})`);
    await supabase.from('cron_runs').update({
      status: errors > 0 || skippedTime > 0 ? 'partial' : 'success', finished_at: new Date().toISOString(),
      processed_count: processed, error_count: errors,
      meta: {
        letters, questions, reused, active: activeIds.length, skippedTime, lowData,
        evalChildren, avgEaten: evalChildren ? Math.round(eatenSum / evalChildren) : 0,
        redChildren, gapChildren, daycareChildren, topReds,
        backfill,   // 야간 미매핑 보강 지표(빈 행 백필·사전학습)
        issues: issues.slice(0, 30), durationMs: Date.now() - runStart,
      },
    }).eq('id', runRow?.id);

    // 의존 배치 묶기(하비 크론 2개 한도) — 코칭 편지(coach_letters.context)가 갱신된 직후 팁 랭킹을 같은 배치에서 재계산.
    // tip-ranking이 coach 산출물에 의존하므로 별도 크론(30분 뒤)이 아니라 여기서 체이닝 → 타이밍 의존 제거.
    let tipRank: unknown = null;
    try {
      const auth = req.headers.get('authorization');
      const tr = await fetch(new URL('/api/cron/tip-ranking', req.url), { headers: auth ? { authorization: auth } : {} });
      tipRank = await tr.json().catch(() => null);
    } catch (e) { console.error('[cron/coach] tip-ranking chain', e instanceof Error ? e.message : e); }

    return NextResponse.json({ ok: true, processed, errors, letters, questions, reused, skippedTime, alimtalkSent, alimtalkReady: alimtalkReady(), active: activeIds.length, tipRank, duration_ms: Date.now() - runStart });
  } catch (e: unknown) {
    await supabase.from('cron_runs').update({
      status: 'failure', finished_at: new Date().toISOString(),
      meta: { error: e instanceof Error ? e.message : String(e) },
    }).eq('id', runRow?.id);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
