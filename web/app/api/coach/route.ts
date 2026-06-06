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
import { generateLetter, sanitizeFoods, sanitizeTimeseries, ALLOW_TRANSITION } from '@/lib/coach';
import { neighborsOf } from '@/lib/foodGraph';
import { selectScenario } from '@/lib/coachScenarios';
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
    // 온디맨드 편지도 시나리오 각도 적용(다양성). 단발 생성이라 중복 회피 이력은 없음([]).
    const scenario = selectScenario({
      timeseries: b.timeseries || [], reds: b.reds || [], homeReds: b.homeReds || [],
      missing: b.missing || [], homeMissing: b.homeMissing || [],
      homeRefused: b.homeRefused || [], daycareRefused: b.daycareRefused || [], refused: b.refused || [],
      notes: notes || [], favoriteFoods: b.favoriteFoods || [],
      attendsDaycare: !!b.attendsDaycare, ageBand: b.ageBand || '',
      recentLoggedDays: b.recentLoggedDays ?? 5, recentWindow: 5, icfqRiskCount: b.icfqRiskCount ?? 0,
    }, []);
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
    // ⭐ 사실 누수 차단 — 전환사실은 허용 시나리오만 + 거부값/시계열 정규화(크론과 동일)
    const tsForLetter = sanitizeTimeseries(ALLOW_TRANSITION.has(scenario.id) ? (b.timeseries || []) : (b.timeseries || []).filter((t: string) => !/거부→수용 전환|받아들이기 시작/.test(t)));
    const { letter, oneliner } = await generateLetter({
      childName: b.childName,
      ageBand: b.ageBand,
      eatenCount: b.eatenCount,
      reds: b.reds,
      covered: b.covered,
      missing: b.missing,
      notes,
      refused: sanitizeFoods(b.refused || []),
      homeRefused: sanitizeFoods(b.homeRefused || []),
      daycareRefused: sanitizeFoods(b.daycareRefused || []),
      favoriteFoods: b.favoriteFoods,
      homeReds: b.homeReds,
      homeMissing: b.homeMissing,
      timeseries: tsForLetter,
      pastLetters: b.pastLetters,
      scenario: { id: scenario.id, label: scenario.label, promptHint: scenario.promptHint, avoid: scenario.avoid },
      chronicGuidance: chronicGuidanceText(b.chronicConditions),   // 만성질환 식이 방향(클라가 보내면)
      bridgeFacts,   // 검증된 푸드 브릿지(그래프)
      snackEval: typeof b.snackEval === 'string' ? b.snackEval : null,   // 간식 평가(클라가 보내면) — 주 경로는 새벽 크론
    });
    return NextResponse.json({ letter, oneliner }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[coach] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers });
  }
}
