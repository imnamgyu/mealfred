/**
 * POST /api/coach — AI 편식 코치 (조언 편지 + 진단 한줄)
 *
 * 최근 식사 기록(정량 분석값·거부·집/기관·시계열·정성 메모)을 받아
 * 편식극복키트 01_참고자료 근거로 안심 편지 + 진단 한줄을 생성한다.
 * 생성 규칙·프롬프트는 lib/coach.ts에 공유(DRY) — 라우트·새벽 크론이 동일 로직 사용.
 *
 * body: LetterInput (childName, ageBand, reds[], covered[], missing[], notes[]/recentNotes[],
 *       refused[], homeRefused[], daycareRefused[], timeseries[], eatenCount, pastLetters[])
 * resp: { letter, oneliner }
 *
 * 스펙: 편식극복키트/06_운영/카톡코칭/코칭엔진_스펙_v1.md
 */
import { NextRequest, NextResponse } from 'next/server';
import { composeLetter, planFor, sanitizeRefusals, SNACK_CHANNEL, type LetterInput, type CoachPlan } from '@/lib/coach';
import { neighborsOf } from '@/lib/foodGraph';
import { type CoachSignals } from '@/lib/coachScenarios';
import { chronicGuidanceText } from '@/lib/coachChronic';

const ALLOWED = ['https://www.mealfred.com', 'https://mealfred.com', 'https://app.mealfred.com', 'https://mealfred-app.vercel.app'];
function cors(req: NextRequest) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[2],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(null, { headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const b = await req.json();
    const notes = b.notes || b.recentNotes;   // recentNotes = 기존 클라 필드명 호환
    // 검증된 푸드 브릿지(그래프) — 클라가 보낸 잘 먹는 식재료 → 사촌/궁합. 편지가 궁합을 지어내지 않게.
    const likedIng: string[] = Array.isArray(b.favoriteIngredients) ? b.favoriteIngredients : [];
    const likedSet = new Set(likedIng);
    const bridgeFacts = likedIng.slice(0, 8).map((liked) => {
      const nb = neighborsOf(liked).filter((n) => !likedSet.has(n.nm));
      const br = nb.filter((n) => n.kind === 'bridge').slice(0, 3).map((n) => n.nm);
      const pr = nb.filter((n) => n.kind === 'pair').slice(0, 3).map((n) => n.nm);
      const parts = [...(br.length ? [`사촌 ${br.join('·')}`] : []), ...(pr.length ? [`궁합 ${pr.join('·')}`] : [])];
      return parts.length ? `${liked} → ${parts.join(', ')}` : null;
    }).filter(Boolean).slice(0, 5).join(' / ');
    // ⭐ 크론과 동일 엔진(DRY) — planFor(계획: 프레임·타깃·무브·시그니처 회피) → composeLetter(작문 + 안전·유사도 재생성).
    //    중복 회피 이력(recentScenarioIds·recentPlans)은 홈이 coach_letters.context에서 읽어 보낸다(없으면 [] = 1회 폴백).
    const signals: CoachSignals = {
      timeseries: b.timeseries || [], reds: b.reds || [], homeReds: b.homeReds || [],
      missing: b.missing || [], homeMissing: b.homeMissing || [],
      homeRefused: sanitizeRefusals(b.homeRefused || []), daycareRefused: sanitizeRefusals(b.daycareRefused || []), refused: sanitizeRefusals(b.refused || []),
      notes: notes || [], favoriteFoods: b.favoriteFoods || [],
      attendsDaycare: !!b.attendsDaycare, ageBand: b.ageBand || '',
      recentLoggedDays: b.recentLoggedDays ?? 5, recentWindow: 5, icfqRiskCount: b.icfqRiskCount ?? 0,
    };
    const daySeed = b.today ? Math.floor(Date.parse(b.today) / 86400000) : Math.floor(Date.now() / 86400000);
    let cidHash = 0; const seedKey = String(b.seedKey || b.childName || ''); for (let k = 0; k < seedKey.length; k++) cidHash = (cidHash * 31 + seedKey.charCodeAt(k)) >>> 0;
    const recentPlans: CoachPlan[] = Array.isArray(b.recentPlans) ? b.recentPlans : [];
    const recentScenarioIds: string[] = Array.isArray(b.recentScenarioIds) ? b.recentScenarioIds : [];
    const precomputed = planFor({ signals, recentScenarioIds, recentPlans, daySeed, cidHash });
    const base: LetterInput = {
      childName: b.childName, ageBand: b.ageBand, eatenCount: b.eatenCount,
      reds: b.reds, covered: b.covered, missing: b.missing, notes,
      refused: sanitizeRefusals(b.refused || []), homeRefused: sanitizeRefusals(b.homeRefused || []), daycareRefused: sanitizeRefusals(b.daycareRefused || []),
      favoriteFoods: b.favoriteFoods, homeReds: b.homeReds, homeMissing: b.homeMissing,
      timeseries: b.timeseries || [], attendsDaycare: !!b.attendsDaycare, pastLetters: b.pastLetters,
      recentWindowDays: 5, recentLoggedDays: b.recentLoggedDays,
      chronicGuidance: chronicGuidanceText(b.chronicConditions),
      bridgeFacts, snackEval: (typeof b.snackEval === 'string' && !(precomputed.plan.target && SNACK_CHANNEL.has(precomputed.plan.target))) ? b.snackEval : null,   // 과일이 오늘 타깃이면 간식 멘트 중복 제거
    };
    const detInput = [...(b.timeseries || []), ...(notes || []), ...sanitizeRefusals(b.refused || [])].join(' ');
    const out = await composeLetter({ base, precomputed, detInput, daySeed, cidHash });
    return NextResponse.json({ letter: out.letter, oneliner: out.oneliner, scenarioId: out.scenarioId, scenarioLabel: out.scenarioLabel, plan: out.plan }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[coach] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers });
  }
}
