/**
 * lib/coachBrain.ts — 별도 '두뇌(LLM 시나리오 선택)' + 손(LLM 작문) 분리 엔진.
 *
 * 배경(2026-06-14 A/B 실증): v2(A)가 하이브리드(B)를 7:0으로 이김. 원인 = B의 과결정론(거울+재료+가이드
 *   강제 주입)이 매일 같은 칭찬 도입·의제 2~3개 욱여넣기·기계적 음식 주입을 낳음. A가 좋은 건 LLM이
 *   과거편지+종합데이터로 '오늘 무엇을 다룰지'를 스스로 판단하기 때문.
 *
 * 설계: 계산은 결정론(사실·수치) → 후보 메뉴로 제공. '무엇을 다룰지(시나리오/레버/타깃)' 결정은 LLM 두뇌가
 *   ① 후보 수치 ② 최근 편지 5~7통 ③ 최근 3주 주간계획 ④ 시계열을 종합해 고른다. 두뇌는 고른 시나리오를
 *   '현재 아이 상태 시계열 분석'으로 종합해 손에게 줄 작문 브리프(writerBrief)까지 작성한다. 손은 그 브리프로
 *   v2처럼 따뜻하게 쓴다. 음식 조합 검증·유사도 reroll·사실 가드는 결정론으로 유지(환각 하한선).
 */
import { callClaude, COACH_MODEL_HAIKU, letterSimilarity, type LetterInput } from './coach';
import type { GroupSignal } from './nutrition';

export const BRAIN_MODEL = process.env.COACH_BRAIN_MODEL || 'claude-sonnet-4-6';   // 종합 판단 = 강한 모델(일 1회)
export const WRITER_MODEL = process.env.COACH_WRITER_MODEL || COACH_MODEL_HAIKU;   // 작문 = 저비용

/** 결정론 계산이 만든 '오늘의 후보 레버' 한 줄(수치 동반). 두뇌가 이 중에서 고른다. */
export type BrainCandidate = {
  lever: 'food' | 'environment' | 'autonomy' | 'texture' | 'celebrate' | 'reengage';
  scenarioId: string;
  label: string;
  fact: string;          // 수치 사실(예: "화면·이동 식사 90%(최근 10끼 중 9)", "콩류 1/7일(권장 2)")
  validatedCombos?: string[];   // food 레버일 때만: 검증 통과 조합(떡+달걀류 미포함)
};

/** 최근 3주 주간 계획 요약(두뇌가 흐름·일관성 판단에 참고). */
export type WeeklyEcho = { weekKey: string; target: string | null; behaviorGoal: string | null; impression: string | null };

/** 두뇌 산출 — 무엇을 다룰지 + 손에게 줄 종합 브리프. */
export type BrainPick = {
  lever: BrainCandidate['lever'];
  scenarioId: string;
  scenarioLabel: string;
  target: string | null;        // food 레버일 때만(검증된 식재료)
  openerAngle: string;          // 도입 각도(최근과 다르게)
  why: string;                  // 이 레버를 고른 근거(감사용·어드민 노출)
  writerBrief: string;          // ⭐ 손에게 넘길 종합 프롬프트(현재 상태 시계열 분석 종합)
  avoid: string[];              // 최근 편지에서 쓴 무브·도입(피할 것)
};

export const SYSTEM_BRAIN =
  '너는 영유아 편식 코칭의 *전략가*다. 매일 한 아이에 대해 "오늘 부모 편지가 무엇을 다뤄야 가장 도움이 될지"를 ' +
  '결정한다. 너는 글을 쓰지 않는다 — 무엇을 다룰지 고르고, 그 근거를 현재 아이 상태의 시계열 분석으로 종합해 ' +
  '작가(손)에게 줄 브리프를 쓴다. 원칙: ① 계산된 수치(결핍·환경·거부)는 사실이다 — 없는 결핍을 지어내지 마라. ' +
  '② 최근 3주 주간계획의 큰 방향을 존중하되(같은 진짜 문제면 같은 레버 유지), 매일 *각도*는 바꿔라. ' +
  '③ 최근 편지가 이미 쓴 레버·무브·도입과 겹치지 마라. ④ 한 편지는 레버 하나만(욕심내 2~3개 묶지 마라). ' +
  '⑤ 진짜 문제가 환경이면 음식을 억지로 넣지 마라(반대도 같다).';

