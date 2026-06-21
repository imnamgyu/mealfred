/**
 * lib/coachWeekly.ts — 주간 코칭 닻(작전층). coaching-weekly-plan.html §2·§13·§14.
 *
 *  일요일: runWeeklyPlanning(Sonnet) → 다가올 주 닻(mission·target·budget·의사 소견 impression).
 *          결핍 후보가 없거나 LLM 실패 → coldSynth(결정론·비LLM)로 degrade(닻은 생기되 안전).
 *  월~토 : planFromWeekly — 닻의 mission_target을 '잠그고'(휙휙 차단) 무브만 회전 +
 *          채근 캡(주1회·ledger.pushUsed) + 행동지연(firstServe 전엔 push 금지·§13).
 *
 *  ⭐ 안전 제1원칙: 이 모듈은 throw하지 않는다(synthesis는 try/catch로 cold 폴백, planFromWeekly는 null 반환).
 *     닻이 없거나 실패하면 호출자(cron)가 현행 planFor로 폴백 → daily 엔진은 닻 유무와 무관하게 항상 동작.
 *
 *  모델: 주간 종합=Sonnet 4.6(자녀당 주 1회 → 비싼 모델 OK). 일간=Haiku(coach.ts).
 */
import { callLLM, buildCoachPlan, planSignature, MOVE_KEYS, MOVE_MENU, SNACK_CHANNEL, type CoachPlan } from './coach';
import { SCENARIOS, type CoachScenario, type CoachSignals } from './coachScenarios';
import { UNITS, UNIT_IDS, TH, CORE_ORDER, type UnitId, type Goal, type ProgressRow, type CandidateSignals } from './curriculumUnits';
import { normalizeGoals, goalsOf, inPivotCooldown } from './curriculum';
// ⭐ 주간계획 모듈(enrichWeeklyPlan)이 오케스트레이션할 다른 모듈들(순환 의존 없음 — 이들은 coachWeekly를 import하지 않음)
import { popularDishesFor, buildIngredientPool, cookedName, groupOfIngredient, GROUP_INGREDIENTS, type FreqMap } from './coachRecos';
import { verifiedCousinsOf, strongPairsOf } from './foodGraph';
import { bmiBand, growthTrackToPhrase, type BmiBand, type GrowthTrack } from './growth-reference';

const WEEKLY_MODEL = 'claude-sonnet-4-6';   // 주간 종합(자녀당 주 1회). ⭐역할 키 → callLLM이 DeepSeek V4-Pro로 1차, 실패 시 이 Claude Sonnet 폴백(이사님 2026-06-16 DeepSeek 전환·env 제거)

