/**
 * lib/coachBrain.ts — '행동 선택 두뇌' (v2 파이프라인용 시나리오 셀렉터).
 *
 * 방향(2026-06-14 이사님 확정): "v2 모든 것 그대로 두고, 행동(시나리오) 선택만 LLM 두뇌로."
 *   v2의 영양평가·어제식단·음식추천(food-graph)·작문·검증·유사도가드는 전부 유지한다.
 *   바뀌는 것은 단 하나 — `planFor`의 결정론적 `selectScenario`(priority+trigger)를, LLM 두뇌가
 *   ① 후보 시나리오 메뉴 ② 최근 3주 주간계획 ③ 최근 편지 ④ 영양/시계열을 종합해 고르는 것으로 교체.
 *   두뇌는 편지를 쓰지 않는다 — scenarioId(+선택적 target/move 힌트·근거)만 반환하고, 나머지는 v2가 한다.
 *
 * 앞선 시도의 교훈: 두뇌에 작문까지 시키면 v2의 알맹이(음식평가·추천)가 사라진다(추상적 환경코칭만 남음).
 *   그래서 두뇌는 '선택'까지만. 작문은 v2 buildLetterUser/composeLetter가 그대로 담당.
 */
import { callLLM, type LetterInput } from './coach';
import { SCENARIOS, type CoachScenario, type CoachSignals } from './coachScenarios';

export const BRAIN_MODEL = 'claude-sonnet-4-6';   // 일간 전술 두뇌. ⭐역할 키 → callLLM이 DeepSeek V4-Pro로 1차 호출, 실패 시 이 Claude Sonnet 폴백(이사님 2026-06-16 DeepSeek 전환·env 제거)

/** 최근 3주 주간 계획 요약(두뇌가 흐름·일관성 판단에 참고). */
export type WeeklyEcho = { weekKey: string; target: string | null; behaviorGoal: string | null; impression: string | null };

/** 두뇌 산출 — v2에 주입할 '무엇을 다룰지'(작문 아님) + 추천 검수 결과. */
export type BrainAction = {
  scenarioId: string;          // SCENARIOS 중 하나(없으면 v2 폴백 selectScenario)
  planTarget: string | null;   // 선택적 타깃 힌트(식품군/거부음식) — v2 buildCoachPlan에 전달, 없으면 v2 결정론
  moveKey: string | null;      // 선택적 무브 키 힌트 — 없으면 v2 결정론 회전
  // ⭐ 검수(audit): 결정론이 계산한 음식 추천 후보를 두뇌가 취사. 환각 0(후보 밖 추가 불가)·off-target만 컷.
  useFood: boolean;            // 오늘 음식 추천을 쓸지(환경이 핵심인 날은 false로 빼기)
  approvedRecs: string[];      // 후보 중 '오늘 이 아이에게 맞다'고 검수 통과한 추천만(후보의 부분집합)
  why: string;                 // 선택·검수 근거(어드민 감사·1~2문장)
};

const SCEN_IDS = new Set(SCENARIOS.map((s) => s.id));

export const SYSTEM_BRAIN =
  '너는 영유아 편식 코칭의 *행동 선택 전략가*다. 편지를 쓰지 않는다 — 오늘 편지가 "어떤 각도(시나리오)로 가야 ' +
  '가장 도움이 될지"만 고른다(작문·영양평가·음식추천 본문은 다른 엔진이 한다). 원칙: ① 계산된 수치(결핍·환경·거부)는 ' +
  '사실 — 없는 문제를 지어내지 마라 ② 후보 시나리오 목록 안에서만 고른다. ③ ⭐**다양성이 최우선** — 최근 편지가 ' +
  '같은 시나리오를 2일 이상 반복했으면 반드시 다른 각도로 바꿔라. 한 신호(예: 환경)가 커도 매일 똑같은 시나리오로 ' +
  '고착되면 잔소리다. 환경·음식·자율성·식감·축하를 며칠에 걸쳐 번갈아 써라. ④ ⭐**음식 결핍을 영영 미루지 마라** — ' +
  '집에 음식 결핍(콩류·과일·비타민A채소 등)이 있으면, 환경이 더 큰 문제라도 며칠에 한 번은 그 음식을 useFood=true로 ' +
  '다뤄라(v2가 콩류↔환경을 교대했던 것처럼). useFood=false는 "오늘은 환경 날"이라 잠시 미루는 것일 뿐, 결핍 자체가 ' +
  '0일 때만 계속 false. 진짜 결핍 없는데 음식 억지로 넣지도 마라(양방향 금지).';

/**
 * 두뇌 입력 — 후보 시나리오 메뉴(트리거 충족분 우선 표시) + 최근 3주 주간계획 + 최근 편지 + 영양/시계열.
 *  signals로 각 시나리오의 trigger 충족 여부를 계산해 '발동 가능' 표시(두뇌가 사실 기반으로 고르게).
 */