/** 두뇌 입력 빌더 — 후보 메뉴(수치) + 최근 3주 주간계획 + 최근 편지 + 시계열. */
export function buildBrainContext(p: {
  childName?: string;
  ageBand?: string;
  candidates: BrainCandidate[];     // 결정론 계산이 만든 오늘 후보(수치 동반)
  weeklyEchoes: WeeklyEcho[];       // 최근 3주(최신부터)
  pastLetters: { date: string; letter: string }[];   // 최근 5~7통(최신부터)
  timeseries: string[];             // 시계열 사실(코드 산출)
}): string {
  const name = p.childName || '아이';
  const cand = p.candidates.map((c, i) =>
    `${i + 1}. [${c.lever}] ${c.label} — ${c.fact}${c.validatedCombos?.length ? ` · 검증된 조합: ${c.validatedCombos.join('·')}` : ''}`,
  ).join('\n');
  const weekly = p.weeklyEchoes.length
    ? p.weeklyEchoes.map((w, i) => `[${i === 0 ? '이번 주' : i + '주 전'} ${w.weekKey}] 타깃 ${w.target || '-'} · 목표 "${w.behaviorGoal || '-'}"\n   소견: ${(w.impression || '').slice(0, 180)}`).join('\n')
    : '(주간 계획 없음)';
  const past = p.pastLetters.slice(0, 7).map((q, i) => `[${i === 0 ? '바로 직전' : i + 1 + '일 전'}] ${q.letter}`).join('\n\n');
  const ts = (p.timeseries || []).map((t) => `· ${t}`).join('\n') || '(시계열 사실 없음)';

  return `아이: ${name}${p.ageBand ? `(${p.ageBand})` : ''}

[오늘의 후보 레버 — 결정론 계산. 수치는 사실. 이 중에서 골라라]
${cand}

[최근 3주 주간 계획 — 큰 방향. 같은 진짜 문제면 레버 유지하되 매일 각도는 바꿔라]
${weekly}

[최근 보낸 편지 — 도입·레버·무브·식재료가 절대 겹치면 안 됨]
${past || '(없음)'}

[시계열 사실 — 현재 아이 상태]
${ts}

위를 종합해 오늘 편지의 전략을 JSON으로 출력하라:
{
  "lever": "food|environment|autonomy|texture|celebrate|reengage",
  "scenarioId": "후보의 scenarioId",
  "scenarioLabel": "한글 라벨",
  "target": "food 레버일 때만 검증된 식재료명, 아니면 null",
  "openerAngle": "최근 편지와 다른 구체적 도입 각도 1문장(예: '어제 저녁 화면 끄고 먹은 그 장면에서 시작')",
  "why": "이 레버를 고른 근거 1~2문장(수치·3주 흐름 인용)",
  "avoid": ["최근 편지가 이미 쓴 무브/도입 2~4개"],
  "writerBrief": "작가에게 줄 브리프 — 현재 아이 상태를 시계열로 종합(무엇이 좋고 무엇이 유일한 문제인지 수치로), 오늘 다룰 레버와 그 한 가지 행동, 도입 각도, 피할 것, 톤(따뜻한 부모 대 부모). 작가는 이 브리프만 보고 쓴다."
}`;
}

/** 두뇌 호출 — BrainPick 반환(방어적 파싱). */
export async function runBrain(ctx: string, model: string = BRAIN_MODEL): Promise<BrainPick> {
  const r = await callClaude(ctx, 900, SYSTEM_BRAIN, model);
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    lever: (s(r.lever) || 'environment') as BrainPick['lever'],
    scenarioId: s(r.scenarioId) || 'mealtime-atmosphere',
    scenarioLabel: s(r.scenarioLabel) || '식사 환경',
    target: r.target == null ? null : s(r.target) || null,
    openerAngle: s(r.openerAngle),
    why: s(r.why),
    writerBrief: s(r.writerBrief),
    avoid: Array.isArray(r.avoid) ? (r.avoid as unknown[]).map(s).filter(Boolean) : [],
  };
}