// ── 날짜 헬퍼(KST 'YYYY-MM-DD') ───────────────────────────────────────────────
/** 요일 0=일 … 6=토. 1970-01-01=목(4) 기준. */
export function kstDow(today: string): number {
  const days = Math.floor(Date.parse(today + 'T00:00:00Z') / 86400000);
  return (((days + 4) % 7) + 7) % 7;
}
export function addDaysStr(today: string, n: number): string {
  return new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

// ── 닻 타입 ───────────────────────────────────────────────────────────────────
// lever = 이번 주 '주력 코칭 축'. food(식품군/거부음식 노출) | environment(화면·자리·시간) | autonomy(스스로·선택권) | texture(질감 단계).
//  → 일간 편지 프레임을 이게 끈다. 주마다 달라져 어머니가 음식뿐 아니라 환경·자율성·식감까지 다양한 코칭을 받는다.
export type WeeklyLever = 'food' | 'environment' | 'autonomy' | 'texture';
export type WeeklyBudget = { expose: number; push: number; cadenceMinGap: number; pushWindow: number[]; lever?: WeeklyLever };
export type WeeklyLedger = { pushUsed: boolean; exposeCount: Record<string, number>; lastExposeDow: number | null; arcWeek: number; reanchorUsed: boolean; adviceGivenAt: string | null; firstServeDow: number | null; progressWeek: number;
  targetAccepts?: number;   // ⭐ 6-C(이사님 2026-06-15) 이번 주 잠긴 타깃을 '집에서 거부 없이 잘 먹은' 횟수 = 진짜 진척(단순 '차림'과 구분). 크론 일일 writeback이 채움.
  stallWeeks?: number;      // ⭐ 6-A 잠긴 타깃이 '진전 0'으로 흐른 연속 주차(일요일 synth가 직전 닻들의 targetAccepts로 산출·이월). 어드민 가시화용.
  foodOverrideUsed?: number;   // ⭐ A-09 — 비-food 주에 일간 두뇌가 food 시나리오로 닻을 덮어쓴 횟수(주당 FOOD_OVERRIDE_CAP 캡). 새 주 닻 synth 시 0 리셋.
};
export type TeachingArc = { stages: string[]; implIntention?: string | null };   // 가르치는 단계 + 언제·어디서(Gollwitzer)
// 일간 편지에 주입하는 그날 단계 — 요일·진척으로 결정. 잠긴 한 주 안에서 '매일 다른 각도'를 만드는 변주축(2026-06-11 복붙 사고 핫픽스).
//   intro(주 첫 편지·진단+왜) → how/obstacle/observe(요일 회전·진단 재서술 금지) / reinforce(실행 관측 시·연속 금지).
export type WeeklyArcStage = 'intro' | 'how' | 'obstacle' | 'observe' | 'reinforce';
// ⭐ F-17 — step 누적 서사: 오늘 코칭 유닛의 사다리 위치(이전/현재/다음 단계)+캠페인 누적일. 손이 '지난 X→오늘 Y' 진도감을 녹인다.
export type StepStory = { mode: string; stepNum: number; totalSteps: number; prevBehavior: string | null; nextBehavior: string | null; unitLabel: string; unitDays: number; envProgress?: string | null; stalled?: boolean };
export type WeeklyArc = { stage: WeeklyArcStage; behaviorGoal: string; implIntention?: string | null; progressNote?: string | null; stepStory?: StepStory | null };

// ── ⭐ 주간계획 모듈(작전층) 산출 — plan_detail (이사님 2026-06-18) ──────────────
//  일요일 종합(Sonnet)이 잡은 thin 닻(mission_target 카테고리) 위에, 결정론 후처리 enrichWeeklyPlan이
//  다른 모듈(추천엔진·그래프·영양평가·진척)을 오케스트레이션해 '7일치 구체 dish 회전·2트랙 풀·macro·거울 스케줄'을
//  미리 굽는다. 일간은 slot=(daySeed+cidHash)%7로 소비하되 그날 데이터로 vetting(유연성 가드).
export type PlanSlot = {
  ingredient: string;        // '두부'(도감 표준명)
  cookedName: string;        // '두부'·'삶은 두부'·'밥'(cookedName 적용 — 생물 오인 방지)
  dishes: string[];          // popularDishesFor → ['두부조림','순두부찌개'](≤2·괴식필터됨)
  group: string;             // '콩류'(식품군)
  track: 'supply' | 'challenge';   // 결핍 보급 / 사촌 도전
  via: 'deficit' | 'cousin' | 'pair';
  pairLiked?: string;        // challenge면 어떤 잘 먹는 음식의 사촌/궁합인지
  // ⭐ A(이사님 2026-06-19) — 어드민 '왜 이 식재료가 타깃인지+출현빈도' 근거(전부 옵셔널·구 plan_detail 하위호환)
  weeklyEstFreq?: number;    // supply: 그 결핍군의 주간 추정 출현(groupSignals.weeklyEst — '얼마나 부족해서')
  level?: 'green' | 'yellow' | 'red';   // supply: 결핍 강도
  reason?: string;           // 슬롯별 근거 한 줄(어드민 직접 표시 — supply='결핍군 X 보급(주 N회·red)', challenge='잘 먹는 Y의 검증 사촌')
};
export type MirrorSlot = { deficitGroup: string | null; line: string | null; kind: 'deficit' | 'covered' | 'macro' | 'expand' | null };
// ⭐ 우선순위 카테고리(이사님 2026-06-20) — 주간계획이 카테고리 1개만 둬서 '콩류 부족인데 달걀(알류) 추천' 모순이 나던 것 차단.
//   결핍(+BMI 곡류·고기류 가중)을 우선순위로, 3개 미달이면 자주 안 나온 군을 회전 충원(green이어도). kind=deficit('채우자') | expand('잘 먹지만 새 음식 넓히자').
export type PriorityGroup = { group: string; kind: 'deficit' | 'expand'; level: 'green' | 'yellow' | 'red'; weeklyEst: number; rank: number; reason: string };
export type MacroTrack = {
  active: boolean; band: BmiBand | null; reason: 'lowWeight' | 'growthLag' | 'overweight' | null;
  boostGroups: string[];     // 저체중/성장더딤이면 탄단지 보강군['고기·계란','콩류','유제품']
  boostDishes: string[];     // 그 군 대표의 popularDishesFor 평탄화(편지 인용)
  snackRestraint: boolean;   // 과체중/비만 = 간식 절제
  phrase: string | null;     // growthTrackToPhrase(P10 톤·숫자/체중 단어 0)
  cadenceWeek: boolean;      // 이 주차에 macro 줄 노출(격주·arcWeek 짝수)
};
export type PlanDetail = {
  schemaVersion: 1;
  targetRotation: PlanSlot[];                  // 길이 ≤7(슬롯별 구체 타깃 — 일간이 slot으로 픽)
  supplyPool: string[];                        // 결핍군 대표 식재료
  challengePool: Array<{ ingredient: string; cousinOf: string }>;
  poolMode: 'supply' | 'challenge' | 'mixed';
  macroTrack: MacroTrack;
  curriculum: { focusUnit: UnitId | null; focusLabel: string | null; standby: UnitId[]; stalledOut: UnitId | null; graduatedTo: UnitId | null; lever: WeeklyLever };
  mirrorSchedule: MirrorSlot[];                // 길이 ≤7(슬롯에 인덱스 정렬 — 거울[i]가 슬롯[i]의 군·track과 정합. 모순 차단)
  deficitGroups: string[];
  coveredGroups: string[];
  priorityGroups: PriorityGroup[];             // ⭐ 우선순위 3군(결핍+BMI+회전 충원) — 추천이 항상 이 중 한 군과 정합
  excludeFoods?: string[];                      // ⭐ 추천-무시 배제(이사님 2026-06-21) — 최근 14일 추천했는데 식단 미등장이라 이번 풀에서 뺀 식재료(어드민 가시화)
};

export type WeeklyAnchor = {
  child_id: string; week_key: string; status: string; source: string;
  mission: string | null; mission_target: string | null; target_pool: string[] | null; secondary_axis: string | null;
  budget: WeeklyBudget | null; ledger: WeeklyLedger | null; impression: string | null; arc_week: number | null;
  basis_hash: string | null; basis_attends_daycare: boolean | null;
  behavior_goal: string | null; teaching_arc: TeachingArc | null; check_method: Record<string, unknown> | null;   // §14 주간 커리큘럼(부모 행동변화·메시징 아크·확인)
  goals?: Goal[] | null;   // ⭐ v3 목표 포트폴리오 2~3(A-04 컬럼 — 구닻은 null, goalsOf가 lever에서 승격)
  plan_detail?: PlanDetail | null;   // ⭐ 주간계획 모듈 산출(작전층 부가 계획) — 일간이 slot 소비. null=thin 폴백.
};
export const DEFAULT_BUDGET: WeeklyBudget = { expose: 2, push: 1, cadenceMinGap: 1, pushWindow: [1, 2, 3, 4, 5], lever: 'food' };  // ⭐ K-10(2026-06-21) — push 윈도우 월~금(dow 1~5)으로 확장(차림 늦은 주도 주중 push 1회). line366 게이트·firstServe·주1회캡·강등 무변경.
// 구조 레버(비식품) → 그 주 일간 프레임이 되는 시나리오. food는 mission_target 잠금 경로로.
// ⭐ A-02 — 단일 진실(route 두뇌 게이트가 import해 leverScenario 호환 판정). food는 키 없음(=mission_target 잠금 경로).
export const LEVER_SCENARIO: Record<string, string> = { environment: 'mealtime-atmosphere', autonomy: 'autonomy-power-struggle', texture: 'texture-refusal' };
// ⭐ A-02 — 닻 무관 항상 허용 시나리오(전환 축하·적신호·기록공백). planFromWeekly 인터럽트 목록과 단일 소스.
export const SAFE_INTERRUPT_SCENARIOS = new Set(['progress-celebrate', 'neophobia-arfid-watch', 'low-data-gap']);
// ⭐ F-16 — 구조(비식품) 레버 시나리오 집합(환경·자율·식감). food 주에 두뇌가 이쪽으로 덮는 것을 막는 게이트 단일 소스.
export const STRUCTURAL_SCENARIOS = new Set(Object.values(LEVER_SCENARIO));
// ⭐ A-04/A-09 — 비-food 주에 일간 두뇌가 food 시나리오로 닻을 덮어쓸 수 있는 주당 상한(초과분 차단 → 음식 잔소리 연속 방지).
export const FOOD_OVERRIDE_CAP = 2;
export const DEFAULT_LEDGER: WeeklyLedger = { pushUsed: false, exposeCount: {}, lastExposeDow: null, arcWeek: 1, reanchorUsed: false, adviceGivenAt: null, firstServeDow: null, progressWeek: 1, foodOverrideUsed: 0 };

/**
 * ⭐ A-04/A-10 + F-16(양방향화) — 두뇌가 고른 시나리오(sid)로 주간 닻을 덮어써도 되는지 판정(순수함수·테스트 가능).
 *   레버 호환 = 안전 인터럽트(항상) OR (food주: '비구조(food)' 시나리오만 / 비-food주: 그 레버의 구조 시나리오만).
 *   ⭐ F-16 — 기존엔 food주가 '모든' 시나리오 호환이라 두뇌가 환경(mealtime-atmosphere) 시나리오를 무제한 꽂아
 *     lever:food 주간을 환경 잔소리로 덮었다(유닛↔무브 결속 무력화·자가정독 #1). 이제 food주의 '구조 override'를 차단
 *     (주간 food 잠금 보존). 비-food주의 food override는 종전대로 캡(FOOD_OVERRIDE_CAP)으로만 제한적 허용(다양성 보존).
 *   isFoodOverride = 비-food 주인데 food 시나리오로 캡을 1 소진하는 경우(arc 비우기·ledger 카운트 대상).
 */
export function anchorOverrideAllowed(p: { anchorLever: string; sid: string; fov: number; triggerOk: boolean; cap?: number }): { allow: boolean; isFoodOverride: boolean } {
  const cap = p.cap ?? FOOD_OVERRIDE_CAP;
  const structuralSid = STRUCTURAL_SCENARIOS.has(p.sid);
  const isLeverCompat = SAFE_INTERRUPT_SCENARIOS.has(p.sid)
    || (p.anchorLever === 'food' ? !structuralSid : p.sid === LEVER_SCENARIO[p.anchorLever]);
  // food override(비-food 주 → food 시나리오)만 캡으로 제한 허용. food 주 → 구조 시나리오는 차단(주간 food 잠금·F-16 보존).
  const allow = p.triggerOk && (isLeverCompat || (p.anchorLever !== 'food' && p.fov < cap));
  const isFoodOverride = p.anchorLever !== 'food' && !isLeverCompat && p.triggerOk;
  return { allow, isFoodOverride };
}

// ── ⭐ v3 — 주간 목표 포트폴리오(E-02~E-06) ───────────────────────────────────
/** 유닛 레버 → 레거시 lever 병행 기록(A-05 — 컷오버 기간 구코드 호환. mixed는 환경 프레임이 가장 가깝다). */
export function leverForUnit(u: UnitId): WeeklyLever {
  const l = UNITS[u].lever;
  return l === 'mixed' ? 'environment' : l;
}
// CORE_ORDER는 curriculumUnits.ts로 단일 소스화(C 온보딩 확장 + curriculum.ts fallbackPivot 공용). import는 파일 상단.
export type UnitCandidate = { unit_id: UnitId; score: number; label: string };

/** E-03 후보 산출기 — 신호 강도(레지스트리 trigger) + 재발 +3 / 전주 중단 +1, mastered·maintenance 제외, 온보딩 게이트(E-05). 상한 5. */
export function candidateUnits(p: { sig: CandidateSignals; progress: Partial<Record<UnitId, ProgressRow>>; week: number; today?: string }): UnitCandidate[] {
  const week = Math.max(1, p.week || 99);
  const out: UnitCandidate[] = [];
  for (const u of UNIT_IDS) {
    const row = p.progress[u];
    if (row?.status === 'mastered' || row?.status === 'maintenance') continue;
    if (UNITS[u].minWeek > week) continue;   // E-05 — 신뢰·관찰 주엔 기초 유닛만
    if (inPivotCooldown(row, p.today)) continue;   // ⭐ 핑퐁 쿨다운(이사님 2026-06-21) — 최근 포기한 유닛은 이번 주 후보 제외(전주 중단분 +1 부활이 table↔exposure 왕복 만들던 것 차단)
    let score = UNITS[u].trigger(p.sig);
    if (row?.status === 'relapsed') score += 3;       // "무너지면 다시" 최우선
    if (row?.status === 'pivoted') score += 1;        // 전주 중단분 부활 후보(쿨다운 지난 것만)
    if (score > 0) out.push({ unit_id: u, score: Math.round(score * 100) / 100, label: UNITS[u].label });
  }
  out.sort((a, b) => b.score - a.score || UNIT_IDS.indexOf(a.unit_id) - UNIT_IDS.indexOf(b.unit_id));
  if (!out.length) {
    // 신호 0 → 기초 순서 미이수 첫 유닛 폴백 — "처방 없는 주엔 수업"(E-03-3). 쿨다운 유닛은 건너뜀.
    const first = CORE_ORDER.filter((u) => UNITS[u].minWeek <= week)
      .find((u) => !['mastered', 'maintenance'].includes(p.progress[u]?.status || '') && !inPivotCooldown(p.progress[u], p.today));
    if (first) out.push({ unit_id: first, score: 0.5, label: UNITS[first].label });
  }
  return out.slice(0, 5);
}

/** ⭐ C(이사님 2026-06-19) — 온보딩 3주 아크: 1주차=신뢰 주(압박 내려놓기)·2주차=관찰 주(리듬·환경)·3주차=확장 주(노출·자율·질감).
 *   이사님 지적 '온보딩 3주차 목표 없음'을 명명으로 실재화 — 어드민/부모 카피·goals 상한이 이 단일 소스를 참조. */
export const ONBOARDING_ARC: Record<1 | 2 | 3, { label: string; cap: 1 | 2 | 3; intent: string }> = {
  1: { label: '신뢰 주', cap: 1, intent: '압박 내려놓기·식탁 안착' },
  2: { label: '관찰 주', cap: 2, intent: '식사 리듬·환경 관찰' },
  3: { label: '확장 주', cap: 3, intent: '노출·자율·질감으로 폭 넓히기' },
};
/** E-05 — 온보딩 주차별 goals 상한(ONBOARDING_ARC 위임): 1주차=1 · 2주차=2 · 3주차+=3. byte-동일. */
export function goalsCapForWeek(week: number): 1 | 2 | 3 {
  const w = Math.min(3, Math.max(1, week || 99)) as 1 | 2 | 3;
  return ONBOARDING_ARC[w]?.cap ?? 3;
}

/** E-06 — 주제 피로 캡: 같은 유닛이 직전 2주 연속 focus였고 그 2주간 step 전진 0이면 3주째 강등(차순위 승격). */
export function applyFocusFatigue(goals: Goal[], focusHistory: Array<{ unit_id: UnitId | null; stepAdvanced: boolean }>): Goal[] {
  const focus = goals.find((g) => g.status === 'focus');
  if (!focus || focusHistory.length < TH.focusMaxStallWeeks) return goals;
  const recent = focusHistory.slice(0, TH.focusMaxStallWeeks);
  const sameStalled = recent.every((h) => h.unit_id === focus.unit_id && !h.stepAdvanced);
  if (!sameStalled) return goals;   // 전진 중이면 딥다이브 허용("진전 있으면 계속")
  const next = goals.find((g) => g.status === 'standby');
  if (!next) return goals;          // 대체 없음 — 유지(주간 종합 소견으로만 환기)
  return normalizeGoals(goals.map((g) =>
    g.unit_id === focus.unit_id ? { ...g, status: 'standby' as const, priority: 3 as const }
    : g.unit_id === next.unit_id ? { ...g, status: 'focus' as const, priority: 1 as const } : g));
}

// ── 일요일 종합 (Sonnet 의사식 회진) ──────────────────────────────────────────
const SYSTEM_WEEKLY = `당신은 영유아 편식을 돕는 임상 코치입니다. 한 아이의 지난 한 주(최대 4주) 데이터를 의사처럼 종합해, 다음 한 주의 '방향'을 잡습니다.

[원칙]
- 식단(무엇을 먹었나/거부)만 보지 말고 구조화 입력(식감·자율성·식사환경·식사시간)·전환·만성질환까지 종합한다.
- 35개 국제 편식 이론으로 '이 아이의 지금 패턴에 어느 방법론이 맞나'를 진단한다: 신공포→SOS 감각 사다리, 자율성 다툼→Satter 식사 분담, 정체→푸드 체이닝, 환경 문제→무압력 식사 구조화, 반복 노출 부족→격일 재노출.
- '한 번에 하나' — 이번 주 초점은 1개. 보조는 식품이 아니라 환경/자율성 축이어야 한다(식품 2개 동시 금지).
- 채근(직접 밀기)은 주 1회까지. 강한 결핍이고 거부가 잦으면 push=1, 약하거나 ARFID 의심(적신호)·휴면이면 push=0.
- 진단·처방 단어 금지(코치는 의사 아님). 소견은 따뜻하고 담담하게.

[⭐ 이번 주 '주력 레버(primary_lever)' 1개를 정하라 — 이게 한 주 코칭의 중심축이다]
- food: 특정 식품군/거부음식 노출이 핵심일 때(영양 결핍·거부가 큰 문제).
- environment: 화면 보며·돌아다니며 식사·식사시간 지연이 더 큰 문제일 때(식탁 집중·무압력).
- autonomy: 떠먹여주기만·선택권 없음이 더 큰 문제일 때(스스로 먹기·고르기).
- texture: 죽·다진 단계에 오래 머물러 질감 올리기가 핵심일 때.
→ 구조화 입력(화면·이동·떠먹여줌·죽단계)이 식품 결핍보다 더 큰 문제면 비-food 레버를 골라라. '한 번에 하나'이므로 레버는 정확히 1개. (food여도 mission_target은 항상 채운다 — 비-food 주엔 배경 노출용.)

[반드시]
- mission_target은 반드시 아래 '결핍/거부 후보 목록' 안에서만 고른다(목록 밖 금지). 없는 결핍 지어내기 금지.
- impression(의사 소견)은 부모에게 보이지 않는 내부 메모다 — 솔직하게: 지난주 무엇이 늘고/막혔고, 이번 주 왜 이 레버·이 타깃인지 2~3문장.
- mission은 부모 편지에 자연스럽게 녹일 '한 줄'(권유형, 명령·과제 금지). '미션'이라는 단어는 쓰지 마라.

[⭐ 이번 주 '부모 행동변화'를 설계하라 — 음식 타깃 말고 부모가 바꿀 행동 1개]
- behavior_goal: 이번 주 부모가 시도할 '가장 작은' 행동 1개(Fogg). 매 끼니가 아니라 '하루 한 끼/한 번'. 관측 가능하고 부모가 통제 가능한 것만('아이가 더 잘 먹게'처럼 결과·통제 밖 목표 금지). 권유형.
- impl_intention: 그 행동을 언제·어디서 할지 구체 트리거 1구(Gollwitzer, 예 "저녁 6시, TV 끄고"). 막연한 결심보다 실행률↑.
- food 레버여도 behavior_goal은 '그 음식 노출 행동 자체'로(예 "콩류를 격일로 작게 곁들여 다시 올리기") — 노출과 분리된 두 번째 요구를 만들지 마라(한 번에 하나).

[⭐ v3 — 이번 주 '목표 포트폴리오' 2~3개를 후보 중에서 순위로 골라라]
- 입력의 '커리큘럼 후보' 목록(코드가 신호로 미리 계산) 안에서만 goals를 고른다(목록 밖 금지·새 유닛 발명 금지).
- 1순위(focus)=이번 주 주력 1개, 2~3순위(standby)=주중 정체 시 피벗 대기. "이번 주 데이터를 보고 지금 아이 상황에서 어떤 교육이 좋겠나"로 순위를 정하라.
- why는 내부 소견용 한 줄(부모 비노출).

JSON만: {"primary_lever":"food"|"environment"|"autonomy"|"texture","mission_target":"콩류","secondary_axis":"식사환경"|null,"expose":2,"push":1,"mission":"이번 주는 ...","impression":"지난주 ... 이번 주는 ...","behavior_goal":"하루 한 끼는 ...","impl_intention":"저녁 6시, TV 끄고","goals":[{"unit_id":"table-stage","priority":1,"why":"..."},{"unit_id":"hunger-rhythm","priority":2,"why":"..."}]}`;

export type WeeklyInput = {
  today?: string;   // ⭐ 핑퐁 쿨다운(이사님 2026-06-21) — candidateUnits가 stalledAt 경과 판정에 사용. 없으면 쿨다운 미적용(degrade)
  childName?: string; ageBand?: string;
  reds: string[]; missing: string[]; homeMissing: string[];
  refused: string[]; favoriteFoods: string[]; transitions: string[];
  structuredSummary?: string;        // 구조화 분포 요약(식감·자율성·환경·식사시간)
  chronicGuidance?: string;
  lastMission?: string | null; lastImpression?: string | null; lastTarget?: string | null; icfqRiskCount?: number;
  stalledTarget?: string | null;   // ⭐ 6-A(이사님 2026-06-15) 3주 진전0으로 감지된 타깃 — 후보 맨 뒤로 밀고 '축 전환' 지시(크론이 직전 닻들로 산출).
  // ⭐ v3(E-02~E-06) — 없으면 goals=[](레거시 호환: goalsOf가 lever에서 승격)
  candSignals?: CandidateSignals | null;                        // 후보 산출 신호(크론이 StructuredSig·통계에서)
  progress?: Partial<Record<UnitId, ProgressRow>> | null;       // 진도(재발 우선·mastered 제외)
  week?: number | null;                                         // 가입 후 주차(첫 meal_log 기준 — E-05 게이트)
  focusHistory?: Array<{ unit_id: UnitId | null; stepAdvanced: boolean }> | null;   // 최근 주 focus 이력(E-06 — 최신 우선)
};
export type WeeklySynthesis = { mission: string | null; mission_target: string | null; target_pool: string[]; secondary_axis: string | null; budget: WeeklyBudget; impression: string | null; source: string; behaviorGoal: string | null; teachingArc: TeachingArc | null; checkMethod: Record<string, unknown> | null; goals: Goal[] };

// lever → 부모 행동목표 결정론 폴백(Sonnet 미산출/cold 시). Fogg '가장 작은 버전'.
function defaultBehaviorGoal(lever: WeeklyLever, target: string | null): string {
  if (lever === 'environment') return '하루 한 끼는 화면을 끄고 식탁에 앉아서 먹기';   // ⭐ 3-C(이사님 2026-06-15) '한 번에 하나' — 옛 값은 화면+간식타이밍 2행동(간식 타이밍은 별도 주차로)
  if (lever === 'autonomy') return '하루 한 끼는 아이가 스스로 떠먹게 두기(좀 흘려도 괜찮아요)';
  if (lever === 'texture') return '한 끼만 한 단계 위 질감(핑거푸드·일반식)으로 부드럽게 올려보기';
  return `${target || '거부했던 식재료'}를 격일로 아주 작은 한 조각씩 좋아하는 음식 옆에 다시 올려두기`;   // food = 노출 행동 자체(한 번에 하나)
}
function defaultCheck(lever: WeeklyLever): Record<string, unknown> {
  const sig = lever === 'environment' ? 'envTablePct' : lever === 'autonomy' ? 'selfPct' : lever === 'texture' ? 'texUp' : 'exposeCount';
  return { method: 'observe', signal: sig, targetDir: 'up' };   // 자동 관측(부모에게 안 물음·죄책감 0)
}

/**
 * ⭐ 닻 치유 — 커리큘럼 컬럼(weekly_coaching.sql) 미적용/구버전 닻이면 behavior_goal 등을 결정론 폴백으로 메모리에서 채운다.
 *   2026-06-11 사고: 컬럼 없는 W24 닻이 arc=null을 만들어 '왜→강화' 변주축이 통째로 죽고 3일 복붙 편지 발행.
 *   (호출자가 치유본을 DB에 best-effort 영속화 — 컬럼 없으면 그 update만 조용히 실패해도 메모리 arc는 산다.)
 */
export function healAnchor(a: WeeklyAnchor): WeeklyAnchor {
  const goals = a.goals && a.goals.length ? a.goals : goalsOf(a);   // E-09 — goals 컬럼 전 구닻은 lever에서 승격
  if (a.behavior_goal) return goals === a.goals ? a : { ...a, goals };
  const lever = (a.budget?.lever || 'food') as WeeklyLever;
  return {
    ...a,
    goals,
    behavior_goal: defaultBehaviorGoal(lever, a.mission_target),
    teaching_arc: a.teaching_arc || { stages: ['why', 'reinforce'], implIntention: null },
    check_method: a.check_method || defaultCheck(lever),
  };
}

/** 결핍/거부 후보(타깃 화이트리스트 — 환각 차단). 집부족 > 전체부족 > 거부 순.
 *  ⭐ 6-A — 3주 진전0 타깃(stalledTarget)은 다른 후보가 있으면 맨 뒤로(전환 유도). 유일 후보면 그대로 둠(대안 없음). */
function candidateTargets(i: WeeklyInput): string[] {
  const all = [...new Set([...(i.homeMissing || []), ...(i.missing || []), ...(i.refused || [])])].filter(Boolean);
  if (i.stalledTarget && all.length > 1 && all.includes(i.stalledTarget)) {
    return [...all.filter((t) => t !== i.stalledTarget), i.stalledTarget];
  }
  return all;
}

/** v3 — 유닛 후보(코드 산출)와 goals 정규화: Sonnet 산출을 후보 화이트리스트로 강제(E-02-2)·주차 캡(E-05)·피로 캡(E-06). */
function resolveGoals(i: WeeklyInput, rawGoals: unknown, ucands: UnitCandidate[]): Goal[] {
  if (!ucands.length) return [];
  const allow = new Set(ucands.map((c) => c.unit_id));
  let goals = normalizeGoals(Array.isArray(rawGoals) ? (rawGoals as Goal[]).filter((g) => g && allow.has(g.unit_id as UnitId)) : []);
  if (!goals.length) goals = normalizeGoals(ucands.map((c, idx) => ({ unit_id: c.unit_id, priority: (idx + 1) as 1 | 2 | 3, status: idx === 0 ? 'focus' : 'standby' })));
  goals = goals.slice(0, goalsCapForWeek(i.week ?? 99));
  if (i.focusHistory?.length) goals = applyFocusFatigue(goals, i.focusHistory);
  return normalizeGoals(goals);
}

function buildWeeklyUser(i: WeeklyInput, cands: string[], ucands: UnitCandidate[] = []): string {
  return `[아이] ${(i.childName || '아이').slice(0, 20)} (${i.ageBand || '유아'})
[지난 4주 분석값]
부족 영양소: ${i.reds.join(', ') || '없음'}
집 부족 식품군: ${i.homeMissing.join(', ') || '없음'} · 전체 부족 식품군: ${i.missing.join(', ') || '없음'}
거부 음식: ${i.refused.join(', ') || '없음'}
잘 먹는 음식: ${i.favoriteFoods.slice(0, 8).join(', ') || '파악 중'}
거부→수용 전환: ${i.transitions.join(' / ') || '없음'}
구조화 입력(식감·자율성·환경·식사시간): ${i.structuredSummary || '기록 적음'}
${i.chronicGuidance ? `만성질환 방향: ${i.chronicGuidance}\n` : ''}${i.lastTarget ? `지난주 초점: ${i.lastTarget}${i.lastImpression ? ` — 소견: ${i.lastImpression}` : ''}\n` : ''}${i.stalledTarget ? `⚠️ '${i.stalledTarget}'는 최근 3주 진전 0(집에서 받아들임 없음) — 이번 주는 이 타깃 채근을 멈추고 다른 결핍이나 환경/자율성/식감 레버로 전환하라(같은 음식 3주째 들이밀기 금지).\n` : ''}${(i.icfqRiskCount || 0) >= 2 ? '⚠️ 최근 식사 적신호 누적(ARFID 가능) — push=0, 무압력 우선.\n' : ''}
[mission_target 후보(이 안에서만 고르기)] ${cands.join(', ') || '(없음 — mission_target은 null로)'}
${ucands.length ? `[커리큘럼 후보(goals는 이 안에서만 순위 결정 — 신호 점수는 코드 계산)] ${ucands.map((c) => `${c.unit_id}(${c.label}·신호 ${c.score})`).join(' · ')}\n` : ''}
위 데이터를 의사처럼 종합해 다음 한 주의 초점 타깃 1개·예산·소견${ucands.length ? '·goals 순위' : ''}를 JSON으로.`;
}

/** 일요일 종합(Sonnet). 후보 없음/LLM 실패 → coldSynth(비LLM). v3: goals 포트폴리오 동시 산출(E-02). */
export async function runWeeklyPlanning(i: WeeklyInput): Promise<WeeklySynthesis> {
  const cands = candidateTargets(i);
  const ucands = i.candSignals ? candidateUnits({ sig: i.candSignals, progress: i.progress || {}, week: i.week ?? 99, today: i.today ?? '' }) : [];
  if (!cands.length && !ucands.length) return coldSynth(i, 'cold_synth');   // 후보 전무 = 관찰 닻(LLM 미호출)
  try {
    const out = await callLLM(buildWeeklyUser(i, cands, ucands), 900, SYSTEM_WEEKLY, WEEKLY_MODEL);
    // 화이트리스트 강제 — 식품 후보가 아예 없으면(영양 OK·환경 문제 주) mission_target=null 허용
    const target = typeof out.mission_target === 'string' && cands.includes(out.mission_target) ? out.mission_target : (cands[0] ?? null);
    const pool = target ? [target, ...cands.filter((c) => c !== target)].slice(0, 4) : [];
    const expose = Math.min(3, Math.max(2, Number(out.expose) || 2));
    const arfid = (i.icfqRiskCount || 0) >= 2;
    const push = (arfid || out.push === 0 || out.push === false) ? 0 : 1;   // ARFID 의심이면 채근 0회 선잠금(§13)
    const goals = resolveGoals(i, out.goals, ucands);
    // A-05 — goals가 있으면 lever는 focus 유닛의 축으로 '계속' 채운다(구코드 호환). 없으면 Sonnet 선택 존중.
    const sonnetLever: WeeklyLever = (['food', 'environment', 'autonomy', 'texture'] as const).includes(out.primary_lever as WeeklyLever) ? out.primary_lever as WeeklyLever : 'food';
    const focus = goals.find((g) => g.status === 'focus');
    const lever: WeeklyLever = focus ? leverForUnit(focus.unit_id) : sonnetLever;
    const implIntention = typeof out.impl_intention === 'string' ? out.impl_intention.slice(0, 80) : null;
    const behaviorGoal = (typeof out.behavior_goal === 'string' && out.behavior_goal.trim()) ? out.behavior_goal.slice(0, 160) : defaultBehaviorGoal(lever, target);
    return {
      mission: typeof out.mission === 'string' ? out.mission.slice(0, 300) : null,
      mission_target: target, target_pool: pool,
      secondary_axis: typeof out.secondary_axis === 'string' ? out.secondary_axis : null,
      budget: { ...DEFAULT_BUDGET, expose, push, lever },
      impression: typeof out.impression === 'string' ? out.impression.slice(0, 600) : null,
      source: 'weekly_llm',
      behaviorGoal, teachingArc: { stages: ['why', 'reinforce'], implIntention }, checkMethod: defaultCheck(lever), goals,
    };
  } catch {
    return coldSynth(i, 'cold_synth');   // LLM 실패 → 결정론 폴백(닻은 생기되 비LLM)
  }
}

/** E-04 — 콜드 폴백도 goals를 결정론 산출(후보 상위 cap개) — 닻은 항상 생긴다(안전 제1원칙). */
function coldSynth(i: WeeklyInput, source: string): WeeklySynthesis {
  const cands = candidateTargets(i);
  const ucands = i.candSignals ? candidateUnits({ sig: i.candSignals, progress: i.progress || {}, week: i.week ?? 99, today: i.today ?? '' }) : [];
  const goals = resolveGoals(i, null, ucands);
  const arfid = (i.icfqRiskCount || 0) >= 2;
  const target = cands[0] || null;
  const focus = goals.find((g) => g.status === 'focus');
  const lever: WeeklyLever = focus ? leverForUnit(focus.unit_id) : 'food';
  return {
    mission: null, mission_target: target, target_pool: cands.slice(0, 4), secondary_axis: null,
    budget: { ...DEFAULT_BUDGET, push: (cands.length && !arfid) ? 1 : 0, lever }, impression: null, source,
    behaviorGoal: defaultBehaviorGoal(lever, target), teachingArc: { stages: ['why', 'reinforce'], implIntention: null }, checkMethod: defaultCheck(lever), goals,
  };
}

// ── 월~토 닻 실행 ─────────────────────────────────────────────────────────────
const PUSH_MOVES = new Set(['mix', 'beside']);   // '직접 밀기'(채근) 무브 — 주1회 캡 대상
const moveTextOf = (key: string): string | null => { const i = MOVE_KEYS.indexOf(key); return i >= 0 ? MOVE_MENU[i] : null; };

/**
 * 닻(weekly_plans) 안에서 오늘의 계획 산출. planFor와 동일 형태({scenario,plan,varyOpener}) + ledger 패치·push 적용 여부.
 * 반환 null = 닻을 못 쓰는 경우(호출자가 planFor 폴백).
 */
export function planFromWeekly(p: {
  anchor: WeeklyAnchor; signals: CoachSignals; recentPlans: CoachPlan[];
  targetExposeWtd: number;   // 이번 주 누적 노출(실제 차림) 횟수 — 행동지연 게이트
  progress: boolean;         // ⭐ 이번 주 행동변화가 관측됐나(food=차림 있음, 구조=좋은 행동 1회+) → reinforce 후보
  progressNote?: string | null;   // 관측된 실행의 구체 사실 한 줄(크론이 계산) — reinforce/observe 편지가 인용
  firstOfWeek: boolean;      // 이번 주 닻으로 만드는 첫 편지인가 → intro(진단+왜는 주 1회만 — 2026-06-11 복붙 사고 핫픽스)
  lastArcStage?: string | null;   // 직전 편지의 아크 단계 — reinforce 이틀 연속 방지
  daySeed: number; cidHash: number; dow: number;
  forceScenarioId?: string | null;   // ⭐ A-03 — 두뇌가 고른 시나리오(닻 종속 override). food 레버 경로의 frame만 교체, 타깃 잠금·채근 캡·아크는 그대로.
  effectiveLever?: WeeklyLever | null;   // ⭐ F-16 — 오늘 코칭 유닛(커리큘럼 결정)의 레버로 프레임/무브를 끈다(주간 레버가 stale일 때 유닛이 진짜로 무브를 결정). null/미전달=주간 레버(현행). weekCtx.lever·채근 캡은 그대로 주간 레버 유지(route).
}): { scenario: CoachScenario; plan: CoachPlan; varyOpener: boolean; ledgerPatch: Partial<WeeklyLedger>; pushApplied: boolean; weeklyArc: WeeklyArc | null } | null {
  const { anchor, signals, recentPlans, daySeed, cidHash, dow } = p;
  const sc = (id: string) => SCENARIOS.find((s) => s.id === id)!;

  // 1) 안전 인터럽트 — 전환 축하/적신호/기록공백은 닻보다 우선(그날만, 채근·아크 안 함)
  const fired = SCENARIOS.filter((s) => { try { return s.trigger(signals); } catch { return false; } }).sort((a, b) => b.priority - a.priority);
  const interrupt = fired.find((s) => SAFE_INTERRUPT_SCENARIOS.has(s.id));
  if (interrupt) {
    const bp = buildCoachPlan({ frame: interrupt.id, targetPool: [], recentPlans, daySeed, cidHash });
    return { scenario: interrupt, plan: bp, varyOpener: recentPlans[0]?.frame === interrupt.id, ledgerPatch: {}, pushApplied: false, weeklyArc: null };
  }

  // ⭐ 그날 아크 단계 — 주 첫 편지=intro(진단+왜는 그날 한 번만), 이후는 요일 회전(how→obstacle→observe, 진단 재서술 금지).
  //    실행이 관측되면 reinforce(거짓 칭찬 금지) — 단 이틀 연속 reinforce는 금지(사이엔 회전 단계로 환기).
  const ROT: WeeklyArcStage[] = ['how', 'obstacle', 'observe'];
  const stage: WeeklyArcStage = p.firstOfWeek ? 'intro'
    : (p.progress && p.lastArcStage !== 'reinforce') ? 'reinforce'
    : ROT[((dow + 6) % 7) % ROT.length];
  const weeklyArc: WeeklyArc | null = anchor.behavior_goal
    ? { stage, behaviorGoal: anchor.behavior_goal, implIntention: anchor.teaching_arc?.implIntention ?? null, progressNote: p.progressNote ?? null }
    : null;

  // 1.5) ⭐ 주력 레버가 비-food면 그 주는 환경/자율성/식감 코칭이 중심(어머니에게 다양한 코칭). 음식 타깃은 배경(이번 주 행동 아님).
  //   ⭐ F-16 — effectiveLever(오늘 코칭 유닛의 레버)가 오면 그걸로 프레임/무브를 끈다(주간 레버가 유닛 피벗을 못 따라가던 plateau 봉합). 미전달이면 주간 레버(현행 byte-동일).
  const lever = p.effectiveLever ?? (anchor.budget?.lever || 'food');
  if (lever !== 'food' && LEVER_SCENARIO[lever]) {
    const frame = LEVER_SCENARIO[lever];   // mealtime-atmosphere | autonomy-power-struggle | texture-refusal
    // ⭐ 전용 무브 메뉴(SCEN_MOVES)를 buildCoachPlan으로 회전 — 프레임은 한 주 잠겨도 행동 방식·시그니처는 매일 달라진다
    //   (2026-06-11 사고: 이전엔 target/move=null 고정 시그니처라 dedup이 볼 게 없어 3일 복붙 편지 발행).
    //   메뉴 전부가 최근과 겹치면(escalate) 같은 처방 반복 대신 정체기(칭찬·쉬어가기)로 — scenarios §3 약속의 weekly 이행.
    const bp = buildCoachPlan({ frame, targetPool: [], recentPlans, daySeed, cidHash });
    const fp = bp.escalate ? buildCoachPlan({ frame: 'plateau', targetPool: [], recentPlans, daySeed, cidHash }) : bp;
    const plan: CoachPlan = { frame: fp.frame, target: fp.target, moveKey: fp.moveKey, move: fp.move, signature: fp.signature };
    return { scenario: sc(plan.frame), plan, varyOpener: recentPlans[0]?.frame === plan.frame, ledgerPatch: {}, pushApplied: false, weeklyArc };
  }

  // 2) (food 레버) 타깃 잠금 — 닻의 mission_target(여전히 결핍이면) → pool 내 다음 → 없으면 정체기(쉬어가기)
  const deficit = new Set([...signals.reds, ...signals.missing, ...signals.homeMissing, ...signals.homeReds, ...signals.refused, ...signals.homeRefused, ...signals.daycareRefused]);
  const pool = [...new Set(([anchor.mission_target, ...(anchor.target_pool || [])].filter(Boolean) as string[]))].filter((t) => deficit.has(t));
  if (!pool.length) {
    const bp = buildCoachPlan({ frame: 'plateau', targetPool: [], recentPlans, daySeed, cidHash });
    return { scenario: sc('plateau'), plan: bp, varyOpener: recentPlans[0]?.frame === 'plateau', ledgerPatch: {}, pushApplied: false, weeklyArc };
  }
  const target = pool[0];   // 닻 우선(mission_target이 pool[0])
  const isRefused = signals.refused.includes(target) || signals.homeRefused.includes(target) || signals.daycareRefused.includes(target);
  const baseFrame = SNACK_CHANNEL.has(target) ? 'nutrient-gap'
    : isRefused ? 'new-refusal'
    : (signals.attendsDaycare && signals.missing.length === 0) ? 'home-daycare-gap' : 'nutrient-gap';
  // ⭐ A-03 — 두뇌가 고른 시나리오로 frame만 교체(타깃 잠금 pool[0]·채근 캡·아크는 그대로). food 레버 경로에서만(비-food는 route 게이트가 차단).
  const frame = (p.forceScenarioId && SCENARIOS.some((s) => s.id === p.forceScenarioId)) ? p.forceScenarioId : baseFrame;
  let bp: CoachPlan = buildCoachPlan({ frame, targetPool: [target], recentPlans, daySeed, cidHash });

  // 3) 채근 캡 + 행동지연 — push 무브(mix/beside)는 '적기'(예산 남음 && 윈도우 && 이번 주 1회+ 차림)에만
  const budget = anchor.budget || DEFAULT_BUDGET;
  const ledger = anchor.ledger || DEFAULT_LEDGER;
  const pushAllowed = (budget.push || 0) > 0 && !ledger.pushUsed && (budget.pushWindow || []).includes(dow) && p.targetExposeWtd >= 1;
  let pushApplied = false;
  if (bp.moveKey && PUSH_MOVES.has(bp.moveKey)) {
    if (pushAllowed) pushApplied = true;
    else {
      // 강등: 비push 무브로 교체(타깃 유지=반복 노출 지속, 들이밀기만 제거). 최근 시그니처 안 겹치는 첫 것.
      const cands = MOVE_KEYS.filter((k) => !PUSH_MOVES.has(k));
      const alt = cands.find((k) => !recentPlans.some((rp) => rp.signature === planSignature(frame, target, k))) || cands[(daySeed % cands.length + cands.length) % cands.length];
      bp = { frame, target, moveKey: alt, move: moveTextOf(alt), signature: planSignature(frame, target, alt) };
    }
  }
  const ledgerPatch: Partial<WeeklyLedger> = { lastExposeDow: dow };
  if (pushApplied) ledgerPatch.pushUsed = true;
  return { scenario: sc(frame), plan: bp, varyOpener: recentPlans[0]?.frame === frame, ledgerPatch, pushApplied, weeklyArc };
}

// ── ⭐ 주간계획 모듈 — enrichWeeklyPlan(오케스트레이션) + pickPlanSlot(유연성 가드 소비) ──
//  이사님 2026-06-18: 빈약한 카테고리 1개 타깃이 일간 반복의 근원. 일요일 종합 직후 결정론 후처리가
//  다른 모듈(추천엔진·그래프·영양평가·진척)을 오케스트레이션해 7일치 구체 계획을 굽는다(LLM 0콜·순수).
export const PLAN_MEAL_GROUPS = new Set(['콩류', '비타민A채소', '녹색채소', '생선·해산물', '고기·계란', '유제품', '과일', '곡류']);   // 식품군 8(회전·거울 대상)

export type EnrichContext = {
  groupSignals: { group: string; level: string; weeklyEst: number }[];   // computeGroupSignals(homeDays).signals
  likedIngredients: string[]; freqMap?: FreqMap;
  deficitGroups: string[];   // fg.missing ∪ homeMissing(식품군)
  coveredGroups: string[];   // 충족군
  band: BmiBand | null; heightTrack: GrowthTrack | null; weightTrack: GrowthTrack | null;
  goals: Goal[];             // synth.goals(focusFatigue 거침)
  focusHistory?: Array<{ unit_id: UnitId | null; stepAdvanced: boolean }>;
  arcWeek: number; attendsDaycare: boolean;
  excludeFoods?: string[];   // ⭐ 추천-무시 배제(이사님 2026-06-21) — 최근 14일 추천했는데 식단 미등장 식재료. supply/challenge 풀에서 제외(다음 2주). 식단 등장 시 route가 자동 복귀.
};

// ⭐ K-04b — 거울 문장틀 3변형 회전(클로징 앵무새 차단) + 결핍군 구체 dish 주입(이사님 '음식 추천 항상 포함').
//   환경날엔 본문에 음식 행동이 없으므로, 거울(정보 채널)이 결핍군의 구체 메뉴 1개를 '소프트 안내'로 담는다(deficit군 dish라 코히어런트·행동 아님).
function mirrorLineFor(g: string, attendsDaycare: boolean, variant = 0, dish?: string | null): string {
  const v = ((variant % 3) + 3) % 3;
  const d = dish ? ` ${dish} 같은 걸로` : '';
  return attendsDaycare
    ? [
      `어린이집 덕에 전체 영양은 잘 채워지고 있고, 집 끼니엔 ${g}가 좀 드무니${d} 가끔 만나면 다양성에 좋아요`,
      `기관 급식이 ${g} 빼고는 영양을 든든히 받쳐주고 있어요. 집에선${d || ` ${g}를`} 한 번씩 만나게 해주면 더 고르게 채워져요`,
      `전체 영양은 기관에서 잘 챙겨지고 있으니, 집에선 ${g}를${d ? `${d} ` : ' '}부담 없이 가끔 만나는 정도면 충분해요`,
    ][v]
    : [
      `${g}가 요즘 식단에서 만나기 어려웠어요.${d ? `${d} 집 끼니에 한 번씩` : ' 집 끼니에 한 번씩'} 곁들이면 다양성이 좋아져요`,
      `집 끼니에 ${g}가 좀 드무니${d} 가끔 만나면 영양 균형이 한결 고르게 잡혀요`,
      `${g}를${d ? `${d}` : ''} 조금만 더 챙겨주면 식단이 한결 고르게 채워져요`,
    ][v];
}
/** 결핍군의 대표 식재료(salt로 회전)의 인기 dish 1개 — 거울에 넣을 구체 메뉴(매일 다른 dish). */
function deficitDishFor(g: string, salt: number, freqMap?: FreqMap): string | null {
  const reps = GROUP_INGREDIENTS[g] || []; if (!reps.length) return null;
  const rep = reps[((salt % reps.length) + reps.length) % reps.length];
  return popularDishesFor(rep, freqMap)[0] || null;
}
function buildMacroTrack(ctx: EnrichContext): MacroTrack {
  const lagging = (t: GrowthTrack | null) => !!t && (t.status === '주의' || t.status === '경고');
  const growthLag = lagging(ctx.heightTrack) || lagging(ctx.weightTrack);
  const lowWeight = ctx.band === '저체중';
  const overweight = ctx.band === '과체중' || ctx.band === '비만';
  const cadence = (ctx.arcWeek % 2) === 0;   // 격주(2주 연속 금지·측정 저빈도 존중)
  if (lowWeight || growthLag) {
    const boostGroups = ['고기·계란', '콩류', '유제품'];   // 탄단지(단백·지방·열량) 보강 — 고기류 중심(이사님)
    const boostDishes: string[] = [];
    for (const g of boostGroups) for (const rep of (GROUP_INGREDIENTS[g] || []).slice(0, 2)) for (const d of popularDishesFor(rep, ctx.freqMap).slice(0, 1)) if (!boostDishes.includes(d)) boostDishes.push(d);
    return { active: true, band: ctx.band, reason: lowWeight ? 'lowWeight' : 'growthLag', boostGroups, boostDishes: boostDishes.slice(0, 5), snackRestraint: false, phrase: growthTrackToPhrase({ band: ctx.band, height: ctx.heightTrack, weight: ctx.weightTrack }), cadenceWeek: cadence };
  }
  if (overweight) return { active: true, band: ctx.band, reason: 'overweight', boostGroups: [], boostDishes: [], snackRestraint: true, phrase: growthTrackToPhrase({ band: ctx.band, height: ctx.heightTrack, weight: ctx.weightTrack }), cadenceWeek: cadence };
  return { active: false, band: ctx.band, reason: null, boostGroups: [], boostDishes: [], snackRestraint: false, phrase: null, cadenceWeek: false };
}
// ⭐ 슬롯 인덱스 정렬 거울(이사님 2026-06-20) — 거울[i]를 targetRotation[i]의 군·track에 맞춤. '콩류 부족인데 달걀(알류) 추천' 모순 차단.
//   supply 슬롯 날=그 슬롯의 결핍군 명명(거울·추천 같은 군) / challenge(expand)·빈 날=결핍군 호명 0(본문 slotMandate가 '잘 먹는 사촌 넓히기' 직조 → 거울은 음식 없는 generic-positive). 빈도 격일화는 route _cooldownDue가 담당.
function buildMirrorSchedule(slots: PlanSlot[], covered: string[], macro: MacroTrack, attendsDaycare: boolean, freqMap?: FreqMap): MirrorSlot[] {
  const out: MirrorSlot[] = [];
  const coveredLine = covered.length ? `여러 식품군을 두루 만나 균형이 좋아요(${covered.slice(0, 3).join('·')})` : null;
  for (let i = 0; i < 7; i++) {
    if (macro.active && macro.cadenceWeek && i === 3) { out.push({ deficitGroup: null, line: macro.phrase, kind: 'macro' }); continue; }
    const s = slots[i];
    if (s && s.track === 'supply') {
      // supply 날 — 거울이 그 슬롯의 결핍군을 명명(dish도 슬롯 dish라 두부 재소환 0). 거울·본문 추천 같은 군 = 모순 0.
      out.push({ deficitGroup: s.group, line: mirrorLineFor(s.group, attendsDaycare, i, s.dishes?.[0] ?? deficitDishFor(s.group, i, freqMap)), kind: 'deficit' });
    } else {
      // challenge(expand)·빈 슬롯 날 — 결핍군 호명 금지(본문이 '잘 먹는 X의 사촌'으로 직조). 거울은 음식 없는 generic-positive.
      out.push({ deficitGroup: null, line: coveredLine, kind: coveredLine ? 'covered' : null });
    }
  }
  return out;
}
// ⭐ 우선순위 3군 선정(이사님 2026-06-20) — 결핍(+BMI 저체중/성장더딤이면 곡물·고기류 가중) 우선 → 3개 미달이면 자주 안 나온 군을 arcWeek 회전으로 충원(green이어도 새 음식 학습). groupSignals(ALL_GROUPS 네임스페이스) 직접 사용.
function buildPriorityGroups(ctx: EnrichContext, macro: MacroTrack): PriorityGroup[] {
  const meal = ctx.groupSignals;   // 8군(곡물·콩류·유제품·고기·계란·생선·해산물·비타민A채소·기타채소·과일)
  const sev = (lv: string) => (lv === 'red' ? 0 : lv === 'yellow' ? 1 : 2);
  const macroBoost = macro.active && (macro.reason === 'lowWeight' || macro.reason === 'growthLag');
  const MACRO_PRIORITY = new Set(['곡물', '고기·계란']);   // BMI 저체중/성장더딤 → 탄단지·열량군 가중(이사님 'bmi로 곡물·고기류도 체크')
  const isBoost = (g: string) => macroBoost && MACRO_PRIORITY.has(g);
  // 1) 결핍(red/yellow) 또는 BMI 부스트군 — 심한 순 → 부스트 우선 → 적게 나온 순
  const deficits = meal.filter((s) => s.level !== 'green' || isBoost(s.group))
    .sort((a, b) => (sev(a.level) - sev(b.level)) || ((isBoost(b.group) ? 1 : 0) - (isBoost(a.group) ? 1 : 0)) || (a.weeklyEst - b.weeklyEst));
  const out: PriorityGroup[] = deficits.slice(0, 3).map((s, i) => ({
    group: s.group, kind: 'deficit' as const, level: s.level as 'green' | 'yellow' | 'red', weeklyEst: s.weeklyEst, rank: i + 1,
    reason: (isBoost(s.group) && s.level === 'green') ? '성장·열량 보강군(BMI 저체중/성장더딤)' : `결핍 보급(주 ${Math.round(s.weeklyEst * 10) / 10}회·${s.level})`,
  }));
  // 2) 3개 미달 → 자주 안 나온 군(weeklyEst 낮은 순)을 arcWeek 회전으로 충원(green이어도 — 거기서도 배울 음식 있음)
  if (out.length < 3) {
    const used = new Set(out.map((o) => o.group));
    const greens = meal.filter((s) => !used.has(s.group)).sort((a, b) => a.weeklyEst - b.weeklyEst);
    const m = Math.max(1, greens.length);
    const rot = (((ctx.arcWeek % m) + m) % m);
    const rotated = [...greens.slice(rot), ...greens.slice(0, rot)];   // 주마다 다른 green 시작점
    for (const s of rotated) {
      if (out.length >= 3) break;
      out.push({ group: s.group, kind: 'expand' as const, level: s.level as 'green' | 'yellow' | 'red', weeklyEst: s.weeklyEst, rank: out.length + 1, reason: '잘 먹는 군에서 새 음식 확장(자주 안 나온 군 회전)' });
    }
  }
  return out;
}

/** ⭐ 주간계획 모듈 핵심 — 일요일 종합(synth) 위에 7일치 구체 계획을 오케스트레이션. 순수·LLM0·throw 시 호출자 catch→null. */
export function enrichWeeklyPlan(synth: WeeklySynthesis, ctx: EnrichContext): PlanDetail {
  const freqMap = ctx.freqMap;
  const macro = buildMacroTrack(ctx);   // ⭐ 먼저 계산 — 저체중/성장더딤이면 고기류를 타깃 회전에 주입
  // 1) supply 풀 — 결핍군 대표 식재료 (+ ⭐이사님: BMI 저체중/성장더딤이면 탄단지 보강군(고기·계란 등)을 앞에 주입해 '고기류 타깃'화)
  const _exclude = new Set(ctx.excludeFoods || []);   // ⭐ 추천-무시 배제(이사님 2026-06-21) — 최근 14일 추천했는데 식단 미등장 식재료. 전부 배제 시 degrade로 원본 유지(굶기 방지).
  const poolOut = buildIngredientPool({ signals: ctx.groupSignals, likedIngredients: ctx.likedIngredients, freqMap, max: 8 });
  const _supRaw = poolOut.pool.slice(0, 8);
  const _supEx = _supRaw.filter((i) => !_exclude.has(i));
  let supplyPool = _supEx.length >= 2 ? _supEx : _supRaw;   // 배제 후 2개 미만이면 원본(plan 비지 않게)
  if (macro.active && (macro.reason === 'lowWeight' || macro.reason === 'growthLag')) {
    const macroIngs = macro.boostGroups.flatMap((g) => (GROUP_INGREDIENTS[g] || []).slice(0, 2)).filter((i) => i && !supplyPool.includes(i) && !_exclude.has(i));
    supplyPool = [...macroIngs, ...supplyPool].slice(0, 8);   // 고기류 우선
  }
  // 2) challenge 풀 — 잘 먹는 음식의 검증 사촌(안 먹는 쪽·식품군 한정) → 콩류 3주 도돌이표 구조적 차단
  const likedSet = new Set(ctx.likedIngredients);
  const challengePool: Array<{ ingredient: string; cousinOf: string }> = []; const seenC = new Set<string>();
  for (const lk of ctx.likedIngredients.slice(0, 8)) {
    for (const c of verifiedCousinsOf(lk).slice(0, 3)) {
      const g = groupOfIngredient(c.nm);
      if (!c.nm || likedSet.has(c.nm) || seenC.has(c.nm) || _exclude.has(c.nm)) continue;   // ⭐ 추천-무시 배제 — 사촌도 제외
      if (g && !PLAN_MEAL_GROUPS.has(g)) continue;
      seenC.add(c.nm); challengePool.push({ ingredient: c.nm, cousinOf: lk });
      if (challengePool.length >= 6) break;
    }
    if (challengePool.length >= 6) break;
  }
  // 3) 7-슬롯 회전 — supply 2 : challenge 1 인터리브(연속 동일 식재료 금지)
  // ⭐ A — 슬롯 근거(어드민 '왜 타깃'): supply는 결핍군 신호(weeklyEst·level), challenge는 잘 먹는 사촌. group→signal 룩업.
  const gsMap = new Map(ctx.groupSignals.map((s) => [s.group, s]));
  const mkSupply = (ing: string): PlanSlot | null => { const g = groupOfIngredient(ing); if (!g) return null; const gs = gsMap.get(g); return { ingredient: ing, cookedName: cookedName(ing), dishes: popularDishesFor(ing, freqMap).slice(0, 2), group: g, track: 'supply', via: 'deficit', weeklyEstFreq: gs?.weeklyEst, level: gs?.level as 'green' | 'yellow' | 'red' | undefined, reason: `결핍군 ${g} 보급(주 ${gs ? Math.round(gs.weeklyEst * 10) / 10 : '?'}회${gs?.level ? `·${gs.level}` : ''})` }; };
  const mkChallenge = (c: { ingredient: string; cousinOf: string }): PlanSlot | null => { const g = groupOfIngredient(c.ingredient); if (!g) return null; return { ingredient: c.ingredient, cookedName: cookedName(c.ingredient), dishes: popularDishesFor(c.ingredient, freqMap).slice(0, 2), group: g, track: 'challenge', via: 'cousin', pairLiked: c.cousinOf, reason: `잘 먹는 ${c.cousinOf}의 검증 사촌(푸드체이닝)` }; };
  const supplySlots = supplyPool.map(mkSupply).filter(Boolean) as PlanSlot[];
  const challengeSlots = challengePool.map(mkChallenge).filter(Boolean) as PlanSlot[];
  const slots: PlanSlot[] = []; let si = 0, ci = 0, lastIng = '';
  while (slots.length < 7 && (si < supplySlots.length || ci < challengeSlots.length)) {
    const wantChallenge = (slots.length % 3 === 2) && ci < challengeSlots.length;
    const pick = wantChallenge ? challengeSlots[ci++] : (si < supplySlots.length ? supplySlots[si++] : (ci < challengeSlots.length ? challengeSlots[ci++] : undefined));
    if (!pick) break;
    if (pick.ingredient === lastIng) continue;
    slots.push(pick); lastIng = pick.ingredient;
  }
  if (slots.length && slots.length < 7) { const extra: PlanSlot[] = []; for (const s of slots) if (s.dishes.length >= 2 && slots.length + extra.length < 7) extra.push({ ...s, dishes: [s.dishes[1]] }); slots.push(...extra); }
  // 4) (macro는 위에서 계산됨) · 5) 커리큘럼 anti-stall 가시화 · 6) 거울 스케줄
  const focus = ctx.goals.find((g) => g.status === 'focus') || null;
  const standby = ctx.goals.filter((g) => g.status === 'standby').map((g) => g.unit_id);
  const stalledOut = ctx.goals.find((g) => g.status === 'stopped')?.unit_id ?? null;
  const prevFocus = (ctx.focusHistory && ctx.focusHistory[0]?.unit_id) || null;
  const graduatedTo = (focus && prevFocus && focus.unit_id !== prevFocus) ? focus.unit_id : null;
  const priorityGroups = buildPriorityGroups(ctx, macro);   // ⭐ 우선순위 3군(결핍+BMI+자주 안 나온 군 회전) — 추천·거울 정합 + 어드민 가시화
  const mirrorSchedule = buildMirrorSchedule(slots.slice(0, 7), ctx.coveredGroups, macro, ctx.attendsDaycare, freqMap);   // ⭐ 슬롯 인덱스 정렬 — 거울[i]=슬롯[i] 군(모순 차단)
  return {
    schemaVersion: 1, targetRotation: slots.slice(0, 7), supplyPool, challengePool, poolMode: poolOut.mode, macroTrack: macro,
    curriculum: { focusUnit: focus?.unit_id ?? null, focusLabel: focus ? UNITS[focus.unit_id].label : null, standby, stalledOut, graduatedTo, lever: focus ? leverForUnit(focus.unit_id) : (synth.budget.lever || 'food') },
    mirrorSchedule, deficitGroups: ctx.deficitGroups, coveredGroups: ctx.coveredGroups, priorityGroups, excludeFoods: ctx.excludeFoods || [],
  };
}

export type PlanSlotPick = { slot: PlanSlot; slotIndex: number; mirror: MirrorSlot | null; macroPhrase: string | null };
/** ⭐ 일간 소비(유연성 가드) — 주간 plan_detail은 '가이드'. 그날 기록 데이터(현재 결핍)로 vetting해 적응(이사님).
 *  slot=(daySeed+cidHash)%n 시작, supply 슬롯의 group이 더는 결핍 아니면(받아들임/채워짐) 다음 유효 슬롯으로 회전. challenge는 항상 유효. */
export function pickPlanSlot(detail: PlanDetail | null | undefined, p: { daySeed: number; cidHash: number; deficitNow: Set<string>; recentIngredients?: string[] }): PlanSlotPick | null {
  if (!detail || !detail.targetRotation?.length) return null;
  const rot = detail.targetRotation, n = rot.length;
  const base = (((p.daySeed + p.cidHash) % n) + n) % n;
  const recent = new Set(p.recentIngredients || []);
  const pack = (s: PlanSlot, idx: number): PlanSlotPick => {
    const macroPhrase = (detail.macroTrack.active && detail.macroTrack.cadenceWeek && detail.mirrorSchedule[idx]?.kind === 'macro') ? detail.macroTrack.phrase : null;
    return { slot: s, slotIndex: idx, mirror: detail.mirrorSchedule[idx] ?? null, macroPhrase };
  };
  const valid = (s: PlanSlot) => !(s.track === 'supply' && p.deficitNow.size > 0 && !p.deficitNow.has(s.group));   // 유연성 가드: 채워진 supply 스킵
  // 1차: 유효 + 최근 미추천(메추리알 수렴 차단) / 2차: 유효(최근 무시) / 3차: base
  for (const avoidRecent of [true, false]) {
    for (let i = 0; i < n; i++) {
      const idx = (base + i) % n; const s = rot[idx]; if (!s || !valid(s)) continue;
      if (avoidRecent && recent.has(s.ingredient)) continue;
      return pack(s, idx);
    }
  }
  return pack(rot[base], base);
}

// ── ⭐ E-08 — 일요일 회고 편지(자유작문 잔존면) 규격 ───────────────────────────
// 유일하게 '한 주 이야기'를 회고로 묶는 자리(신선도 담당). 빈도 주 1회라 기존 가드 스택(det+검증자)을
// 그대로 적용해도 비용 무시 — 호출(크론 일요일 분기·가드 경유)은 H-02.
export const SYSTEM_RECAP = `당신은 영유아 편식 부모를 돕는 따뜻한 코치입니다. 한 주를 마치는 일요일 저녁, 부모에게 보내는 짧은 회고 편지를 씁니다.
규칙:
- 4~6문장. 정중한 존댓말, 줄표(—) 대신 마침표.
- 제공된 '이번 주 요약'의 사실만 쓴다(숫자·횟수·사건 창작 금지). 요약에 없는 일은 모른다.
- 칭찬은 부모의 행동(차림·기다림·기록)을 향한다. 아이 성과 단정·과장 환호 금지.
- '미션·과제·목표·수업·진도·단계' 단어 금지(내부 개념 비노출). 점수·등급·체중 금지.
- 다음 주 예고는 한 문장만, 부담 없는 초대 톤("다음 주엔 ~쪽을 살펴보려 해요").
- 의학 단어·진단 금지. 매운·튀김·초가공 권유 금지.
JSON만: {"letter":"...","oneliner":"한 줄 요약(40자 이내)"}`;

export function buildRecapUser(p: {
  childName?: string; ageBand?: string;
  weekSummary: string[];          // 이번 주 진도 요약(코드 산출 — 전진·관측·졸업·쉼 등 사실 문장들)
  impression?: string | null;     // 이번 주 닻 소견(내부)
  nextGoals: Array<{ label: string }>;   // 다음 주 포트폴리오(레지스트리 label — 내부 id 비노출)
}): string {
  return `[아이] ${(p.childName || '아이').slice(0, 20)} (${p.ageBand || '유아'})
[이번 주 요약 — 이 사실만 사용]
${p.weekSummary.length ? p.weekSummary.map((s) => `· ${s}`).join('\n') : '· 기록이 적은 한 주였음(있는 그대로 따뜻하게)'}
${p.impression ? `[코치 내부 소견(참고용·직접 인용 금지)] ${p.impression}\n` : ''}[다음 주 살펴볼 결] ${p.nextGoals.map((g) => g.label).join(' · ') || '이번 주 흐름 이어가기'}

위 사실만으로 한 주 회고 편지를 4~6문장으로.`;
}
