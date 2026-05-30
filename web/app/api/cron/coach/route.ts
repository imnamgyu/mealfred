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
import { createSupabaseServer } from '@/lib/supabase/server';
import { computeSignals, computeFoodGroups, computeTimeseries } from '@/lib/nutrition';
import { generateLetter, generateQuestion, type Place, type LoggedFood } from '@/lib/coach';
import { kstToday, kstDateNDaysAgo } from '@/lib/date';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Hobby plan 한도

const TIME_BUDGET_MS = 50_000; // maxDuration(60s) 전 안전 종료 — SIGKILL 회피해 cron_runs 정상 마감

type Row = {
  child_id: string; parent_id: string | null; log_date: string; slot: string | null;
  ingredients: string[] | null; refused: string | null; note: string | null;
  texture: string | null; menus: string[] | null; place: string | null; ate_well: boolean | null;
};

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });
  }

  const supabase = await createSupabaseServer();
  const runStart = Date.now();
  const today = kstToday();
  const since = kstDateNDaysAgo(6);
  let processed = 0, errors = 0, letters = 0, questions = 0, reused = 0, skippedTime = 0;

  const { data: runRow } = await supabase.from('cron_runs').insert({ job_name: 'coach', status: 'running' }).select('id').single();

  try {
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
      .select('child_id,parent_id,log_date,slot,ingredients,refused,note,texture,menus,place,ate_well')
      .gte('log_date', since);
    if (rErr) throw rErr;

    const byChild: Record<string, Row[]> = {};
    (rows || []).forEach((r: Row) => { (byChild[r.child_id] ||= []).push(r); });

    let activeIds = Object.entries(byChild)
      .filter(([, rs]) => new Set(rs.map((r) => r.log_date)).size >= 3)
      .map(([id]) => id);
    if (!activeIds.length) {
      await supabase.from('cron_runs').update({ status: 'success', finished_at: new Date().toISOString(), processed_count: 0, error_count: 0 }).eq('id', runRow?.id);
      return NextResponse.json({ ok: true, processed: 0, note: '활성 자녀 없음' });
    }

    // 최근 2일 내 편지 → 라운드로빈 정렬 + 식단지문 스킵 판단용 (오래 안 받은 자녀 우선)
    const { data: recentLetters } = await supabase.from('coach_letters')
      .select('child_id,letter_date,source_hash,letter,oneliner')
      .in('child_id', activeIds).gte('letter_date', kstDateNDaysAgo(2))
      .order('letter_date', { ascending: false });
    const lastLetter: Record<string, { letter_date: string; source_hash: string | null; letter: string; oneliner: string | null }> = {};
    (recentLetters || []).forEach((l: { child_id: string; letter_date: string; source_hash: string | null; letter: string; oneliner: string | null }) => {
      if (!lastLetter[l.child_id]) lastLetter[l.child_id] = l;  // 정렬상 첫 = 최신
    });
    activeIds.sort((a, b) => (lastLetter[a]?.letter_date || '').localeCompare(lastLetter[b]?.letter_date || ''));

    // 자녀 메타 + 오늘 이미 생성된 질문(중복 회피)
    const { data: kids } = await supabase.from('children').select('id,parent_id,nickname,age_band').in('id', activeIds);
    const kidMap: Record<string, { parent_id: string; nickname: string; age_band: string }> = {};
    (kids || []).forEach((k: { id: string; parent_id: string; nickname: string; age_band: string }) => { kidMap[k.id] = { parent_id: k.parent_id, nickname: k.nickname, age_band: k.age_band }; });
    const { data: todayQs } = await supabase.from('daily_questions').select('child_id').eq('q_date', today).in('child_id', activeIds);
    const hasQToday = new Set((todayQs || []).map((q: { child_id: string }) => q.child_id));
    // 등원 여부 — daycare 컬럼 마이그레이션 전이면 에러(컬럼없음) → 전부 false로 안전 처리
    const daycareMap: Record<string, boolean> = {};
    const { data: dcRows, error: dcErr } = await supabase.from('children').select('id,daycare').in('id', activeIds);
    if (!dcErr) (dcRows || []).forEach((r: { id: string; daycare: boolean | null }) => { daycareMap[r.id] = !!r.daycare; });

    for (const cid of activeIds) {
      // maxDuration 전 안전 종료 — 남은 자녀는 다음 실행(오래된 순)이 이어받음
      if (Date.now() - runStart > TIME_BUDGET_MS) { skippedTime = activeIds.length - (processed + errors); break; }
      const meta = kidMap[cid];
      if (!meta) continue;
      try {
        const rs = [...byChild[cid]].sort((a, b) => b.log_date.localeCompare(a.log_date) || (b.slot || '').localeCompare(a.slot || ''));  // 최신순 — dedup이 최신 끼니를 남김
        const byDate: Record<string, string[]> = {};
        const allIng: string[] = []; const ref: string[] = []; const notes: string[] = [];
        const homeRef: string[] = []; const daycareRef: string[] = [];
        const recentMeals: LoggedFood[] = []; const seenFood = new Set<string>();
        const menuFreq: Record<string, number> = {};
        const todayMs = Date.parse(today);

        rs.forEach((r) => {
          (byDate[r.log_date] ||= []);
          (r.ingredients || []).forEach((i) => {
            byDate[r.log_date].push(i); allIng.push(i);
            const daysAgo = Math.round((todayMs - Date.parse(r.log_date)) / 86400000);
            if (daysAgo <= 3 && !seenFood.has(i)) {
              seenFood.add(i);
              recentMeals.push({ food: i, place: (r.place as Place) || null, ateWell: r.ate_well, slot: r.slot || undefined, daysAgo });
            }
          });
          if (r.refused) { ref.push(r.refused); if (r.place === 'home') homeRef.push(r.refused); else if (r.place === 'daycare') daycareRef.push(r.refused); }
          if (r.note) notes.push(r.note);
          (r.menus || []).forEach((mn) => { const k = mn.replace(/\s/g, ''); if (k) menuFreq[k] = (menuFreq[k] || 0) + 1; });
        });

        const byDay = Object.values(byDate).filter((a) => a.length);
        if (byDay.length < 3) continue;
        const sig = computeSignals(byDay, catOf);
        const reds = sig.filter((s) => s.level === 'red').map((s) => s.nutrient);
        const fg = computeFoodGroups(allIng, catOf);
        const uniqRef = [...new Set(ref)];
        const ts = computeTimeseries(byDate, menuFreq, catOf, today, { assertNoVeg: catReliable });

        // 식단 지문 — 클라가 동일 해시면 재생성 없이 read (home page와 동일 공식)
        const srcHash = [...allIng].sort().join(',') + '|' + [...uniqRef].sort().join(',') + '|' + [...reds].sort().join(',') + '|' + notes.length;

        // 3) 편지: 직전 편지와 식단 지문이 같으면 LLM 스킵하고 내용 재사용 (비용·시간 절감)
        const prev = lastLetter[cid];
        let letter = '', oneliner = '';
        if (prev && prev.source_hash === srcHash && prev.letter) {
          letter = prev.letter; oneliner = prev.oneliner || ''; reused++;
        } else {
          // 연속성용 과거 편지 (날짜 라벨만 — buildLetterUser가 순서로 변환)
          const { data: pastL } = await supabase.from('coach_letters')
            .select('letter_date,letter').eq('child_id', cid).neq('letter_date', today)
            .order('letter_date', { ascending: false }).limit(5);
          const pastLetters = (pastL || []).map((p: { letter_date: string; letter: string }) => ({ date: p.letter_date, letter: p.letter }));
          const gen = await generateLetter({
            childName: meta.nickname, ageBand: meta.age_band,
            eatenCount: new Set(allIng).size, reds, covered: fg.covered, missing: fg.missing,
            notes, refused: uniqRef, homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)],
            timeseries: ts, attendsDaycare: daycareMap[cid], pastLetters,
          });
          letter = gen.letter; oneliner = gen.oneliner;
        }
        if (letter) {
          // QA용 "우리 판단" 스냅샷 — 어드민 쓰레드에서 이 근거로 생성됐음을 보여줌
          const letterCtx = {
            reds, covered: fg.covered, missing: fg.missing, timeseries: ts,
            homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)],
            eatenCount: new Set(allIng).size, attendsDaycare: !!daycareMap[cid], notesCount: notes.length,
            source: prev && prev.source_hash === srcHash && prev.letter ? 'cron(재사용)' : 'cron', model: 'haiku-4-5',
          };
          await supabase.from('coach_letters').upsert(
            { child_id: cid, parent_id: meta.parent_id, letter_date: today, letter, oneliner: oneliner || null, source_hash: srcHash, context: letterCtx },
            { onConflict: 'child_id,letter_date' }
          );
          letters++;
        }

        // 3-2) 오늘의 질문 — 아직 없을 때만 (답변 덮어쓰기 방지)
        if (!hasQToday.has(cid)) {
          const { data: pastQ } = await supabase.from('daily_questions')
            .select('question,answer').eq('child_id', cid).neq('q_date', today)
            .order('q_date', { ascending: false }).limit(5);
          const pastQA = (pastQ || []).map((p: { question: string; answer: string | null }) => ({ q: p.question, a: p.answer || '' }));
          const q = await generateQuestion({
            childName: meta.nickname, ageBand: meta.age_band,
            recentMeals, homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)], refused: uniqRef, attendsDaycare: daycareMap[cid], pastQA,
          });
          if (q.question) {
            const qCtx = { recentMeals: recentMeals.slice(0, 12), homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)], attendsDaycare: !!daycareMap[cid], topic: q.topic || null, source: 'cron' };
            await supabase.from('daily_questions').upsert(
              { child_id: cid, parent_id: meta.parent_id, q_date: today, question: q.question, topic: q.topic || null, chips: q.chips || null, context: qCtx },
              { onConflict: 'child_id,q_date' }
            );
            questions++;
          }
        }
        processed++;
      } catch (e: unknown) {
        console.error('[cron/coach] child', cid, e instanceof Error ? e.message : e);
        errors++;
      }
    }

    await supabase.from('cron_runs').update({
      status: skippedTime > 0 ? 'partial' : 'success', finished_at: new Date().toISOString(),
      processed_count: processed, error_count: errors,
      meta: { letters, questions, reused, active: activeIds.length, skippedTime },
    }).eq('id', runRow?.id);

    return NextResponse.json({ ok: true, processed, errors, letters, questions, reused, skippedTime, active: activeIds.length, duration_ms: Date.now() - runStart });
  } catch (e: unknown) {
    await supabase.from('cron_runs').update({
      status: 'failure', finished_at: new Date().toISOString(),
      meta: { error: e instanceof Error ? e.message : String(e) },
    }).eq('id', runRow?.id);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