export function buildBrainContext(p: {
  childName?: string;
  signals: CoachSignals;            // v2와 동일 신호(시나리오 trigger 평가용)
  nutritionMirror?: string;         // 영양 평가 한 줄(v2 식단 거울 — 참고용)
  recoCandidates?: string[];        // ⭐ 결정론(coachRecos)이 계산한 음식 추천 후보(두뇌가 검수·취사할 대상)
  weeklyEchoes: WeeklyEcho[];       // 최근 3주(최신부터)
  pastLetters: { date: string; letter: string }[];   // 최근 5~7통(최신부터)
  recentScenarioIds?: string[];     // 최근 편지가 쓴 시나리오(겹침 회피)
}): string {
  const name = p.childName || '아이';
  const recos = (p.recoCandidates || []).filter(Boolean);
  const recent = new Set(p.recentScenarioIds || []);
  const menu = SCENARIOS.map((s) => {
    let fires = false;
    try { fires = s.trigger(p.signals); } catch { fires = false; }
    const flags = [fires ? '발동가능' : '비발동', recent.has(s.id) ? '최근사용' : ''].filter(Boolean).join('·');
    return `- ${s.id} (${s.label}, 우선순위 ${s.priority}) [${flags}] — ${s.promptHint.slice(0, 70)}`;
  }).join('\n');
  const weekly = p.weeklyEchoes.length
    ? p.weeklyEchoes.map((w, i) => `[${i === 0 ? '이번 주' : i + '주 전'} ${w.weekKey}] 타깃 ${w.target || '-'} · 목표 "${w.behaviorGoal || '-'}" / 소견 ${(w.impression || '').slice(0, 160)}`).join('\n')
    : '(주간 계획 없음)';
  const past = p.pastLetters.slice(0, 7).map((q, i) => `[${i === 0 ? '직전' : i + 1 + '일 전'}] ${q.letter}`).join('\n\n');

  const recoBlock = recos.length
    ? recos.map((r, i) => `(${i + 1}) ${r}`).join('\n')
    : '(추천 후보 없음 — 음식 결핍 약함)';

  return `아이: ${name}
${p.nutritionMirror ? `\n[영양 평가(참고)] ${p.nutritionMirror}\n` : ''}
[후보 시나리오 — 이 목록 안에서만 골라라. '발동가능'=수치상 조건 충족 · '최근사용'=최근 편지가 씀(피하라)]
${menu}

[음식 추천 후보 — 결정론(food-graph)이 계산. 두뇌가 '오늘 이 아이에게 맞는 것'만 검수·취사. ⚠️ 후보 밖 음식·조합 추가 금지(환각)]
${recoBlock}

[최근 3주 주간계획 — 큰 방향. 같은 진짜 문제면 시나리오 유지 OK, 단 각도/무브는 매일 다르게]
${weekly}

[최근 보낸 편지 — 각도·무브가 겹치면 안 됨]
${past || '(없음)'}

오늘 편지의 '행동 선택 + 추천 검수'만 JSON으로(작문 금지):
{
  "scenarioId": "위 목록의 id 하나",
  "planTarget": "선택적 — 집중할 식품군/거부음식(없으면 null→코드 결정)",
  "moveKey": "선택적 — 무브 힌트(없으면 null→코드 회전)",
  "useFood": "오늘 음식 추천을 쓸지 boolean — 집에 음식 결핍(콩류·과일·채소)이 있고 최근 며칠 음식 얘기를 안 했으면 true(그 음식 추천). 결핍 자체가 0일 때만 false. 환경이 크다고 매일 false로 빼지 마라(며칠에 한 번은 음식 날)",
  "approvedRecs": ["위 후보 중 오늘 맞는 것만 그대로 골라 배열(부분집합·후보 밖 금지). useFood=true면 최소 1개"],
  "why": "시나리오 선택 + 추천 취사 근거 1~2문장(수치·3주 흐름·최근 편지와 다른 각도임을 인용)"
}`;
}

/** 두뇌 호출 — BrainAction 반환. scenarioId가 목록 밖이면 그대로 두되(검증은 호출측), 방어적 파싱. */
export async function pickActionByBrain(ctx: string, candidates: string[] = [], model: string = BRAIN_MODEL): Promise<BrainAction> {
  const r = await callLLM(ctx, 600, SYSTEM_BRAIN, model);
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const id = s(r.scenarioId);
  // ⭐ useFood는 두뇌 boolean을 직접 신뢰(이전 버그: approvedRecs를 텍스트 블록 후보의 부분집합으로 강제 매칭 →
  //   LLM이 긴 블록을 그대로 못 echo해서 항상 빈 배열 → useFood 강제 false. food-graph 추천(bridgeFacts)이 영영 꺼지던 원인).
  const useFood = r.useFood === true;
  return {
    scenarioId: SCEN_IDS.has(id) ? id : '',   // 목록 밖이면 빈 값 → 호출측이 v2 폴백
    planTarget: r.planTarget == null ? null : s(r.planTarget) || null,
    moveKey: r.moveKey == null ? null : s(r.moveKey) || null,
    useFood,
    approvedRecs: useFood ? candidates.filter(Boolean) : [],   // useFood면 후보(=food-graph 추천) 사용. bridgeFacts는 cron이 useFood로 on/off
    why: s(r.why),
  };
}

/** 두뇌가 고른 scenarioId → CoachScenario 객체(목록에서). 못 찾으면 null(→ v2 결정론 selectScenario 폴백). */
export function scenarioFromId(id: string): CoachScenario | null {
  return SCENARIOS.find((s) => s.id === id) || null;
}

/** LetterInput에서 두뇌 입력에 쓸 영양 평가 한 줄 추출(있으면 mirror, 없으면 reds/missing 요약). */
export function nutritionMirrorFromInput(b: LetterInput): string {
  if (b.mirror) return b.mirror;
  const miss = (b.homeMissing && b.homeMissing.length ? b.homeMissing : b.missing) || [];
  const cov = b.covered || [];
  if (!miss.length && !cov.length) return '';
  return `${cov.length ? `충족: ${cov.slice(0, 4).join('·')}` : ''}${miss.length ? ` / 집 부족: ${miss.slice(0, 4).join('·')}` : ''}`.trim();
}
