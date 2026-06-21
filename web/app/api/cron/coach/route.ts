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
import { revalidateTag } from 'next/cache';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { sendCoachLetterPreview, sendReengage, alimtalkReady } from '@/lib/sens';
import { computeSignals, computeFoodGroups, computeTimeseries, computeGroupSignals, groupOf } from '@/lib/nutrition';
import { generateLetter, generateOnboardingLetter, generateQuestion, icfqForDate, isIcfqRisk, pickTip, pickQuestionTopic, sanitizeRefusals, cleanRefusal, composeLetter, planFor, structuredTip, metaInputNudge, letterSimilarity, mirrorCooldownDue, resetUsage, getUsage, SLOT_LABEL, SNACK_CHANNEL, STRUCTURAL_FRAMES, NO_FOOD_ACTION_FRAMES, type CoachPlan, type StructuredSig, type Place, type LoggedFood } from '@/lib/coach';
import { periodMetrics, isoWeekKey, monthKey, quarterKey, halfKey, yearKey, type ProgressRow } from '@/lib/progress';
import { kstToday, kstDateNDaysAgo } from '@/lib/date';
import { backfillUnmappedMenus, type BackfillResult } from '@/lib/remapMenus';
import { SCENARIOS, type CoachSignals } from '@/lib/coachScenarios';
import { kstDow, addDaysStr, runWeeklyPlanning, planFromWeekly, healAnchor, DEFAULT_LEDGER, anchorOverrideAllowed, leverForUnit, enrichWeeklyPlan, pickPlanSlot, type EnrichContext, type WeeklyAnchor, type WeeklyArc, type WeeklyLedger, type WeeklyBudget } from '@/lib/coachWeekly';
import { chronicGuidanceText } from '@/lib/coachChronic';
import { compileFacts } from '@/lib/coachFacts';
import { UNITS, UNIT_IDS, TH, type CRow, type UnitId, type Goal, type ProbeAnswer, type ProgressRow as CurriculumProgressRow } from '@/lib/curriculumUnits';
import { buildCandSignals, parseProbeAnswers, pickUnitProbe } from '@/lib/coachDaily';
import { advanceProgress, blankRow, goalsOf, normalizeGoals, type DailyDecision } from '@/lib/curriculum';
import { buildBrainContext, pickActionByBrain, nutritionMirrorFromInput, type BrainAction } from '@/lib/coachBrain';   // ⭐ 두뇌 선택+검수(시나리오는 LLM, 음식추천은 검수)
import { reexposurePick } from '@/lib/reexposure';
import { buildRecoFacts, buildIngredientPool, groupOfIngredient, coldStartSeed, STAPLE_FORMS, type FreqMap } from '@/lib/coachRecos';
import { quantifyPreferences, acceptanceLevel, confidentLiked as confidentLikedFrom, dislikedFoods, type PrefRow } from '@/lib/preferenceQuantification';   // ⭐ 신호포착(이사님 2026-06-19) — 미상을 liked로 오판 차단(확신 신호=완식 반복+Wilson만 liked)
import { getIngredientsLight, getRecipeFreq, warmGraphFromSql } from '@/lib/graphSource';   // ⭐ JSON 격리(handoff §4) + SQL warm(#2)
import { aggregateUsage } from '@/lib/llmCost';   // ⭐ LLM 사용량 계측(유지비용 실측)
import { evaluateSnacks, snackEvalToPrompt } from '@/lib/snack';
import { bmiOf, bmiPercentile, bmiBand, growthTracking, growthTrackToPhrase, type Sex, type BmiBand, type GrowthTrack } from '@/lib/growth-reference';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Hobby plan 한도

const TIME_BUDGET_MS = 50_000; // maxDuration(60s) 전 안전 종료 — SIGKILL 회피해 cron_runs 정상 마감
// 평일 = LLM 1콜(편지)/자녀 — 시간 예산 안에서 오래된 순으로 처리(초과분은 다음 실행이 이어받음).
//   일요일 = Sonnet 1콜(차주 닻 종합)/자녀.
// ⭐ 6-A(이사님 2026-06-15) — 진척 신호 인프라: 잠긴 타깃이 3주 연속 '집에서 받아들임 0'이면 이번 주 축 전환.
const STALL_PIVOT_WEEKS = 3;   // 연속 진전0 임계(3주째 닻 종합에서 전환)
const STALL_LOOKBACK = 4;      // 직전 닻 조회 수(스톨 streak 산출용)