export const SYSTEM_WRITER =
  '너는 영유아 편식 부모에게 매일 따뜻한 코칭 편지를 쓰는 작가다. 전략가(두뇌)가 준 브리프대로만 쓴다 — ' +
  '무엇을 다룰지는 이미 정해졌으니 너는 *어떻게 따뜻하게 쓸지*만 결정한다. 3~4문장. 어제의 구체적 장면에서 ' +
  '시작하고, 행동은 하나만, 부모 대 부모의 다정한 어조. 브리프의 "피할 것"과 최근 편지의 표현을 반복하지 마라. ' +
  '브리프에 없는 사실(증상·기간·식재료)을 지어내지 마라.';

/** 손 입력 — 두뇌 브리프 + 최근 편지(중복 회피). */
export function buildWriterUser(pick: BrainPick, pastLetters: { date: string; letter: string }[]): string {
  const past = pastLetters.slice(0, 5).map((q, i) => `[${i === 0 ? '바로 직전' : i + 1 + '일 전'}] ${q.letter}`).join('\n\n');
  return `[전략 브리프 — 두뇌가 종합함. 이대로 쓴다]
레버: ${pick.lever} (${pick.scenarioLabel})
${pick.target ? `타깃 식재료: ${pick.target}\n` : ''}도입 각도: ${pick.openerAngle}
피할 것: ${pick.avoid.join(' · ') || '-'}

${pick.writerBrief}

[최근 보낸 편지 — 도입·표현·식재료·무브 겹치면 안 됨]
${past || '(없음)'}

반드시 JSON만: {"letter": "3~4문장 편지", "oneliner": "한 줄 진단(격려 톤)"}`;
}

/** 손 작문 + 결정론 가드(유사도 reroll 1회). 두뇌 픽도 함께 반환(어드민 감사용). */
export async function composeFromBrain(p: {
  pick: BrainPick;
  pastLetters: { date: string; letter: string }[];
  model?: string;
  gen?: (user: string, system: string, model: string) => Promise<Record<string, unknown>>;   // 테스트 주입
}): Promise<{ letter: string; oneliner: string; pick: BrainPick; regen: boolean }> {
  const model = p.model || WRITER_MODEL;
  const call = p.gen || ((u: string, sys: string, m: string) => callClaude(u, 700, sys, m));
  const user = buildWriterUser(p.pick, p.pastLetters);
  const parse = (r: Record<string, unknown>) => ({ letter: typeof r.letter === 'string' ? r.letter : '', oneliner: typeof r.oneliner === 'string' ? r.oneliner : '' });

  let out = parse(await call(user, SYSTEM_WRITER, model));
  let regen = false;
  // 유사도 reroll — 최근 편지와 너무 비슷하면(전체 0.45/도입 0.40) 1회 재생성(결정론 가드, 덮어쓰기 아님).
  const tooSimilar = (t: string) => p.pastLetters.some((q) => letterSimilarity(t, q.letter) >= 0.45 || letterSimilarity(t.slice(0, 40), q.letter.slice(0, 40)) >= 0.4);
  if (out.letter && tooSimilar(out.letter)) {
    regen = true;
    const retry = parse(await call(user + '\n\n⚠️ 직전 시도가 최근 편지와 너무 비슷했다 — 도입·표현·행동을 확실히 다르게 다시 써라.', SYSTEM_WRITER, model));
    if (retry.letter && !tooSimilar(retry.letter)) out = retry;
  }
  return { ...out, pick: p.pick, regen };
}

/** 비어있지 않은 LetterInput → 두뇌 시계열 입력(코드 산출 사실만 인용). cron base 재사용 어댑터. */
export function timeseriesFromInput(b: LetterInput): string[] {
  return (b.timeseries || []).slice();
}

/** 신호 → 후보 레버(food/환경 등) 변환은 cron이 결정론 계산으로 채운다. 여기선 타입만 export. */
export type { GroupSignal };