type Row = {
  child_id: string; parent_id: string | null; log_date: string; slot: string | null;
  ingredients: string[] | null; refused: string | null; note: string | null; question?: string | null;
  texture: string | null; menus: string[] | null; place: string | null; ate_well: boolean | null;
  acceptance_level: number | null;   // ⭐ 수용 5단계(0~4) — 있으면 선호계량화가 granular로, 없으면 ate_well 폴백
  meal_time: number | null; autonomy: string | null; environment: string | null; duration_min: number | null;
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
    try {   // ⭐ graphSource 경유(handoff §4·c) — 런타임 fetch 제거(정적 /public, 내용 동일·네트워크 의존 제거)
      const ij = getIngredientsLight() as { ingredients?: { nm: string; cat: string }[] };
      (ij.ingredients || []).forEach((x) => { catMap[x.nm] = x.cat; });
    } catch { /* 카테고리 없어도 NUTRI_MAP 직접 매핑은 동작 */ }
    // 또래 급식 빈도 레시피(식재료 → 가장 많이 쓰이는 실존 음식) — 추천 근거화용. 실패해도 kit-matrix 폴백.
    let freqMap: FreqMap = {};
    try { freqMap = getRecipeFreq() as FreqMap; } catch { /* kit-matrix 폴백 */ }
    const catOf = (ing: string) => catMap[ing];
    const catReliable = Object.keys(catMap).length > 0;  // 비면 '채소 없음' 단정 금지(P4)

    // 1) 최근 7일 모든 기록 → 자녀별 그룹
    const { data: rows, error: rErr } = await supabase.from('meal_logs')
      .select('child_id,parent_id,log_date,slot,ingredients,refused,note,question,texture,menus,place,ate_well,acceptance_level,meal_time,autonomy,environment,duration_min')
      .gte('log_date', since).lte('log_date', dAgo(1));   // 편지는 '어제까지' 확정 데이터로 평가 — 당일 입력이 편지를 바꾸지 않게 · autonomy·environment는 이전에 select 안 해 0% 반영이던 버그 수정(구조화 입력 코칭 반영)
    if (rErr) throw rErr;

    const byChild: Record<string, Row[]> = {};
    (rows || []).forEach((r: Row) => { (byChild[r.child_id] ||= []).push(r); });

    const minDays = Math.max(1, parseInt(qp.get('minDays') || '1', 10) || 1);   // ⭐ 활성 게이트(직전 7일 중 N일 기록). 기본 1 — 신규 가입자도 처리해 온보딩 편지 발행(<3일은 loop서 온보딩 분기). 과거 기본 3은 새 유저 3일 무발행 갭이라 1로 내림.
    let activeIds = Object.entries(byChild)
      .filter(([, rs]) => new Set(rs.map((r) => r.log_date)).size >= minDays)
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
    // ⭐ 주말 미기록 ≠ 휴면(적대감사 S4) — 갭이 토·일로만 구성되면 회유하지 않는다(평일 기록 가정이 일·월마다 오발송되던 버그).
    const gapHasWeekday = (cid: string): boolean => {
      const last = lastLogByChild[cid]; if (!last) return true;
      for (let t = Date.parse(last) + 86400000; t < Date.parse(today); t += 86400000) {
        const dw = kstDow(new Date(t).toISOString().slice(0, 10));
        if (dw !== 0 && dw !== 6) return true;
      }
      return false;
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
    const recentSnackDates: Record<string, string[]> = {};   // ⭐ 간식 멘트를 노출한 최근 날짜 — 쿨다운(매일 '과자 대신…' 반복 방지)
    const recentMirrorShown: Record<string, boolean[]> = {};  // ⭐ 영양거울 노출 여부 이력(최신부터·2026-06-20) — '어린이집 덕에…' 출현빈도 격일화 쿨다운
    const recentWeekKeys: Record<string, string[]> = {};     // ⭐ 최근 편지가 쓴 주간 닻 week_key — '이번 주 첫 편지(intro)' 판정
    const prevArcStage: Record<string, string | null> = {};  // ⭐ 직전 편지의 아크 단계 — reinforce 이틀 연속 방지
    const recentRecoIng: Record<string, string[]> = {};   // ⭐ 최근 편지가 추천한 '식재료'(A 경로) — 주간 풀 일일 회전(같은 식재료 연속 추천 방지)
    const recentBrainUseFood: Record<string, boolean[]> = {};   // ⭐ A-07 — 최근 편지가 음식을 다뤘는지(useFood) 이력(최신부터) — 연속 food날 캡
    const recentGrowthDates: Record<string, string[]> = {};   // ⭐ E-09 — 성장 거울 노출 날짜(격주 케이던스·2주연속금지)
    const curriculumHist: Record<string, Array<{ date: string; unit: UnitId; mode: string }>> = {};   // ⭐ F-09 입력 — 최근 편지가 코칭한 유닛(coachedDays/Yesterday/pivots)
    (recentLetters || []).forEach((l: RecentLetter) => {
      if (!lastLetter[l.child_id]) lastLetter[l.child_id] = l;  // 정렬상 첫 = 최신(재사용 판정용 — 오늘자 포함)
      if (l.letter_date >= today) return;   // 원장(중복 회피 이력)은 '과거' 편지만 — 오늘/미래(QA date 시뮬·force 재실행) 자기참조 차단
      const ctx = l.context as { scenarioId?: string; plan?: CoachPlan; snackShown?: boolean; mirrorShown?: boolean; growthShown?: boolean; recoIng?: string | null; weekly?: { weekKey?: string; arc?: { stage?: string } | null } | null; brain?: { useFood?: boolean } | null; curriculum?: { unit?: string; mode?: string } | null } | null;
      if (typeof ctx?.recoIng === 'string' && ctx.recoIng) (recentRecoIng[l.child_id] ||= []).push(ctx.recoIng);
      if (typeof ctx?.brain?.useFood === 'boolean') (recentBrainUseFood[l.child_id] ||= []).push(ctx.brain.useFood);   // ⭐ A-07
      if (ctx?.growthShown) (recentGrowthDates[l.child_id] ||= []).push(l.letter_date);   // ⭐ E-09
      if (ctx?.curriculum?.unit) (curriculumHist[l.child_id] ||= []).push({ date: l.letter_date, unit: ctx.curriculum.unit as UnitId, mode: ctx.curriculum.mode || '' });   // ⭐ F-09 입력
      if (!(l.child_id in prevArcStage)) prevArcStage[l.child_id] = ctx?.weekly?.arc?.stage ?? null;   // 정렬상 첫 과거 편지 = 직전
      if (ctx?.weekly?.weekKey) (recentWeekKeys[l.child_id] ||= []).push(ctx.weekly.weekKey);
      if (ctx?.scenarioId) (recentScenarios[l.child_id] ||= []).push(ctx.scenarioId);
      if (ctx?.plan?.signature) (recentPlans[l.child_id] ||= []).push(ctx.plan);
      if (ctx?.snackShown) (recentSnackDates[l.child_id] ||= []).push(l.letter_date);
      (recentMirrorShown[l.child_id] ||= []).push(!!ctx?.mirrorShown);   // ⭐ 거울 노출 이력(최신부터) — 슬롯 유무 무관히 매 과거편지 1엔트리(쿨다운 격일화)
    });
    activeIds.sort((a, b) => (lastLetter[a]?.letter_date || '').localeCompare(lastLetter[b]?.letter_date || ''));

    // ⭐ 추천-무시 풀 배제(이사님 2026-06-21) — 최근 14일 추천한 식재료(recoIng + 주간슬롯) 이력. 식단(meal_logs)에 한 번도 안 나오면 다음 주간계획 풀에서 배제, 식단 등장 시 자동 복귀(served에 들어감).
    const { data: letters14 } = await supabase.from('coach_letters')
      .select('child_id,letter_date,context').in('child_id', activeIds).gte('letter_date', dAgo(14)).lt('letter_date', today);
    const reco14: Record<string, Set<string>> = {};
    (letters14 || []).forEach((l: { child_id: string; context: Record<string, unknown> | null }) => {
      const c = l.context as { recoIng?: string | null; planSlot?: { ingredient?: string } | null } | null;
      const s = (reco14[l.child_id] ||= new Set<string>());
      if (c?.recoIng) s.add(c.recoIng);
      if (c?.planSlot?.ingredient) s.add(c.planSlot.ingredient);
    });

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
    const firstGrowth: Record<string, { height_cm: number | null; weight_kg: number | null; measured_on: string }> = {};   // ⭐ E-01 — 가장 오래된 측정(성장곡선 추종 기준 채널)
    const latestGrowthDate: Record<string, string> = {};
    const { data: grRows, error: grErr } = await supabase.from('growth_logs').select('child_id,measured_on,height_cm,weight_kg').in('child_id', activeIds).order('measured_on', { ascending: false });
    if (!grErr) (grRows || []).forEach((r: { child_id: string; measured_on: string; height_cm: number | null; weight_kg: number | null }) => {
      hasGrowth.add(r.child_id);
      if (!latestGrowth[r.child_id]) { latestGrowth[r.child_id] = { height_cm: r.height_cm, weight_kg: r.weight_kg }; latestGrowthDate[r.child_id] = r.measured_on; }   // 정렬 desc → 첫 = 최신
      firstGrowth[r.child_id] = { height_cm: r.height_cm, weight_kg: r.weight_kg, measured_on: r.measured_on };   // 매 행 덮어씀 → 마지막 = 가장 오래된(기준 채널)
    });

    // ⭐ F-02 — 자녀별 커리큘럼 진척(curriculum_progress) 일괄 prefetch. 테이블/컬럼 미적용이면 빈 맵 degrade(안전).
    const progByChild: Record<string, Partial<Record<UnitId, CurriculumProgressRow>>> = {};
    try {
      const { data: progRows } = await supabase.from('curriculum_progress')
        .select('child_id,unit_id,status,step,evidence,started_at,mastered_at,last_signal_at,stop_reason,relapse_count').in('child_id', activeIds);
      (progRows || []).forEach((r: CurriculumProgressRow & { child_id: string }) => { (progByChild[r.child_id] ||= {})[r.unit_id as UnitId] = r; });
    } catch { /* 테이블 미존재 — 진척 미배선 degrade */ }

    // 미입력 프로필을 '돌아가며 하나씩' 부드럽게 권유(기대효과 1개 포함). 다그치지 않게 ~4일에 1번·로테이션.
    // 기록 공백(P9) 권유가 떠 있는 날엔 안 띄움(권유 중첩 방지). 체위=명확히 미입력, 만성=선택(없으면 안 넣어도 됨 문구).
    const profileNudgeFor = (cid: string): string | null => {
      const k = kidMap[cid]; if (!k) return null;
      const dayIndex = Math.floor(Date.parse(today) / 86400000);
      let h = 0; for (const c of cid) h = (h + c.charCodeAt(0)) % 997;
      // ⭐ #7 macro input-starvation 해소(이사님 2026-06-20) — 성장데이터(키·몸무게) 없으면 macro 트랙(저체중→고기류↑·이사님 5조건)이 영영 비활성.
      //   성장 권유를 우선·더 자주(매 3일)·macro 효과 명시로 데이터 유입을 유도한다. 들어오면(hasGrowth) 자동 중단(잔소리 방지).
      if ((!hasGrowth.has(cid) || !k.sex) && (dayIndex + h) % 3 === 0)
        return '아직 키·몸무게(와 성별)를 안 알려주셨어요 — 한 번 넣어두시면 또래 대비 성장 곡선·BMI를 함께 봐드리고, 필요하면 단백·지방(고기·계란 등)을 채울 음식도 맞춤으로 권해드려요';
      if ((!k.chronic || !String(k.chronic).trim()) && (dayIndex + h) % 4 === 0)
        return '혹시 변비·아토피·장 트러블처럼 신경 쓰이는 게 있다면 알려주시면, 그에 맞는 식이 방향을 코칭에 자연스럽게 반영해드려요(없으면 안 넣으셔도 돼요)';
      return null;
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

    // ⭐ graphSource SQL warm(handoff #2) — SQL이 단일 진실(플래그 졸업 2026-06-21). 매 실행 자녀 루프 전 1회 ingredient_edges⋈ingredients(id→name)로
    //   추천 캐시를 SQL로 교체(야간 학습 강화가 재배포 없이 편지에 반영). SQL 빈약/실패 시 warmGraphFromSql이 자동 JSON 스냅샷 유지(safe degrade).
    try {
      const w = await warmGraphFromSql(supabase);
      if (w.ok) console.log(`[cron/coach] graph warmed from SQL: ${w.edges} edges, ${w.cells} dishes`);
      else issues.push(`graph warm skip(JSON 유지): ${w.reason}`.slice(0, 120));
    } catch (e) { console.warn('[cron/coach] graph warm error', e instanceof Error ? e.message : e); }

    for (const cid of activeIds) {
      // maxDuration 전 안전 종료 — 남은 자녀는 다음 실행(오래된 순)이 이어받음
      if (Date.now() - runStart > TIME_BUDGET_MS) { skippedTime = activeIds.length - (processed + errors); break; }
      const meta = kidMap[cid];
      if (!meta) continue;
      resetUsage();   // ⭐ 이 자녀의 LLM 사용량 계측 시작(편지·질문·주간 콜 전부 포함, finally에서 합산)
      try {
        const dormancy = dormancyOf(cid);
        // ── 휴면 복귀 경로 (dormancy 2~7, 단 주말로만 이뤄진 갭은 제외 — S4) — 정상 편지(byDay≥3)와 별개.
        if (dormancy >= 2 && gapHasWeekday(cid)) {
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
        const allIng: string[] = []; const ref: string[] = []; const notes: string[] = []; const parentQuestions: string[] = [];   // ⭐ 부모 질문(편지 최우선·이사님 2026-06-20)
        const homeRef: string[] = []; const daycareRef: string[] = [];
        const recentMeals: LoggedFood[] = []; const seenFood = new Set<string>();
        const menuFreq: Record<string, number> = {};
        const favMenu: Record<string, number> = {};   // 잘 먹은(거부 아닌) 메뉴 빈도 — 푸드체이닝 출발점
        const favIngFreq: Record<string, number> = {};   // 잘 먹은(거부 아닌) 식재료 빈도 — 그래프 푸드브릿지 앵커
        const servedHomeFreq: Record<string, number> = {};   // ⭐ 자주 차려진 식재료(집·수용도 무관) — Tier2 콜드스타트 앵커
        const homeByDate: Record<string, string[]> = {}; const homeIng: string[] = [];   // 집 끼니만(place!=daycare) — 코칭 톤 보정용
        const todayMs = Date.parse(today);

        rs.forEach((r) => {
          (byDate[r.log_date] ||= []);
          const atHome = r.place !== 'daycare';   // home 또는 미상 = 집(부모 통제)
          (r.ingredients || []).forEach((i) => {
            byDate[r.log_date].push(i); allIng.push(i);
            if (r.ate_well !== false && atHome) favIngFreq[i] = (favIngFreq[i] || 0) + 1;   // ⭐ 1-B(이사님 2026-06-15) 집 끼니만 — 기관 급식에서 잘 먹은 식재료를 부모의 '잘 먹는 것'(사촌 시드)으로 착각 금지. menuFreq와 일관(거부 아닌 식재료 = 그래프 브릿지 앵커)
            if (atHome) { servedHomeFreq[i] = (servedHomeFreq[i] || 0) + 1; (homeByDate[r.log_date] ||= []).push(i); homeIng.push(i); }   // ⭐ 자주 차려진 음식(수용도 무관·집 빈도) — Tier2 콜드스타트 앵커
            const daysAgo = Math.round((todayMs - Date.parse(r.log_date)) / 86400000);
            if (daysAgo <= 3 && !seenFood.has(i)) {
              seenFood.add(i);
              recentMeals.push({ food: i, menu: (r.menus || []).join('·') || undefined, place: (r.place as Place) || null, ateWell: r.ate_well, slot: r.slot || undefined, daysAgo });
            }
          });
          if (r.refused) { ref.push(r.refused); if (r.place === 'home') homeRef.push(r.refused); else if (r.place === 'daycare') daycareRef.push(r.refused); }
          // ⭐ 부모 질문(이사님 2026-06-20·편지 최우선) — (1) 전용 question 컬럼(끼니별 질문 입력) 우선 (2) note에 '?'로 남긴 것도 폴백. 최근 ≤2일만(오래된 질문 반복 답 방지).
          const _qAgo = Math.round((todayMs - Date.parse(r.log_date)) / 86400000);
          const _pushQ = (q?: string | null) => { const t = (q || '').trim(); if (_qAgo <= 2 && t.length >= 2 && parentQuestions.length < 5 && !parentQuestions.includes(t)) parentQuestions.push(t); };
          if (r.question) _pushQ(r.question);                                         // 전용 컬럼 = 명시 질문('?' 불요)
          if (r.note) { notes.push(r.note); if (/[?？]/.test(r.note)) _pushQ(r.note); }   // note 폴백 = '?' 포함 시만
          if (atHome) (r.menus || []).forEach((mn) => { const k = mn.replace(/\s/g, ''); if (k) menuFreq[k] = (menuFreq[k] || 0) + 1; });   // 집 메뉴만 — 기관 반복은 부모가 못 바꿈
          if (r.ate_well !== false && atHome) (r.menus || []).forEach((mn) => { const t = mn.trim(); if (t) favMenu[t] = (favMenu[t] || 0) + 1; });   // ⭐ 5-A(이사님 2026-06-15) 집 끼니만 — 기관 급식에서 잘 먹은 메뉴를 부모 칭찬 근거(favoriteFoods)로 돌리지 않기(거부 아닌 끼니 = 좋아하는 음식 후보)
        });

        const byDay = Object.values(byDate).filter((a) => a.length);
        // ⭐ 온보딩 편지(기록<3일) — 맞춤 코칭 전 신규 가입자에게 입력 칭찬+가벼운 영양평가+안내+팁(이전엔 여기서 continue로 무발행=3일 침묵 갭).
        if (byDay.length < 3) {
          try {
            const obFg = computeFoodGroups(allIng, catOf);
            const obSeed = Math.floor(Date.parse(today) / 86400000);
            let obHash = 0; for (let k = 0; k < cid.length; k++) obHash = (obHash * 31 + cid.charCodeAt(k)) >>> 0;
            const { data: obPast } = await supabase.from('coach_letters').select('letter_date,letter').eq('child_id', cid).neq('letter_date', today).order('letter_date', { ascending: false }).limit(3);
            const ob = await generateOnboardingLetter({
              childName: meta.nickname, ageBand: meta.age_band, loggedDays: byDay.length,
              foods: [...new Set(allIng)].slice(0, 14), covered: obFg.covered, lean: obFg.missing, tip: pickTip(obSeed + obHash),
              pastLetters: (obPast || []).map((p: { letter_date: string; letter: string }) => ({ date: p.letter_date, letter: p.letter })),
            });
            if (ob.letter) {
              await supabase.from('coach_letters').upsert(
                { child_id: cid, parent_id: meta.parent_id, letter_date: today, letter: ob.letter, oneliner: ob.oneliner || null, source_hash: `onboarding|${byDay.length}`, context: { onboarding: true, loggedDays: byDay.length, covered: obFg.covered, lean: obFg.missing, source: 'cron(onboarding)' } },
                { onConflict: 'child_id,letter_date' });
              letters++; processed++;
            }
          } catch (e) { console.warn('[cron/coach] onboarding skip:', e instanceof Error ? e.message : e); }
          lowData++; continue;
        }
        const favEntries = Object.entries(favMenu).sort((a, b) => b[1] - a[1]).slice(0, 8);   // ⭐ atHome 적용 후 = 집 끼니만(기관 급식 제외)
        const favoriteFoods = favEntries.map(([m]) => m);   // 잘 먹는 음식 top8(집) — 푸드체이닝
        const favoriteFreq = favEntries.map(([m, c]) => `${m}(${c}회)`);   // ⭐ D(이사님 2026-06-15) — LLM에 '집 끼니 빈도' 정량 전달(밥16회 vs 1회를 동급으로 칭찬하던 것 차단)
        // 잘 먹는 식재료(빈도순) — 추천 엔진(사촌·인기 음식·궁합) 앵커. recoFacts는 planFor 후(타깃 확정) 생성.
        const likedIng = Object.entries(favIngFreq).sort((a, b) => b[1] - a[1]).map(([n]) => n);
        // ⭐ 선호계량화 모듈(이사님 2026-06-19) — 미상(null)을 liked로 오판 차단. '확신 liked'는 명시 완식(ate_well===true 또는 acceptance_level≥3)이 ≥2회 + Wilson 하한 통과한 식재료만(단발·미상 제외).
        //   아린 실측: ate_well true가 4건이지만 전부 다른 식재료(각 1회) → 모듈은 confidentLiked=0 = 콜드스타트. (구 누적기는 4개로 오판해 콜드스타트 미발동·두부 디폴트로 무너졌음.) acceptance_level 컬럼 미적용 시 ate_well 폴백.
        const prefs = quantifyPreferences(rs as unknown as PrefRow[], today);   // homeOnly 기본 — 기관 급식 제외(부모 통제 영역만)
        const confidentLiked = confidentLikedFrom(prefs);   // state==='liked'만(미상·탐색 제외) — 추천 앵커·콜드스타트 게이트·칭찬 근거
        const dislikedIng = new Set(dislikedFoods(prefs));   // 확실 거부(≥2회) — 추천 후보에서 제외(거부한 걸 또 권하지 않기). (exploringFoods=진척 칭찬 배선은 후속 — 프롬프트·골든 필요)
        const servedTop = Object.entries(servedHomeFreq).sort((a, b) => b[1] - a[1]).map(([n]) => n);
        const coldStart = confidentLiked.length < 2;   // 콜드스타트 게이트(확신 신호 빈약)
        const likedSeed = (coldStart ? [...new Set([...confidentLiked, ...coldStartSeed(servedTop, 6)])] : likedIng)
          .filter((i) => !dislikedIng.has(i));   // ⭐ 확실 거부 식재료는 추천 앵커에서 제외(거부한 걸 사촌 시드로 또 권하지 않기)
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
        const snackEval = evaluateSnacks({ rows: byChild[cid], band: snackBand, reds });   // 텍스트화는 계획 확정 후(쿨다운·과일타깃 중복제거·예시 로테이션 게이팅)
        let growthMirrorCtx: string | null = null;   // ⭐ E-03 — 오늘 성장(BMI/곡선) 거울 한 구절(격주 케이던스). null=미노출
        let growthShownCtx = false;   // ⭐ E-09 — 오늘 성장 거울 노출 여부(격주 케이던스 이력)
        let heightTrack: GrowthTrack | null = null, weightTrack: GrowthTrack | null = null;   // ⭐ 주간계획 macro 트랙용 — 격주 게이트와 무관하게 계산(저체중/성장더딤 판정)
        // ⭐ E-03/E-09 — 성장(BMI/곡선) 거울: 첫 측정 채널 대비 추종도 + BMI 밴드 → P10 한 구절. 격주 케이던스(13일 쿨다운·2주연속금지).
        if (meta.sex === 'M' || meta.sex === 'F') {
          if (meta.birth_year && meta.birth_month) {
            const monthsAt = (d: string) => { const [y, m] = d.split('-').map(Number); return (y - meta.birth_year!) * 12 + (m - meta.birth_month!); };
            const fg0 = firstGrowth[cid], lg0 = latestGrowth[cid], lgD = latestGrowthDate[cid];
            const tk = (col: 'height_cm' | 'weight_kg', metric: 'height' | 'weight') =>
              (fg0 && lg0 && lgD && fg0[col] != null && lg0[col] != null && fg0.measured_on !== lgD)
                ? growthTracking({ value: fg0[col] as number, ageMonths: monthsAt(fg0.measured_on) }, { value: lg0[col] as number, ageMonths: monthsAt(lgD) }, meta.sex as Sex, metric)
                : null;
            heightTrack = tk('height_cm', 'height'); weightTrack = tk('weight_kg', 'weight');
            const growthShownRecently = (recentGrowthDates[cid] || []).some((d) => d >= dAgo(13));   // 격주(13일) — 매일 키·몸무게 못 재니 잔소리 저빈도(이사님)
            if (!growthShownRecently) {
              growthMirrorCtx = growthTrackToPhrase({ band: snackBand, height: heightTrack, weight: weightTrack });
              growthShownCtx = !!growthMirrorCtx;
            }
          }
        }
        const uniqRef = [...new Set(ref)];
        // ⭐ C(이사님 2026-06-15) — 재노출 타깃은 '결핍 식품군에 속한 거부'만. 주식(밥/면/빵/떡) 일회성 거부·비결핍군(고기 등)·미매핑(치킨 등)은
        //   타깃 아님(밥·치킨이 음식 타깃이 되던 버그). 거부 '보고'(편지에 기관 거부 언급)는 sanitizeRefusals 그대로 유지·타깃 선정만 정제.
        const _STAPLE_WORD = /^(밥|쌀|현미|찹쌀|멥쌀|보리|잡곡|수수|기장|귀리|국수|면|빵|떡|당면|파스타|밀)$/;
        const _deficientGroups = new Set([...homeFg.missing, ...fg.missing]);
        const refExposable = sanitizeRefusals(uniqRef).filter((r) => {
          if (_STAPLE_WORD.test(r) || STAPLE_FORMS[r]) return false;   // 주식 제외
          const g = groupOf(r, catOf);                                 // ⭐ K-01 — 식재료→식품군(빗대기 경유). catOf(카테고리)를 식품군과 직접 비교하던 네임스페이스 버그 수정(콩·생선·단백질·비타민A채소 결핍거부 영구차단 해소)
          return !!g && _deficientGroups.has(g);                       // 결핍군 소속 거부만 재노출 타깃
        });
        const ts = computeTimeseries(byDate, menuFreq, catOf, dAgo(1), { assertNoVeg: catReliable });   // 어제 앵커(평가 기준일)
        // ⭐ 점심 커버리지 사실(결정론·2026-06-11) — 주말 하루 메모('점심 안 먹고')를 LLM이 '점심을 거르는 리듬'으로
        //   과일반화하는 것 차단: 점심이 실제 기록돼 있으면(대부분 기관 급식) 그 사실을 시계열 1순위로 주입하고,
        //   그래도 '점심 거르/건너뛰' 단정이 나오면 detForbid 정규식으로 재생성(프롬프트 호소만으론 못 막음 — 실증됨).
        // ⭐ 진단 사실 컴파일러('1번' — 2026-06-11 이사님 승인): 모든 사실에 시계열 추세 라벨(단발/간헐/반복)을
        //   붙인 '사실 카드' + 메모 날짜 분류 + 데이터 기반 금지 표현(detForbid)을 코드가 계산.
        //   '메모 2일 컷'은 철회(자르지 않고 분류) — 스키마 변경 0(log_date 등 기존 컬럼만).
        const fc = compileFacts({ rows: rs, today });
        const detForbidRe = fc.forbidParts.length ? new RegExp(fc.forbidParts.join('|')) : null;
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
          // ⭐ K-02(가드감사) — refExposable(주식제외+결핍군 소속, K-01 빗대기 적용)로 통일. 치킨 등 비결핍 거부가 '재노출 적기' 사실로 본문 누수하던 것 봉합(타깃 경로 refExposable과 동일 게이트).
          const rxRefs = refExposable.filter((f) => !transitioned.has(f));
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
        let brainPick: BrainAction | null = null;   // ⭐ 두뇌 선택+검수 결과(?brain=1) — context 저장·어드민 노출
        let recoIng: string | null = null; let recoPoolArr: string[] = []; let recoMode: string | null = null;   // ⭐ 오늘 추천 식재료(회전)+주간 풀 — context 저장(블록 밖 참조)
        let planDetailCtx: WeeklyAnchor['plan_detail'] = null;   // ⭐ 주간계획 모듈 산출(작전층) — anchor가 try 로컬이라 외부로 끌어냄(일간 슬롯 소비용)
        let planSlotCtx: ReturnType<typeof pickPlanSlot> = null;   // ⭐ 오늘 소비한 주간 슬롯(구체 dish·거울·macro) — 어드민·context
        let planCtx: CoachPlan | null = null;   // ⭐ 오늘의 구조화 계획(프레임·타깃·무브·시그니처) — 상태 원장(의미 중복 회피 이력)
        let weekCtx: { weekKey: string; fromWeekly: boolean; impression: string | null; pushApplied: boolean; arc: WeeklyArc | null; lever?: string; effLever?: string; missionTarget?: string | null; targetPool?: string[]; ledger?: WeeklyLedger | null } | null = null;   // ⭐ 주간 닻(작전층) 사용 여부·소견·아크 + A-01 lever/ledger/targetPool(두뇌 게이트용) · effLever=표시용 본문 레버(A) — 어드민 검증
        let weeklyReplan: ((sid: string) => ReturnType<typeof planFromWeekly>) | null = null;   // ⭐ A-04 — 두뇌 override 허용 시 닻 안에서 시나리오만 교체(타깃 잠금·채근 캡 보존)
        let curriculumDecision: DailyDecision | null = null;   // ⭐ F-05 — 오늘 커리큘럼 결정(유닛·step·mode) — behavior_goal·원장·어드민
        let curriculumSummary: string | null = null;   // ⭐ F-15 — 진도 요약(두뇌 참조·주간 표시)
        let snackShownCtx = false;   // ⭐ 오늘 간식 멘트를 실었는지 — 쿨다운 이력(매일 '과자 대신…' 반복 방지)
        let mirrorShownCtx = false;  // ⭐ 오늘 영양거울을 노출했는지(2026-06-20) — 출현빈도 쿨다운 이력('어린이집 덕에…' 격일화)
        let coachRegen = false;   // 비중복 가드로 재생성됐는지(어드민 검증용)
        let simToPrev: number | null = null;   // ⭐ 발행 직전 자가 측정 — 직전 편지들과 최대 유사도(어드민 반복 모니터·2026-06-11)
        let repeatAlert = false;               // ⭐ 자동 반복 경보 — 직전 2일 동일 시그니처 or 유사도 0.6+ (탐지 자동화 — '사람 제보' 의존 탈피)
        let verifyCtx: { ok: boolean; violations: string[]; regen: boolean } | null = null;   // ⭐ 의미 검증자 결과(어드민 검증)
        let modelUsed = 'haiku-4-5';           // intro(주 첫 진단)는 Sonnet 승격 — composeLetter가 결정
        // 발행되면 고정: 오늘 편지가 이미 있으면(prev.letter_date===today) 재사용. srcHash에 today가 들어가 날짜가 바뀌면 새 계획으로 재생성(식단 동일해도 동결되지 않음). force만 강제 재생성.
        const reusedThis = !force && !!prev && !!prev.letter && (prev.source_hash === srcHash || prev.letter_date === today);
        if (reusedThis) {
          letter = prev!.letter; oneliner = prev!.oneliner || ''; reused++;
          // ⭐ S6(적대감사): 재사용 시 context 전체 보존 — weekly를 null로 덮으면 다음 날 firstOfWeek 오판 → 같은 주 intro 중복(진단 재서술 사고 재발 경로)
          const pctx = prev!.context as { scenarioId?: string; scenarioLabel?: string; plan?: CoachPlan; snackShown?: boolean; weekly?: { weekKey: string; fromWeekly: boolean; impression: string | null; pushApplied: boolean; arc: WeeklyArc | null } | null; verify?: { ok: boolean; violations: string[]; regen: boolean } | null; simToPrev?: number | null; repeatAlert?: boolean; model?: string; coachRegen?: boolean } | null;
          scenarioId = pctx?.scenarioId ?? null;          // 재사용은 기존 시나리오·계획 보존(중복 이력 유지)
          scenarioLabel = pctx?.scenarioLabel ?? null;
          planCtx = pctx?.plan ?? null;
          snackShownCtx = pctx?.snackShown ?? false;
          weekCtx = pctx?.weekly ?? null;
          verifyCtx = pctx?.verify ?? null;
          simToPrev = pctx?.simToPrev ?? null;
          repeatAlert = pctx?.repeatAlert ?? false;
          modelUsed = pctx?.model ?? modelUsed;
          coachRegen = pctx?.coachRegen ?? false;
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
          // ⭐ 구조화 입력 분포(식감·자율성·환경·식사시간) — 부모가 매 끼니 찍는 칩을 코칭 신호·개선 팁으로(이전엔 autonomy·environment를 select조차 안 해 0% 반영이던 버그 수정).
          const texC: Record<string, number> = {}; let selfN = 0, autoN = 0, envBad = 0, envN = 0, mtOver = 0, mtN = 0;
          rs.forEach((r) => {
            if (r.texture) texC[r.texture] = (texC[r.texture] || 0) + 1;
            if (r.autonomy) { autoN++; if (r.autonomy === 'self') selfN++; }
            if (r.environment && r.place !== 'daycare') { envN++; if (r.environment !== 'table') envBad++; }   // ⭐ 5-B(이사님 2026-06-15) 집 끼니만 — 식사환경은 부모가 통제하는 집 기준(기관 분위기는 부모가 못 바꿈). table 외(영상·돌아다님·놀이)=주의
            if (typeof r.meal_time === 'number') { mtN++; if (r.meal_time >= 30) mtOver++; }
          });
          const texMode = Object.entries(texC).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
          const structuredSig: StructuredSig = {
            texMode, texLow: texMode === 'puree' || texMode === 'mashed', texCount: Object.values(texC).reduce((a, b) => a + b, 0),
            selfPct: autoN ? selfN / autoN : null, autoCount: autoN,
            envBadPct: envN ? envBad / envN : null, envCount: envN,
            mtOver30Pct: mtN ? mtOver / mtN : null, mtCount: mtN,
          };
          // ⭐ #4a 1주일차 결핍 끄기(이사님) — 기록<7일이면 '부족' 단정 금지(아직 안 먹은 게 아니라 안 기록됐을 뿐).
          //   결핍 신호(reds/missing/homeMissing/homeReds)를 비워 시나리오·작문이 '부족'을 못 짚게 → 잘 먹은 것·행동만 코칭.
          const loggedDaysTotal = histDays[cid]?.size ?? byDay.length;
          const defMature = loggedDaysTotal >= 7;
          const gReds = defMature ? reds : [];
          const gMissing = defMature ? fg.missing : [];
          const gHomeMissing = defMature ? homeFg.missing : [];
          const gHomeReds = defMature ? homeReds : [];
          const signals: CoachSignals = {
            timeseries: ts, reds: gReds, homeReds: gHomeReds, missing: gMissing, homeMissing: gHomeMissing,
            homeRefused: sanitizeRefusals(homeRef), daycareRefused: sanitizeRefusals(daycareRef), refused: sanitizeRefusals(uniqRef),
            refusedExposable: defMature ? refExposable : [],   // ⭐ A-08 — 타깃 선정 전용(주식제외+결핍군 거부만). 치킨 등 비결핍 누수 차단. 1주차 미성숙이면 빈 배열(결핍 단정 금지와 정합).
            notes, favoriteFoods, attendsDaycare: attends, ageBand: meta.age_band,
            recentLoggedDays, recentWindow: RECENT_WINDOW, icfqRiskCount,
            envBadPct: structuredSig.envBadPct, envCount: structuredSig.envCount,   // 식사 분위기 시나리오가 구조화 환경 입력으로도 발동
          };
          const daySeed = Math.floor(Date.parse(today) / 86400000);
          let cidHash = 0; for (let k = 0; k < cid.length; k++) cidHash = (cidHash * 31 + cid.charCodeAt(k)) >>> 0;
          let precomputed = planFor({ signals, recentScenarioIds: recentScenarios[cid] || [], recentPlans: recentPlans[cid] || [], daySeed, cidHash });
          // ⭐ 주간 닻(작전층 §2·§13·§14) — 있으면 타깃 잠금·채근 캡(주1회)·행동지연. 없거나 실패하면 위 planFor 폴백(안전 제1원칙).
          //    전부 try/catch로 degrade — weekly_plans 미실행/에러여도 daily 엔진은 항상 동작.
          try {
            const buildStructuredSummary = () => {
              const p = (v: number | null) => v == null ? '기록없음' : `${Math.round(v * 100)}%`;
              return `식감 최빈 ${structuredSig.texMode || '기록없음'}, 스스로 떠먹기 ${p(structuredSig.selfPct)}, 화면·이동 식사 ${p(structuredSig.envBadPct)}, 30분+ 끼니 ${p(structuredSig.mtOver30Pct)}`;
            };
            const synthAndStoreAnchor = async (wk: string): Promise<WeeklyAnchor | null> => {
              // ⭐ 6-A(이사님 2026-06-15) — '3주 진전0' 자동탐지: 직전 닻들의 ledger.targetAccepts를 읽어 같은 타깃이
              //   연속으로 '집에서 받아들임 0'(food 레버 주)이었는지 센다. 3주면 stalledTarget → 종합이 다른 축으로 전환.
              let recentTgt: string | null = null; let priorStall = 0;
              let focusHistory: Array<{ unit_id: UnitId | null; stepAdvanced: boolean }> = [];   // ⭐ F-06/E-06 — 최근 주 focus 이력(피로 캡: 2주 정체 유닛 교체)
              try {
                const { data: rAnchors } = await supabase.from('weekly_plans')
                  .select('week_key,mission_target,budget,ledger,goals').eq('child_id', cid)
                  .lt('week_key', wk).order('week_key', { ascending: false }).limit(STALL_LOOKBACK);
                const ra = (rAnchors || []) as Array<{ mission_target: string | null; budget: WeeklyBudget | null; ledger: WeeklyLedger | null; goals: unknown }>;
                recentTgt = ra[0]?.mission_target || null;
                if (recentTgt) for (const a of ra) {
                  if (a.mission_target !== recentTgt) break;             // 타깃 바뀜 → streak 끊김
                  if ((a.budget?.lever || 'food') !== 'food') break;     // 비-food 주(타깃=배경, 채근 안 함) → 미집계
                  const acc = a.ledger?.targetAccepts;
                  if (typeof acc !== 'number') break;                    // 구버전 데이터(미기록) → 단정 금지(3주 누적 후 자연 가동)
                  if (acc > 0) break;                                    // 받아들인 주 있음 → streak 끊김(6-C: 진짜 진척 중인 아이 보호)
                  priorStall++;
                }
                // ⭐ F-06 — 최근 주 focus 이력(최신순): 같은 유닛이 2주 연속 focus였고 진전 0이면 applyFocusFatigue가 차순위로 교체(포트폴리오 다채로움).
                focusHistory = ra.map((a) => {
                  const fg = normalizeGoals(a.goals).find((g) => g.status === 'focus');
                  const u = (fg?.unit_id ?? null) as UnitId | null;
                  const adv = !!u && ((progByChild[cid]?.[u]?.step || 1) > 1 || progByChild[cid]?.[u]?.status === 'mastered');
                  return { unit_id: u, stepAdvanced: adv };
                });
              } catch { /* 스톨 감지 실패해도 종합은 계속(안전 제1원칙) */ }
              const stalledTarget = (recentTgt && priorStall >= STALL_PIVOT_WEEKS) ? recentTgt : null;
              // ⭐ F-06/F-12 — 가입 후 주차(첫 기록일 기준): goalsCapForWeek·minWeek 게이트 + arc_week 표시(1주차 고정 버그 수정).
              const _firstLog = histDays[cid] && histDays[cid].size ? [...histDays[cid]].sort()[0] : today;
              const weekSinceSignup = Math.max(1, Math.floor((Date.parse(today) - Date.parse(_firstLog)) / (7 * 86400000)) + 1);
              const synth = await runWeeklyPlanning({
                childName: meta.nickname, ageBand: meta.age_band,
                reds, missing: fg.missing, homeMissing: homeFg.missing,
                refused: refExposable, favoriteFoods,   // ⭐ C — 정제된 재노출 타깃(밥·치킨 제외)
                transitions: ts.filter((t) => /거부→수용 전환|받아들이기 시작/.test(t)),
                structuredSummary: buildStructuredSummary(), chronicGuidance: chronicGuidanceText(meta.chronic),
                icfqRiskCount, stalledTarget,   // ⭐ 6-A — 정체 타깃은 후보 맨 뒤로 + '축 전환' 지시
                // ⭐ F-06 — 진척·주차·focus 이력 라이브 주입: candidateUnits가 mastered/maintenance 제외(졸업)·minWeek 게이트, applyFocusFatigue가 2주 정체 focus 교체(다채로움).
                progress: progByChild[cid] || {}, week: weekSinceSignup, focusHistory,
                // ⭐ E-07 — v3 목표 포트폴리오 후보 신호(E-03). 메모·간식·구조화는 buildCandSignals(rows 계산),
                //   영양 결핍 카운트만 영양 파이프라인 산출로 덮어씀(rows만으론 모름).
                candSignals: {
                  ...buildCandSignals(rs as CRow[], today, attends),
                  missingCount: new Set([...fg.missing, ...homeFg.missing]).size,
                  refusedCount: sanitizeRefusals(uniqRef).length, dcRefusedCount: sanitizeRefusals(daycareRef).length,
                },
              });
              // ⭐ 6-A — stallWeeks 이월: 종합이 같은 타깃을 계속 잡았고(전환 안 함·food 레버) 정체였으면 streak 유지, 아니면 0(새 타깃·전환·비-food).
              const carriedStall = (synth.mission_target && synth.mission_target === recentTgt && synth.budget?.lever === 'food' && !stalledTarget) ? priorStall : 0;
              // ⭐ 주간계획 모듈 — 일요일 종합(synth) 위에 결정론 후처리로 7일치 구체 계획(plan_detail) 오케스트레이션(이사님 2026-06-18).
              //   추천엔진(구체 dish 회전)·그래프(사촌 도전트랙)·영양평가(BMI/탄단지 macro)·진척(anti-stall)·거울 스케줄을 종합. throw 시 null degrade.
              const planDetail = (() => {
                try {
                  const enrichCtx: EnrichContext = {
                    groupSignals: computeGroupSignals(homeDays.length ? homeDays : byDay, catOf).signals,
                    likedIngredients: likedSeed, freqMap,
                    deficitGroups: [...new Set([...homeFg.missing, ...fg.missing])].filter(Boolean),
                    coveredGroups: fg.covered,
                    band: snackBand, heightTrack, weightTrack,
                    goals: synth.goals || [], focusHistory, arcWeek: weekSinceSignup, attendsDaycare: attends,
                    excludeFoods: [...(reco14[cid] || [])].filter((f) => !allIng.includes(f)),   // ⭐ 추천-무시 배제(이사님 2026-06-21) — 최근 14일 추천했는데 식단(allIng) 미등장 식재료. 등장하면 allIng에 들어 자동 복귀.
                  };
                  return enrichWeeklyPlan(synth, enrichCtx);
                } catch (e) { console.warn('[cron/coach] enrichWeeklyPlan skip:', e instanceof Error ? e.message : e); return null; }
              })();
              const row = {
                child_id: cid, week_key: wk, status: synth.source === 'weekly_llm' ? 'active' : 'cold_synth', source: synth.source,
                mission: synth.mission, mission_target: synth.mission_target, target_pool: synth.target_pool, secondary_axis: synth.secondary_axis,
                budget: synth.budget, ledger: { ...DEFAULT_LEDGER, stallWeeks: carriedStall }, impression: synth.impression, arc_week: weekSinceSignup,   // ⭐ F-12 — 가입 후 주차(1주차 고정 버그 수정)
                behavior_goal: synth.behaviorGoal, teaching_arc: synth.teachingArc, check_method: synth.checkMethod,   // §14 주간 커리큘럼
                goals: synth.goals?.length ? synth.goals : null,   // ⭐ A-04/E-07 — 포트폴리오(lever는 budget에 병행 기록=A-05)
                plan_detail: planDetail,   // ⭐ 주간계획 모듈 산출(작전층 부가 계획) — 일간이 slot 소비
                basis_attends_daycare: attends, model: synth.source === 'weekly_llm' ? 'sonnet-4-6' : 'cold', updated_at: new Date().toISOString(),
              };
              // ⭐ upsert 결과 검사(2026-06-11 사고) — 커리큘럼 컬럼 미적용(weekly_coaching.sql 전)이면 행 전체가 조용히 거부돼
              //   닻이 영영 저장 안 됨 → 매일 Sonnet 재종합·ledger 사망. 실패 시 신규 컬럼만 빼고라도 저장(닻 영속 보장).
              const { error: upErr } = await supabase.from('weekly_plans').upsert(row, { onConflict: 'child_id,week_key' });
              if (upErr) {
                console.warn('[cron/coach] weekly anchor upsert:', upErr.message);
                issues.push(`닻 저장 장애 ${meta.nickname}: ${upErr.message.slice(0, 80)} — 매일 재종합 모드(비용 누수) 의심`);   // H-06(M9) — 조용한 장애 가시화
                const legacy = { ...row } as Record<string, unknown>;
                delete legacy.behavior_goal; delete legacy.teaching_arc; delete legacy.check_method; delete legacy.goals; delete legacy.plan_detail;   // E-07 양분기 + plan_detail 컬럼 미적용 degrade
                const { error: e2 } = await supabase.from('weekly_plans').upsert(legacy, { onConflict: 'child_id,week_key' });
                if (e2) console.warn('[cron/coach] weekly anchor legacy upsert:', e2.message);
              }
              return row as unknown as WeeklyAnchor;
            };
            const loadAnchor = async (wk: string): Promise<WeeklyAnchor | null> => {
              const { data } = await supabase.from('weekly_plans').select('*').eq('child_id', cid).eq('week_key', wk).maybeSingle();
              return (data as WeeklyAnchor) || null;
            };
            const dow = kstDow(today);
            const weekKey = isoWeekKey(today);
            if (dow === 0 && !qp.get('date')) await synthAndStoreAnchor(isoWeekKey(addDaysStr(today, 1)));   // 일요일: 다가올 주 닻 종합. ⭐ QA date 시뮬에선 금지(S5 — 과거 일요일 재실행이 라이브 주 닻·ledger를 DEFAULT로 파괴하던 버그)
            let anchor = await loadAnchor(weekKey);
            if (!anchor && dow !== 0) anchor = await synthAndStoreAnchor(weekKey);          // 평일 닻 없으면 lazy 생성 → 레이어 즉시 활성
            if (anchor) {
              planDetailCtx = anchor.plan_detail ?? null;   // ⭐ 주간계획 모듈 산출 — 일간 슬롯 소비용으로 외부 변수에 노출(anchor는 try 로컬)
              // ⭐ 구버전/컬럼 미적용 닻 치유(E-09: goals는 항상 정규화 — goalsOf가 lever에서 승격) + behavior_goal 결손 시만 best-effort 영속화
              const needPersist = !anchor.behavior_goal;
              anchor = healAnchor(anchor);
              if (needPersist) await supabase.from('weekly_plans').update({ behavior_goal: anchor.behavior_goal, teaching_arc: anchor.teaching_arc, check_method: anchor.check_method }).eq('child_id', cid).eq('week_key', weekKey);
              // ⭐ F-05/F-07/F-15 — 커리큘럼 진척: 오늘 advanceProgress → 진화·결정, curriculum_progress upsert, 두뇌/주간 진도 요약.
              try {
                const cgoals = (anchor.goals && anchor.goals.length ? anchor.goals : goalsOf(anchor)) as Goal[];
                const _firstLogA = histDays[cid] && histDays[cid].size ? [...histDays[cid]].sort()[0] : today;
                const weekA = Math.max(1, Math.floor((Date.parse(today) - Date.parse(_firstLogA)) / (7 * 86400000)) + 1);   // ⭐ B — fallbackPivot minWeek 게이트용 가입 주차(synth의 weekSinceSignup과 동일식)
                const yKey = addDaysStr(today, -1);
                const hist = curriculumHist[cid] || [];
                const coachedYesterday = [...new Set(hist.filter((h) => h.date === yKey).map((h) => h.unit))];
                const coachedDays: Partial<Record<UnitId, number>> = {};
                hist.filter((h) => h.date >= dAgo(TH.stallDays)).forEach((h) => { coachedDays[h.unit] = (coachedDays[h.unit] || 0) + 1; });
                const pivotsThisWeek = hist.filter((h) => isoWeekKey(h.date) === weekKey && h.mode === 'pivot').length;
                let probeAnswers: ProbeAnswer[] = [];
                try { const { data: ansRows } = await supabase.from('daily_questions').select('q_date,answer,context').eq('child_id', cid).gte('q_date', dAgo(7)).not('answer', 'is', null); probeAnswers = parseProbeAnswers((ansRows || []) as Array<{ q_date: string; answer: string | null; context: Record<string, unknown> | null }>); } catch { /* 질문 미존재 */ }
                const adv = advanceProgress({ childId: cid, goals: normalizeGoals(cgoals), progress: progByChild[cid] || {}, rows: rs as CRow[], answers: probeAnswers, coachedDays, coachedYesterday, pivotsThisWeek, foodTarget: anchor.mission_target, today, week: weekA });
                curriculumDecision = adv.decision;
                if (adv.updates.length) {
                  const { error: cpErr } = await supabase.from('curriculum_progress').upsert(adv.updates.map((u) => ({ child_id: u.child_id, unit_id: u.unit_id, status: u.status, step: u.step, evidence: u.evidence, started_at: u.started_at, mastered_at: u.mastered_at, last_signal_at: u.last_signal_at, stop_reason: u.stop_reason, relapse_count: u.relapse_count, updated_at: new Date().toISOString() })), { onConflict: 'child_id,unit_id' });
                  if (cpErr) issues.push(`커리큘럼 저장 장애 ${meta.nickname}: ${cpErr.message.slice(0, 60)}`);
                  else adv.updates.forEach((u) => { (progByChild[cid] ||= {})[u.unit_id as UnitId] = u as CurriculumProgressRow; });
                }
                // ⭐ F-16 — 피벗으로 focus가 플립되면(goalsAfter) 닻 goals에 영속화. 안 하면 정적 goals가 다음날 피벗을 되돌려(table-stage 재고착·1-pivot 캡 소진 후 observe로 회귀=환경무브 복귀) 유닛↔무브 결속이 '하루'만 유지된다(curriculum.ts:210 계약 — 호출자의 영속화 의무).
                if (adv.decision?.mode === 'pivot' && adv.goalsAfter && adv.goalsAfter.length) {
                  anchor.goals = adv.goalsAfter;   // 같은 런 downstream + 다음날 재로드 모두 피벗 후 focus 사용
                  const { error: gErr } = await supabase.from('weekly_plans').update({ goals: adv.goalsAfter, updated_at: new Date().toISOString() }).eq('child_id', cid).eq('week_key', weekKey);
                  if (gErr) issues.push(`피벗 goals 저장 장애 ${meta.nickname}: ${gErr.message.slice(0, 60)}`);
                }
                // ⭐ F-15 진도 요약(두뇌 참조·주간 표시) — 수료/진행중/미시작 + 오늘 초점 단계
                const m = progByChild[cid] || {};
                const mastered = UNIT_IDS.filter((u) => m[u]?.status === 'mastered').map((u) => UNITS[u].label);
                const active = UNIT_IDS.filter((u) => ['active', 'progressing', 'maintenance'].includes(m[u]?.status || '')).map((u) => `${UNITS[u].label}(${m[u]!.status}·${m[u]!.step}단)`);
                const notStarted = UNIT_IDS.filter((u) => !m[u] || m[u]?.status === 'not_started').length;
                const dec = adv.decision ? ` · 오늘 ${UNITS[adv.decision.unit].label} ${adv.decision.step}단(${adv.decision.mode})` : '';
                curriculumSummary = `수료 ${mastered.length}${mastered.length ? `(${mastered.slice(0, 3).join('·')})` : ''} · 진행중 ${active.slice(0, 3).join('·') || '없음'} · 미시작 ${notStarted}${dec}`;
              } catch (e) { console.warn('[cron/coach] curriculum advance skip:', e instanceof Error ? e.message : e); }
            }
            if (anchor && anchor.mission_target) {
              const tgt = anchor.mission_target;
              const lever = anchor.budget?.lever || 'food';
              const weekRows = (byChild[cid] || []).filter((r) => isoWeekKey(r.log_date) === weekKey);
              const servedDays = weekRows.filter((r) => (r.ingredients || []).some((ing) => ing === tgt || catOf(ing) === tgt));   // 실제 차림(그룹=catOf·음식=정확일치)
              const targetExposeWtd = servedDays.length;
              const firstServeDow = servedDays.length ? Math.min(...servedDays.map((r) => kstDow(r.log_date))) : null;
              // ⭐ 6-C(이사님 2026-06-15) + 신호포착(2026-06-19) — '진짜 진척' 신호: 집에서 명시 진전(만짐 이상)을 보인 타깃 횟수.
              //   ⚠️ 구버전은 `ate_well !== false`라 미상(null)도 진척으로 셌다 → 아린처럼 미상 80%인 아이가 영원히 '진전 중'으로 보여 같은 타깃(두부) 반복. acceptanceLevel로 미상을 배제(≥1=만짐/한입/조금/완식만). acceptance_level 컬럼 미적용 시 ate_well 폴백(=완식만 카운트).
              const targetAccepts = weekRows.filter((r) => { const lv = acceptanceLevel(r); return r.place !== 'daycare' && lv != null && lv >= 1
                && (r.ingredients || []).some((ing) => ing === tgt || catOf(ing) === tgt)
                && !(r.refused && (r.refused === tgt || catOf(r.refused) === tgt)); }).length;
              // 행동변화 관측(아크 단계 결정) — food=실제 차림, 구조 레버=그 좋은 행동이 이번 주 1회+ (거짓 칭찬 방지)
              const goodRow = (r: Row) => lever === 'environment' ? r.environment === 'table' : lever === 'autonomy' ? r.autonomy === 'self' : lever === 'texture' ? (r.texture === 'finger' || r.texture === 'table') : false;
              const progress = lever === 'food' ? firstServeDow != null : weekRows.some(goodRow);
              // ⭐ 관측된 실행의 구체 사실 한 줄 — reinforce/observe 편지가 '실제 일어난 일'을 콕 집어 칭찬하게(거짓 칭찬 차단·2026-06-11)
              let progressNote: string | null = null;
              if (progress) {
                const ago = (d: string) => { const n = Math.round((Date.parse(today) - Date.parse(d)) / 86400000); return n <= 1 ? '어제' : `${n}일 전`; };
                if (lever === 'food') progressNote = `이번 주 '${tgt}'를 식탁에 올린 기록 있음(${targetExposeWtd}회)`;
                else {
                  const r = [...weekRows].filter(goodRow).sort((a, b) => b.log_date.localeCompare(a.log_date))[0];
                  if (r) {
                    const slot = SLOT_LABEL[r.slot || ''] ? `${SLOT_LABEL[r.slot || '']} ` : '';   // '아침 끼니를' 형태 — 조사 충돌 회피
                    progressNote = lever === 'environment' ? `${ago(r.log_date)} ${slot}끼니를 화면 없이 식탁에 앉아서 먹음`
                      : lever === 'autonomy' ? `${ago(r.log_date)} ${slot}끼니를 아이가 스스로 떠먹음`
                      : `${ago(r.log_date)} ${slot}끼니에서 한 단계 위 질감을 시도함`;
                  }
                }
              }
              const firstOfWeek = !(recentWeekKeys[cid] || []).includes(weekKey);   // 이번 주 닻의 첫 편지 → intro(진단+왜는 주 1회만)
              // ⭐ F-16 — 오늘 코칭 유닛(커리큘럼 결정)의 레버가 주간 레버와 다르면 그 유닛 레버로 프레임/무브를 끈다(유닛 피벗을 독자가 본문에서 느끼게).
              //   celebrate/maintain(축하·유지)은 익숙한 주간 프레임 유지(새 음식 무브 금지). 레버 전환 날은 직전 레버의 progressNote(reinforce 사실) 주입 금지(잡탕 편지 차단·A-05 arc-null 패턴과 동일).
              //   weekCtx.lever·FOOD_OVERRIDE_CAP은 주간 레버 그대로(두뇌 게이트·음식 잔소리 캡 의미 보존).
              const unitLever = curriculumDecision ? leverForUnit(curriculumDecision.unit) : null;
              const tonalMode = curriculumDecision?.mode === 'celebrate' || curriculumDecision?.mode === 'maintain';
              const effectiveLever = (unitLever && !tonalMode && unitLever !== lever) ? unitLever : null;
              const effProgressNote = effectiveLever ? null : progressNote;
              const wk = planFromWeekly({ anchor, signals, recentPlans: recentPlans[cid] || [], targetExposeWtd, progress, progressNote: effProgressNote, firstOfWeek, lastArcStage: prevArcStage[cid] ?? null, daySeed, cidHash, dow, effectiveLever });
              if (wk) {
                precomputed = { scenario: wk.scenario, plan: wk.plan, varyOpener: wk.varyOpener };
                const newLedger = { ...(anchor.ledger || DEFAULT_LEDGER), ...wk.ledgerPatch, exposeCount: { ...((anchor.ledger || DEFAULT_LEDGER).exposeCount || {}), [tgt]: targetExposeWtd }, firstServeDow, targetAccepts };   // ⭐ 6-C targetAccepts 적재 → 다음 일요일 synth가 스톨 판정
                // ⭐ A-01 — 두뇌 게이트가 읽도록 lever·targetPool·ledger(foodOverrideUsed 포함)를 weekCtx에 노출.
                weekCtx = { weekKey, fromWeekly: true, impression: anchor.impression, pushApplied: wk.pushApplied, arc: wk.weeklyArc, lever: anchor.budget?.lever || 'food', effLever: effectiveLever ?? (anchor.budget?.lever || 'food'), missionTarget: anchor.mission_target, targetPool: anchor.target_pool || [], ledger: newLedger };   // ⭐ A(랄프위검 2026-06-19 #2) — lever=주간 닻 레버(두뇌 캡 기능용·불변), effLever=오늘 본문이 실제 따르는 레버(table-stage 피벗 시 environment). 디버그/어드민 표시는 effLever(메타-본문 정합).
                // ⭐ F-08/F-17 — 커리큘럼 step.behavior + 사다리 누적 서사 주입은 두뇌 블록 '이후'(scenarioId 확정 후)에 단일 적용한다.
                //   (옛 F-08은 여기서 했으나 두뇌 override가 arc를 wk2.weeklyArc로 덮어 step behavior가 손실됐음 — F-16 자가정독 #4 봉합.)
                // ⭐ A-04 — override 허용 시 닻 안에서 시나리오만 교체(타깃 잠금·채근 캡·아크 보존). 두뇌 블록에서 호출.
                const _anchor = anchor as WeeklyAnchor;
                weeklyReplan = (sid: string) => planFromWeekly({ anchor: _anchor, signals, recentPlans: recentPlans[cid] || [], targetExposeWtd, progress, progressNote: effProgressNote, firstOfWeek, lastArcStage: prevArcStage[cid] ?? null, daySeed, cidHash, dow, forceScenarioId: sid, effectiveLever });
                await supabase.from('weekly_plans').update({ ledger: newLedger, updated_at: new Date().toISOString() }).eq('child_id', cid).eq('week_key', weekKey);
              }
            }
          } catch (e) { console.warn('[cron/coach] weekly anchor skip:', e instanceof Error ? e.message : e); }
          // ⭐ 일간 전술 두뇌 — 전 자녀 라이브(이사님 2026-06-16: 카나리아·플래그·A/B 전부 제거, 다 라이브). Sonnet이 오늘 편지의
          //   시나리오·useFood(=영양거울 평가: 오늘 음식 다룰지)를 주간계획·최근편지·다양성 존중하며 판단. 실패=결정론 폴백(발행 보장).
          {
            try {
              const { data: wk3 } = await supabase.from('weekly_plans').select('week_key,mission_target,behavior_goal,impression').eq('child_id', cid).order('week_key', { ascending: false }).limit(3);
              const recoCand = buildRecoFacts({ likedIngredients: likedSeed, target: precomputed.plan?.target ?? null, freqMap }).text;
              const brainCtx = buildBrainContext({
                childName: meta.nickname, signals,
                nutritionMirror: nutritionMirrorFromInput({ homeMissing: homeFg.missing, missing: fg.missing, covered: fg.covered }),
                recoCandidates: recoCand ? [recoCand] : [],
                weeklyEchoes: (wk3 || []).map((w: { week_key: string; mission_target: string | null; behavior_goal: string | null; impression: string | null }) => ({ weekKey: w.week_key, target: w.mission_target, behaviorGoal: w.behavior_goal, impression: w.impression })),
                pastLetters,
                recentScenarioIds: recentScenarios[cid] || [],
                anchorLever: weekCtx?.lever, anchorTargetPool: weekCtx?.targetPool, recentUseFood: (recentBrainUseFood[cid] || []).slice(0, 4),   // ⭐ A-07 — 닻 lever·연속 food 이력 주입
                curriculumSummary,   // ⭐ F-15 — 두뇌가 유닛 수료/진행/미시작·오늘 초점 참조(같은 환경만 반복 방지)
              });
              brainPick = await pickActionByBrain(brainCtx, recoCand ? [recoCand] : []);
              // ⭐ A-07 — 연속 food날 캡: 직전 2일 모두 음식이면 오늘은 결정론으로 비음식 강등(프롬프트 신뢰 대신 보증).
              // ⭐ K-06(가드감사) — lever 인지: food 닻 주는 음식이 본업이라 3일 연속일 때만 휴지, 비-food 주는 2일 캡(원래 잔소리연속 버그 보존).
              { const _foodWk = (weekCtx?.lever || 'food') === 'food'; const _need = _foodWk ? 3 : 2;
                if (brainPick && (recentBrainUseFood[cid] || []).slice(0, _need).filter(Boolean).length >= _need) brainPick.useFood = false; }
              if (brainPick.scenarioId) {
                // ⭐ A-04/A-06 — 닻 종속 override 게이트. 트리거 충족 + (food주|레버호환|안전인터럽트|food override 캡 미소진)일 때만 두뇌 시나리오 채택.
                const safeTrigger = (id: string): boolean => { const sc = SCENARIOS.find((s) => s.id === id); if (!sc) return false; try { return sc.trigger(signals); } catch { return false; } };
                const anchorLever = weekCtx?.lever || 'food';
                const sid = brainPick.scenarioId;
                const fov = weekCtx?.ledger?.foodOverrideUsed ?? 0;
                const { allow, isFoodOverride } = anchorOverrideAllowed({ anchorLever, sid, fov, triggerOk: safeTrigger(sid) });
                if (allow) {
                  const wk2 = (weekCtx?.fromWeekly && weeklyReplan) ? weeklyReplan(sid) : null;
                  if (wk2) {
                    precomputed = { scenario: wk2.scenario, plan: wk2.plan, varyOpener: wk2.varyOpener };
                    weekCtx = { ...weekCtx!, arc: isFoodOverride ? null : wk2.weeklyArc };   // ⭐ A-05 — food override 날 환경 arc 제거(잡탕 편지 방지)
                  } else {
                    precomputed = planFor({ signals, recentScenarioIds: recentScenarios[cid] || [], recentPlans: recentPlans[cid] || [], daySeed, cidHash, forceScenarioId: sid });
                    if (weekCtx && isFoodOverride) weekCtx = { ...weekCtx, arc: null };
                  }
                  if (isFoodOverride && weekCtx?.weekKey) {   // ⭐ A-09 — food override 캡 카운트 적재(주경계 리셋=새 주 synth DEFAULT_LEDGER)
                    const merged = { ...(weekCtx.ledger || DEFAULT_LEDGER), foodOverrideUsed: fov + 1 };
                    weekCtx = { ...weekCtx, ledger: merged };
                    await supabase.from('weekly_plans').update({ ledger: merged, updated_at: new Date().toISOString() }).eq('child_id', cid).eq('week_key', weekCtx.weekKey);
                  }
                }
                // allow=false → 두뇌 시나리오 무시, 닻 레버 프레임/결정론 precomputed 유지(비-food 주 음식 잔소리·트리거 미충족 강제 차단)
              }
            } catch (e) { console.warn('[cron/coach] brain skip:', e instanceof Error ? e.message : e); brainPick = null; }
          }
          scenarioId = precomputed.scenario.id; scenarioLabel = precomputed.scenario.label; planCtx = precomputed.plan;
          // ⭐ F-08/F-17 — 커리큘럼 step 누적 서사: 최종 arc에 현 step.behavior + 사다리(이전/다음 단계) + 캠페인 누적일 주입.
          //   두뇌 override가 arc를 교체한 '뒤'에 적용 → override 날에도 step behavior 보존(자가정독 #4 봉합).
          //   step이 고착이어도 손이 '며칠째 X를 함께 해오셨고 → 익숙해지면 다음은 Y' 사다리로 부모에게 '길'(진도감)을 보여준다.
          if (weekCtx?.arc && curriculumDecision) {
            const _u = curriculumDecision.unit; const _steps = UNITS[_u]?.steps || [];
            const _i = Math.max(0, Math.min(_steps.length - 1, curriculumDecision.step - 1));
            const _cur = _steps[_i];
            if (_cur) {
              // ⭐ D(랄프위검 2026-06-19 #1) — 진행일은 '전역 단조 캠페인일'(가입 첫 기록부터). 유닛이 교대(table↔exposure)하면 per-unit started_at이 20→7로 역행해 '망가진 주행거리계'로 읽히던 것 제거. 서사는 임계(≥4·≥6)로만 쓰므로 의미 보존.
              const _firstLogD = histDays[cid] && histDays[cid].size ? [...histDays[cid]].sort()[0] : today;
              const _unitDays = Math.max(1, Math.round((Date.parse(today) - Date.parse(_firstLogD)) / 86400000));
              weekCtx = { ...weekCtx, arc: { ...weekCtx.arc,
                behaviorGoal: curriculumDecision.mode === 'celebrate' ? `${_cur.behavior}가 자리 잡았어요` : _cur.behavior,
                stepStory: {
                  mode: curriculumDecision.mode, stepNum: curriculumDecision.step, totalSteps: _steps.length,
                  prevBehavior: _i > 0 ? _steps[_i - 1].behavior : null,
                  nextBehavior: _i < _steps.length - 1 ? _steps[_i + 1].behavior : null,
                  unitLabel: UNITS[_u].label, unitDays: _unitDays,
                },
              } };
            }
          }
          // ⭐ 간식 멘트 다듬기(이사님) — 매일 '과자 대신 과일·요거트…' 반복 방지:
          //   ① 쿨다운: 최근 2일 안에 이미 실었으면 오늘은 생략(며칠에 한 번만) ② 과일이 오늘 타깃이면 본문이 이미 좋은 간식을 다루므로 중복 생략
          //   ③ 실을 땐 daySeed로 예시 로테이션. 신호(초가공 등)는 사라지지 않고 며칠 간격으로 다시 환기됨.
          const SNACK_COOLDOWN = 2;
          const snackShownRecently = (recentSnackDates[cid] || []).some((d) => d >= dAgo(SNACK_COOLDOWN));
          const snackChannelTarget = !!(planCtx?.target && SNACK_CHANNEL.has(planCtx.target));
          // ⭐ 구조(환경·자율성·식감) 편지엔 간식 음식 스왑을 얹지 않음 — '한 번에 하나' 위반으로 요구 3개 편지가 되던 것 차단(2026-06-11 검증자 적발).
          //   간식 신호는 사라지지 않고 food 주간/다음 기회에 환기(쿨다운과 동일 원리).
          const structuralFrame = STRUCTURAL_FRAMES.includes(scenarioId || '');   // 명단 단일 소스(coach.SCEN_MOVES 파생 — 수동 동기화 금지)
          const snackText = (!snackShownRecently && !snackChannelTarget && !structuralFrame && !growthMirrorCtx) ? snackEvalToPrompt(snackEval, daySeed) : null;   // ⭐ E-08 — 성장 거울 있는 날은 간식 멘트 생략(한 번에 하나·과체중 간식 안내는 growthTrackToPhrase가 이미 담음)
          snackShownCtx = !!snackText;
          // ⭐ 추천 근거화(이사님) — 타깃(부족 식품군) 대표 식재료의 인기 음식 + 잘 먹는 식재료의 사촌·궁합(전부 테이블). 편지는 이 목록 밖 음식·조합 금지 → 괴식 차단.
          // ⭐ 두뇌 useFood ↔ 시나리오 정합: 구조 프레임(환경·자율성·식감)은 본문이 음식 제안을 안 하므로 useFood=false로 맞춤(칩·bridgeFacts 일관).
          if (brainPick && NO_FOOD_ACTION_FRAMES.has(scenarioId || '')) brainPick.useFood = false;   // ⭐ K-11 — 텍스처(음식 형태 변경) 날은 음식 추천 허용(STRUCTURAL_FRAMES→NO_FOOD_ACTION_FRAMES)
          // ⭐ 주간 추천 식재료 풀(영양거울 기반 5개) + 일일 회전 — 같은 식재료 연속 추천 방지(6/2·6/3 콩 반복 사고).
          //   ⭐ E(이사님 2026-06-15) — 풀을 '집 끼니' 신호로 산출(byDay→homeDays). 기관이 콩류·채소를 채우면 전체는 green이라
          //   풀에서 빠지고 추천이 곡물·계란 등으로 엉뚱하게 새던 것 수정 → 영양거울(집 부족군)과 음식 추천이 일치(집 부족=콩류면 두부).
          { const _rp = buildIngredientPool({ signals: computeGroupSignals(homeDays.length ? homeDays : byDay, catOf).signals, likedIngredients: likedSeed, freqMap, max: 5 });
            recoPoolArr = _rp.pool; recoMode = _rp.mode;
            // ⭐ B(이사님 2026-06-15) — 추천 식재료를 '오늘 타깃 식품군' 또는 (환경 등 비-food 레버 주) '집 부족 식품군'에 맞춰 회전.
            const _alignGroups = planCtx?.target ? [planCtx.target] : (gMissing.length ? gMissing : gHomeMissing);
            const _inTgt = recoPoolArr.filter((p) => { const g = groupOfIngredient(p); return g != null && _alignGroups.includes(g); });
            const _basis = _inTgt.length ? _inTgt : recoPoolArr;
            recoIng = _basis.find((p) => !(recentRecoIng[cid] || []).slice(0, 5).includes(p)) || _basis[0] || null;
            // ⭐ 주간계획 모듈 소비(이사님 2026-06-18) — plan_detail이 있으면 '7일치 구체 dish 회전 슬롯'을 우선 사용(유연성 가드:
            //   그날 결핍으로 vetting). slot.ingredient가 구체 회전(콩류 두부 도돌이표 차단). 없으면 위 기존 회전 폴백(degrade-safe).
            if (defMature && planDetailCtx) {
              planSlotCtx = pickPlanSlot(planDetailCtx, { daySeed, cidHash, deficitNow: new Set([...gMissing, ...gHomeMissing]), recentIngredients: (recentRecoIng[cid] || []).slice(0, 3) });   // ⭐ 최근 3일 추천 식재료 dedup(메추리알 수렴 차단)
              if (planSlotCtx?.slot?.ingredient) { recoIng = planSlotCtx.slot.ingredient; recoMode = planSlotCtx.slot.track; } }
          }
          // ⭐ 두뇌 검수: useFood=false면(오늘 진짜 문제가 환경이라 음식 억지 금지) 음식 추천 본문 제외(B의 'off-target 음식 박기' 차단). 기본=결정론 추천.
          //   ⭐ 슬롯→본문 전파(자가정독 #2): planSlot이 있으면 bridgeFacts target/식재료를 '슬롯'으로(결핍군 대표=두부 회귀 차단 → 메추리알장조림 등 구체 dish가 본문에).
          // ⭐ #1 슬롯-본문 이혼 봉합(랄프위검 2026-06-19) — 음식-제안 시나리오(집-기관격차·영양공백·반복메뉴)는 promptHint가 '결핍군(콩류)을 채우라'라 본문이 어차피 음식을 권한다.
          //   이런 날 brain.useFood=false면 slotFood가 null이 돼 슬롯 강제가 풀리고 시나리오의 콩류→두부 디폴트가 이겨 '메타=메추리알, 본문=두부' 이중장부가 났다. 음식 시나리오엔 _noFood를 끄고 슬롯 음식을 본문에 강제(두부 차단). (brain↔scenario↔unit 정합은 별도 EPIC.)
          const _foodScen = new Set(['home-daycare-gap', 'nutrient-gap', 'repeat-menu']);
          const _noFood = !!(brainPick && brainPick.useFood === false) && !_foodScen.has(scenarioId || '');
          const _recoTarget = planSlotCtx?.slot ? planSlotCtx.slot.group : (planCtx?.target ?? null);
          // ⭐ F-18 슬롯본문봉합(랄프위검 2026-06-19 rank1) — 슬롯이 정한 구체 dish(단호박찜·치즈스틱)를 본문 음식 제안으로 강제(must-weave).
          //   직전 라운드: 슬롯은 단호박인데 본문은 결핍군 대표(콩류→두부)로 회귀. slotDish/slotFood를 작문기에 넘겨 본문에 1회 직조 + linter 재생성. 환경(useFood=false) 편지는 음식 제안 없음 → null.
          const slotDish = (!_noFood && planSlotCtx?.slot?.dishes?.length) ? planSlotCtx.slot.dishes[0] : null;
          const slotFood = (!_noFood && planSlotCtx?.slot) ? planSlotCtx.slot.cookedName : null;
          // ⭐ F-18b — 슬롯이 음식 타깃을 정한 날은 bridgeFacts의 '잘 먹는 음식→사촌'(예 감자→두부)을 끄다(슬롯과 경쟁해 본문 두부 회귀시키던 근원). 슬롯이 곧 푸드체이닝 타깃.
          const bridgeFacts = _noFood ? '' : buildRecoFacts({ likedIngredients: likedSeed, target: _recoTarget, targetIngredient: recoIng, freqMap, suppressCousins: !!slotFood }).text;
          // ⭐ F-18 거울↔슬롯 정합(랄프위검 2026-06-19) — 한 편지에 음식 타깃 2개(슬롯 vs 거울 결핍군)가 충돌하면 LLM이 결핍군(콩류→두부)을 택하고 슬롯을 버린다.
          //   슬롯이 음식 타깃을 정한 날은 거울을 슬롯에 맞춘다: (1)거울 결핍군 없음(covered/macro)=그대로 (2)결핍군==슬롯군=정합(dish 포함 유지) (3)결핍군≠슬롯군=결핍군을 '호명하지 않는' generic-positive(콩류 단어 자체를 빼 두부 재소환 차단). 슬롯이 콩류 supply인 날엔 거울도 콩류라 자연 정합.
          // ⭐ F-18 거울 음식 = 항상 '그날 슬롯 음식'(랄프위검 2026-06-19) — deficitDishFor(콩류→두부 디폴트)를 거울에서 완전 제거.
          //   결핍군과 슬롯이 충돌(콩류 거울 vs 단호박 슬롯)하면 LLM이 두부를 택해 본문이 두부로 회귀하던 근원. 거울이 가리키는 음식과 슬롯 음식을 단일화한다.
          //   (1)결핍군 없음(칭찬/쿨다운/macro)=그대로 (2)환경 코칭 날(_noFood)=본문에 음식 없음 → 거울에 슬롯 음식 소프트 노출('음식 추천 항상 포함'·이사님 2026-06-15 복원) (3)음식 액션 날=본문이 슬롯 음식 직조 → 거울은 음식 없는 generic(중복·두부 디폴트·경쟁 전부 차단).
          const _mirror = planSlotCtx?.mirror ?? null;
          const _slotDishAny = planSlotCtx?.slot ? (planSlotCtx.slot.dishes?.[0] ?? planSlotCtx.slot.cookedName) : null;
          // ⭐ F-18b(랄프위검 47점 rank2) — 환경(_noFood) 레버 날도 슬롯 음식을 본문에 1회 소프트 직조. 기존엔 slotFood/slotDish가 null이라 본문 must-weave가 안 돌고, 음식이 거울 _foodClause로만 흐르다 LLM이 누락(06-11~19 5연속 본문 음식 증발). 작문기 softSlot must-weave로 음식 이름 보장(환경이 주제·음식은 곁들임).
          //   곁들임 앵커는 '식재료명(cookedName: 단호박·검은콩·두부)' 우선 — 슬롯 dishes[0]가 맨 조리법('찜'·'조림')만일 때 불완전 음식이 돼 LLM이 못 녹이는 걸 차단(식재료명은 항상 일관된 음식).
          const softSlotDish = (_noFood && planSlotCtx?.slot) ? (planSlotCtx.slot.cookedName ?? _slotDishAny) : null;
          // ⭐ C(랄프위검 2026-06-19 #4) — 거울 문장 daySeed 변주(템플릿 마모 차단). '어린이집 덕에 두루 챙기고'·'환경 자리잡으면 X 곁들여'가 4~11통 축자 반복되던 것.
          const _posV = attends
            ? ['어린이집 덕에 여러 식품군을 두루 잘 챙기고 있어요', '기관 급식이 영양을 든든히 받쳐주고 있어요', '어린이집에서 여러 음식을 골고루 만나고 있어 든든해요']
            : ['여러 식품군을 두루 만나 균형이 좋아지고 있어요', '식단이 조금씩 고르게 채워지고 있어요', '여러 음식을 두루 만나는 흐름이 좋아요'];
          const _posBase = _posV[((daySeed % _posV.length) + _posV.length) % _posV.length];
          const _mirrorRaw = !planSlotCtx ? undefined
            : _noFood   // ⭐ F-18b(랄프위검 47점 rank2) — 환경 코칭 날 슬롯 음식은 본문 softSlot로 직조(프롬프트+must-weave). 거울은 순수 generic-positive.
              ? _posBase
              // ⭐ 슬롯 정렬 거울(이사님 2026-06-20) — 거울[i]=슬롯[i] 군. supply 날 결핍거울은 슬롯 군·슬롯 dish라 본문 추천과 정합(두부 재소환 0·'콩류 부족인데 달걀' 모순 0), challenge 날은 covered/generic. 결핍 라인을 generic으로 버리던 기존 분기 폐기.
              : (_mirror?.line ?? null);
          // ⭐ 영양거울 출현빈도 쿨다운(이사님 2026-06-20) — '어린이집 덕에 영양 채워진다' 거울줄이 거의 매일 박혀 24통 중 17통.
          //   변주가 아니라 출현 자체를 격일화: 최근 2일 안에 거울이 나왔으면 오늘은 생략. degrade-safe: 전체(집+기관) 부족 2개+ = 심한 결핍이면 면제.
          //   ⭐ 골든완화(이사님 승인 2026-06-20) — 무슬롯(저데이터·plateau) 경로도 동일 쿨다운 적용(변종 안심줄 격일화). _cooldownDue를 base로 전달.
          const _mirrorSevere = gMissing.length >= 2;
          const _cooldownDue = mirrorCooldownDue(recentMirrorShown[cid] || [], { cooldownDays: 2, severe: _mirrorSevere });
          // 슬롯 날: 쿨다운이면 라인 생략(mirrorPlanned=true 보존 → K-04b 경로). 슬롯 없는 날: base.mirrorCooldown으로 mirrorBlock 폴백이 처리.
          const mirrorLineSel = (typeof _mirrorRaw === 'string' && _mirrorRaw && _cooldownDue) ? null : _mirrorRaw;
          const _hasDeficitDay = gMissing.length > 0 || (attends && gHomeMissing.length > 0);
          // ⭐ 거울 노출 이력(쿨다운용) — 슬롯 날=라인 선택 여부 · 무슬롯=결핍 있거나 쿨다운 아니면 표시(쿨다운+결핍없음만 생략, mirrorBlock 폴백과 정합).
          mirrorShownCtx = planSlotCtx ? !!mirrorLineSel : (_hasDeficitDay || !_cooldownDue);
          // ⭐ 통합 작성기(크론·온디맨드 공유) — 계획 주입 → 생성 → 안전 재생성 → 어휘 유사도 재생성
          // 끝줄 권유는 하루 하나만 — profileNudge 우선, 없으면 구조화 개선 팁을 ~주1회만 노출(매일=잔소리 금지·Q5).
          const profileN = recentLoggedDays >= RECENT_WINDOW ? profileNudgeFor(cid) : null;
          const sTip = (!profileN && recentLoggedDays >= RECENT_WINDOW && ((daySeed + cidHash) % 7) === 0)
            ? structuredTip(structuredSig, meta.age_band, daySeed + cidHash) : null;
          // ⭐ #4b 초기 1~3주, 메타(식감·자율성·환경·식사시간)를 한 번도 안 찍은 부모에게 '왜 찍으면 좋은지' 초대(평가 아님).
          //   기성 nudge는 recentLoggedDays>=RECENT_WINDOW를 요구해 초기엔 0개라, 이 자리가 초기 사용자의 유일한 권유 채널.
          const metaInv = (!profileN && !sTip) ? metaInputNudge(structuredSig, loggedDaysTotal, daySeed + cidHash) : null;
          const base = {
            childName: meta.nickname, ageBand: meta.age_band,
            eatenCount: new Set(allIng).size, reds: gReds, covered: fg.covered, missing: gMissing,   // ⭐ #4a 1주일차(기록<7일) 결핍 끄기 — covered(잘 먹음)는 유지, 부족 단정만 차단
            notes: fc.noteCards, factCards: fc.cards, parentQuestions, refused: sanitizeRefusals(uniqRef), favoriteFoods, favoriteFreq, homeRefused: sanitizeRefusals(homeRef), daycareRefused: sanitizeRefusals(daycareRef),   // ⭐ 메모=날짜·시계열 라벨 분류본, 사실 주장=사실 카드 안에서만('1번') · favoriteFreq=집 끼니 빈도(D)
            timeseries: ts, attendsDaycare: attends, pastLetters,   // timeseries=원본 ts(composeLetter가 최종 시나리오 기준 필터)
            recentWindowDays: RECENT_WINDOW, recentLoggedDays,
            homeMissing: gHomeMissing, homeReds: gHomeReds, homeDays: homeDays.length,
            chronicGuidance: chronicGuidanceText(meta.chronic),
            bridgeFacts, snackEval: snackText, growthMirror: planSlotCtx?.macroPhrase ?? growthMirrorCtx,   // ⭐ E-04 + 주간계획 macro 슬롯(저체중/성장더딤 탄단지) 우선
            slotFood, slotDish, softSlotDish,   // ⭐ F-18 — 슬롯이 정한 구체 음식(본문 음식 제안 강제·두부 회귀 차단) · F-18b softSlotDish=환경 레버 날 곁들임 직조 타깃
            slotTrack: (!_noFood && planSlotCtx?.slot) ? planSlotCtx.slot.track : null, slotPairLiked: (!_noFood && planSlotCtx?.slot) ? (planSlotCtx.slot.pairLiked ?? null) : null,   // ⭐ 카테고리정합 — supply/challenge·잘 먹는 짝(프레이밍 분기·명시 연결)
            // ⭐ 주간계획 영양거울 스케줄(이사님 2026-06-18) — 결핍군 회전·단일결핍 격일 쿨다운(K-04b). plan_detail 있으면 그날 슬롯 라인 사용(null=쿨다운 생략). F-18=슬롯≠결핍군 날은 dish 없는 generic 라인(경쟁 두부 제거).
            mirrorLine: mirrorLineSel, mirrorPlanned: !!planSlotCtx, mirrorCooldown: _cooldownDue,   // ⭐ 무슬롯 경로 쿨다운(골든완화) — mirrorBlock 폴백이 순수 positive 안심을 생략
            profileNudge: profileN, structuredTip: sTip ?? metaInv,   // ⭐ #4b 초기엔 메타 입력 초대가 이 한 줄 채널을 대신 채움
            weeklyArc: weekCtx?.arc ?? null,   // ⭐ 주간 코칭 커리큘럼(부모 행동변화 단계) — 편지가 '왜→강화' 톤으로 가르침
          };
          const detInput = [...ts, ...fc.noteCards, ...uniqRef].join(' ');   // 증상 근거 = 라벨 포함 메모 카드(시계열 분류본)
          const out = await composeLetter({ base, precomputed, detInput, detForbid: detForbidRe, deadlineMs: runStart + TIME_BUDGET_MS - 4000, daySeed, cidHash });   // S7: 데드라인 강등 — SIGKILL 좀비(6/12 사고) 방지
          letter = out.letter; oneliner = out.oneliner; coachRegen = out.coachRegen;
          verifyCtx = out.verify; modelUsed = out.modelUsed;
          // ⭐ 자동 반복 경보 — 발행 시점에 직전 편지들과 유사도·시그니처 연속을 자가 측정해 기록(cron_runs.issues + context)
          if (pastLetters.length && letter) simToPrev = Math.round(Math.max(...pastLetters.map((q) => letterSimilarity(letter, q.letter))) * 1000) / 1000;
          const sigRun = planCtx?.signature ? (recentPlans[cid] || []).slice(0, 2).filter((p2) => p2.signature === planCtx?.signature).length : 0;
          if ((simToPrev ?? 0) >= 0.6 || sigRun >= 2) {
            repeatAlert = true;
            issues.push(`반복경보 ${meta.nickname}: 직전 유사도 ${simToPrev ?? 0} · 직전2일 동일 시그니처 ${sigRun}건(${planCtx?.signature || '-'})`);
          }
          if (verifyCtx && verifyCtx.ok === false) issues.push(`검증위반 발행 ${meta.nickname}: ${verifyCtx.violations.slice(0, 2).join(' / ')}`.slice(0, 160));   // fail-open이되 어드민 보고서에 즉시 노출
        }
        if (letter) {
          // QA용 "우리 판단" 스냅샷 — 어드민 쓰레드에서 이 근거로 생성됐음을 보여줌
          const letterCtx = {
            reds, covered: fg.covered, missing: fg.missing, timeseries: ts,
            homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)],
            // P10 분리 근거 — 집 끼니만의 부족(칭찬·코칭은 이 기준). 어드민에서 '전체 OK인데 집은 부족'을 검증.
            homeMissing: homeFg.missing, homeReds, homeDays: homeDays.length,
            eatenCount: new Set(allIng).size, attendsDaycare: !!daycareMap[cid], notesCount: notes.length,
            source: reusedThis ? 'cron(재사용)' : (force ? 'cron(force)' : 'cron'), model: modelUsed,
            verify: verifyCtx,   // ⭐ 의미 검증자(발행 전 1콜) 결과 — 위반·재작성 여부(어드민 검증)
            scenarioId, scenarioLabel, parentQuestions,   // 오늘의 코칭 시나리오 + 부모 질문(최우선 답변 대상·디버그/어드민)
            plan: planCtx,   // ⭐ 구조화 계획(프레임·타깃·무브·시그니처) — 다음날 의미 중복 회피 이력(상태 원장)
            coachRegen,   // 비중복 가드로 재생성됐는지(최근 편지와 유사도 ≥0.45)
            simToPrev, repeatAlert,   // ⭐ 반복 자가 측정·경보(어드민 반복 모니터 — 2026-06-11)
            snack: snackEval?.summary || null,   // 간식 엔진 판단 스냅샷(어드민 검증)
            snackShown: snackShownCtx,   // ⭐ 오늘 간식 멘트 노출 여부 — 쿨다운 이력
            mirrorShown: mirrorShownCtx,   // ⭐ 영양거울 노출 여부(2026-06-20) — 출현빈도 쿨다운 이력(슬롯 날=라인 선택 여부·슬롯 없는 날=K-03 결핍 폴백)
            growthShown: growthShownCtx, growthMirror: growthMirrorCtx,   // ⭐ E-09 — 성장 거울 노출(격주 케이던스 이력)·어드민
            weekly: weekCtx,   // ⭐ 주간 닻(작전층) 사용 여부·소견·채근 적용 — 어드민 검증
            planSlot: planSlotCtx ? { slotIndex: planSlotCtx.slotIndex, ingredient: planSlotCtx.slot.ingredient, dishes: planSlotCtx.slot.dishes, group: planSlotCtx.slot.group, track: planSlotCtx.slot.track, via: planSlotCtx.slot.via, mirror: planSlotCtx.mirror?.line ?? null, mirrorKind: planSlotCtx.mirror?.kind ?? null, macro: planSlotCtx.macroPhrase ?? null } : null,   // ⭐ 주간계획 모듈 — 오늘 소비한 슬롯(구체 dish 회전·거울·macro) 어드민 가시화
            brain: brainPick,   // ⭐ 두뇌 선택+검수(?brain=1) — 시나리오·useFood·근거(어드민 노출)
            curriculum: curriculumDecision ? { unit: curriculumDecision.unit, step: curriculumDecision.step, mode: curriculumDecision.mode, pivotTo: curriculumDecision.pivotTo } : null,   // ⭐ F-09 — 오늘 커리큘럼 결정(원장·어드민·다음날 coachedDays)
            curriculumSummary,   // ⭐ F-15 — 진도 요약 스냅샷(어드민)
            recoIng, recoPool: recoPoolArr, recoMode,   // ⭐ 오늘 추천 식재료(회전) + 주간 풀 5개 + 모드(보급/도전) — 일일 회전 이력·어드민
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
          let unitProbe: { unit_id: string; signal: string; probeId: string } | null = null;
          // ⭐ P0-D(이사님 2026-06-19) — ICFQ 위험 스크리너가 아닌 날엔, 오늘 focus 유닛의 1차 신호 프로브를 결정론 질문으로 던진다(정규 칩 + unitProbe).
          //   이게 '답해도 신호로 안 흐르던' 다리를 이어 envTablePct7d 등 양성신호 표본을 쌓아 졸업(passWhen)을 푼다. 유닛/프로브 없으면 LLM 질문 폴백(degrade-safe).
          let up: ReturnType<typeof pickUnitProbe> = null;
          try { up = !icfq ? pickUnitProbe(curriculumDecision?.unit, Math.floor(Date.parse(today) / 86400000)) : null; } catch { up = null; }   // 일별(day-number) 회전 — 유닛 내 2프로브 번갈아
          if (icfq) { q = { question: icfq.q, topic: 'icfq', chips: icfq.chips }; icfqKey = icfq.key; }
          else if (up) { q = { question: up.question, topic: up.topic, chips: up.chips }; unitProbe = up.unitProbe; }
          else q = await generateQuestion({
            childName: meta.nickname, ageBand: meta.age_band,
            recentMeals, homeRefused: sanitizeRefusals(homeRef), daycareRefused: sanitizeRefusals(daycareRef), refused: sanitizeRefusals(uniqRef), attendsDaycare: daycareMap[cid], pastQA,
            topicHint: pickQuestionTopic(today, [...cid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0)).hint,   // ⭐ 결정론 주제 로테이션(완식 반복 방지)
          });
          if (q.question) {
            const qCtx = { recentMeals: recentMeals.slice(0, 12), homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)], attendsDaycare: !!daycareMap[cid], topic: q.topic || null, source: 'cron', icfq: icfqKey, unitProbe };   // ⭐ A-07·G-08 — 답변→evidence 적립 키 · P0-D unitProbe=프로브 답변→신호 다리
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
      } finally {
        // ⭐ 유지비용 실측 — 이 자녀의 모든 LLM 콜(편지·질문·주간) 사용량을 합산해 llm_usage 1행 upsert.
        //    continue·정상·throw 모든 경로에서 실행(finally). 테이블 없거나 실패해도 코칭 무영향(try-catch).
        try {
          const _recs = getUsage();
          if (_recs.length) {
            const a = aggregateUsage(_recs);
            await supabase.from('llm_usage').upsert({
              child_id: cid, parent_id: meta.parent_id, usage_date: today, calls: a.calls,
              haiku_in: a.fam.haiku.input, haiku_cache_read: a.fam.haiku.cacheRead, haiku_cache_write: a.fam.haiku.cacheWrite, haiku_out: a.fam.haiku.output,
              sonnet_in: a.fam.sonnet.input, sonnet_cache_read: a.fam.sonnet.cacheRead, sonnet_cache_write: a.fam.sonnet.cacheWrite, sonnet_out: a.fam.sonnet.output,
              cost_usd: Number(a.costUsd.toFixed(6)), detail: a.fam,
            }, { onConflict: 'child_id,usage_date' });
          }
        } catch { /* llm_usage 테이블 미존재/실패 — 코칭 무영향(SQL 실행 전 안전 degrade) */ }
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

    // ⭐ 편지·질문·주간·진도·기간요약 기록 끝 → /admin 캐시 무효화('편지 쓰면 어드민에 반영').
    //    블랭킷 'admin' 한 번이면 홈+모든 자녀 스레드 커버. 온디맨드 ?child= 경로도 같은 라우트라 함께 갱신.
    //    { expire:0 } = 즉시 만료(다음 첫 방문이 곧장 fresh) — 'max'(stale-while-revalidate)면 편지 쓴 직후
    //    첫 로드가 옛 데이터라 'QA하러 열었더니 새 편지가 없네'가 됨. 크론은 외부 트리거이므로 즉시만료가 정석.
    //    캐시 핸들러 부재 등 어떤 실패도 코칭에 영향 없게 try-catch.
    try { revalidateTag('admin', { expire: 0 }); } catch { /* no-op */ }

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
