/**
 * lib/coachGrounding.ts — Letter B(merged) grounding 계층 (WBS v2-하이브리드 EPIC C)
 *
 * 사상: v3 두뇌(재료·가이드)는 코드가 결정론으로 못 박고, 작문은 v2 LLM이 직접 한다.
 *   이 파일은 그 '재료를 LLM 텍스트로 직렬화'(serializeMaterials)하고, '괴식 조합을 차단'(verifyComboSafety)하고,
 *   '기록<3일 온보딩을 판정'(buildOnboardingDecision)하고, '발행 전 품질축을 스캔'(qualityScan)하는 순수 함수만 export 한다.
 *   ⚠️ Letter A(대조군)는 이 파일을 호출하지 않는다. 배선(buildLetterUserB·composeLetterB)은 coach.ts의 몫.
 *
 * 전부 순수 함수 — fs/HTTP·시계·LLM 불사용(단독 단위 테스트). qualityScan은 coachQuality(EPIC D)의
 *   letterQualityScan을 재사용(중복 구현 금지) — 4축(은유 과용·데이터 나열·모호 기간어·재료 밖 음식명).
 *
 * 원자: C-07 serializeMaterials · C-08 buildOnboardingDecision · C-09 verifyComboSafety · C-12 qualityScan.
 */
import { letterQualityScan } from './coachQuality';
import type { FactRow } from './coachFacts';

// ── 공용: Letter B grounding 모드 ───────────────────────────────────────────────
export type GroundingMode = 'merged';

// ── C-09 — verifyComboSafety: 섞기 조합 정합성(괴식 0점 차단) ───────────────────────
export type ComboCandidate = { dish: string; ingredient: string };
export type SafeCombo = { dish: string; ingredient: string; score: number };
/**
 * '잘먹는음식 × 결핍식재료' 조합 중 scoreOf(주입)가 매트릭스·궁합으로 매긴 점수가 1 이상인 것만 통과.
 *  score<1·미존 셀(0)·NaN·음수는 전부 괴식으로 보고 제거('미역국+당근' 차단 — 인계서 개선 A).
 *  scoreOf 주입으로 순수성 유지(테스트=가짜 함수, 런타임=kitGuide/kit-dish-matrix 조회).
 *  이 함수는 '최종 게이트'다 — food-graph 궁합 승격은 호출자(selectDailyMaterials)가 scoreOf에 합성.
 */
export function verifyComboSafety(
  combos: ComboCandidate[],
  scoreOf: (dish: string, ing: string) => number,
): SafeCombo[] {
  const out: SafeCombo[] = [];
  for (const c of combos || []) {
    if (!c || !c.dish || !c.ingredient) continue;
    const s = Number(scoreOf(c.dish, c.ingredient));
    if (!Number.isFinite(s) || s < 1) continue;   // 0=괴식·미존 셀·NaN·음수 = 탈락
    out.push({ dish: c.dish, ingredient: c.ingredient, score: s });
  }
  return out;
}

// ── C-07 — serializeMaterials: 검증 재료를 LLM 텍스트 블록으로 직렬화 ─────────────────
const COMBO_MAX = 4;   // 조합 항목 상한(프롬프트 비대·환각 입구 차단)
export type MaterialsInput = {
  target: string;
  targetIngredient: string;
  combos: { dish: string; ingredient: string; score: number }[];
  rationale: string;
  periodFact: string;
  cousins?: string[];
};
/**
 * selectDailyMaterials(EPIC B) 결과(검증 조합·근거문구·수치기간·사촌)를 buildLetterUserB가 주입할 단일 텍스트로.
 *  - combos는 score>=1만(C-09 통과분), 점수 내림차순, 상한 COMBO_MAX(4) 절단. 빈 combos면 조합 라인 생략.
 *  - 타깃 식재료명·dish·cousins 외 음식명은 절대 합성 안 함(LLM 지어내기 입구 차단).
 *  - rationale·periodFact는 입력 그대로 박음(사실 생성 안 함). 순수 함수.
 */
export function serializeMaterials(m: MaterialsInput): string {
  const lines: string[] = [];
  lines.push(`[오늘 타깃] ${m.target} — ${m.targetIngredient}`);
  const combos = (m.combos || [])
    .filter((c) => c && c.dish && Number.isFinite(Number(c.score)) && Number(c.score) >= 1)
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, COMBO_MAX);
  if (combos.length) {
    lines.push(`검증된 조합(점수순): ${combos.map((c) => `${c.dish}+${c.ingredient}(${c.score})`).join('·')}`);
  }
  if (m.rationale) lines.push(`근거: ${m.rationale}`);
  if (m.periodFact) lines.push(`기간: ${m.periodFact}`);
  if (m.cousins && m.cousins.length) lines.push(`사촌: ${m.cousins.join('·')}`);
  return lines.join('\n');
}

// ── C-08 — buildOnboardingDecision: 기록<3일 판정 + 빠뜨린 입력 안내(순수) ─────────────
/** 온보딩 임계 — coachScenarios recentWindow/low-data-gap 철학·coachMaterials.materialsForLowData(3)와 정합. */
export const ONBOARDING_MIN_DAYS = 3;
const DINNER_SLOTS = new Set(['dinner']);
const ENV_HINT = '식사 환경(영상·자리)';
const REFUSE_HINT = '거부한 음식';
const DINNER_HINT = '저녁 끼니';
/**
 * 전체 기록 일수로 onboardingMode를 결정하고, 실제 행 데이터에서 '비어 있는' 입력 카테고리만 안내 목록으로.
 *  onboarding = loggedDaysTotal < ONBOARDING_MIN_DAYS(3). 순수 함수(DB·시계 미접근).
 *  - 거부 기록 0건 → '거부한 음식' · environment 채워진 행 0 → '식사 환경(영상·자리)' · dinner 슬롯 0 → '저녁 끼니'.
 */
export function buildOnboardingDecision(p: { rows: FactRow[]; loggedDaysTotal: number }): { onboarding: boolean; missingInputHints: string[] } {
  const rows = p.rows || [];
  const onboarding = (p.loggedDaysTotal || 0) < ONBOARDING_MIN_DAYS;
  const hasRefused = rows.some((r) => !!(r && r.refused && String(r.refused).trim()));
  const hasEnv = rows.some((r) => !!(r && r.environment && String(r.environment).trim()));
  const hasDinner = rows.some((r) => !!(r && r.slot && DINNER_SLOTS.has(String(r.slot))));
  const missingInputHints: string[] = [];
  if (!hasRefused) missingInputHints.push(REFUSE_HINT);
  if (!hasEnv) missingInputHints.push(ENV_HINT);
  if (!hasDinner) missingInputHints.push(DINNER_HINT);
  return { onboarding, missingInputHints };
}

// ── C-12 — qualityScan: 발행 전 품질축 결정론 스캔(4축) ────────────────────────────
// 단문 나열 보강(C 소유) — EPIC D는 무변경. D의 mealEnumeration은 '시점어+섭취동사' 문장 2개+ 또는
//   쉼표 명사 3개+를 잡지만, '어제 X 먹고 Y 먹었어요'처럼 한 문장에 섭취동사가 2회+ 들어간 영수증식
//   나열은 못 잡는다(쉼표 없음·문장 1개). C-12 명세가 이 케이스를 위반으로 요구하므로 여기서 보강한다.
const C12_AGO = /어제|그제|그저께|오늘|아침|점심|저녁|[0-9]+일\s*전/;
const C12_ATE = /먹(었|었어요|었네요|음|고)|드셨|비웠|남겼/g;
function inSentenceEnumeration(L: string): boolean {
  for (const s of (L || '').split(/[.!?。\n]/)) {
    if (!C12_AGO.test(s)) continue;
    C12_ATE.lastIndex = 0;
    const ateHits = (s.match(C12_ATE) || []).length;   // 한 문장에 섭취동사 2회+ = 'X 먹고 Y 먹었어요' 나열
    if (ateHits >= 2) return true;
  }
  return false;
}
/**
 * 은유 과용·데이터 나열·모호 기간어·재료 밖 음식명을 결정론으로 검사해 위반 사유(한국어) 배열을 반환(빈=통과).
 *  EPIC D(coachQuality.letterQualityScan)를 재사용 — materialFoods를 allowedFoods 화이트리스트로 넘긴다.
 *  + 단문 나열(한 문장 섭취동사 2회+)은 C가 보강 검사(D 무변경).
 *  ⚠️ 오탐 방지: 따뜻한 일반론·은유 1개·수치 동반 기간어·재료 안 음식명·일반명사(밥·국·반찬)는 통과한다.
 *  materialFoods가 비어도 은유·나열·모호기간 3축은 검사(재료밖만 안전 skip).
 */
export function qualityScan(p: { letter: string; materialFoods: string[] }): string[] {
  const allowedFoods = (p.materialFoods || []).filter(Boolean);
  // allowedFoods가 비면 letterQualityScan이 재료밖 검사를 안전 skip(전부 위반=과탐 방지) — 그래도 빈 배열을 넘겨 검사 비활성.
  const reasons = letterQualityScan(p.letter || '', allowedFoods.length ? { allowedFoods } : undefined).reasons;
  if (!reasons.some((r) => r.includes('나열')) && inSentenceEnumeration(p.letter || '')) reasons.push('데이터 나열');
  return reasons;
}

// ── 공용 — 재료에서 음식명 화이트리스트 추출(allowedFoodsFromBridge 보조) ────────────────
/**
 * MaterialsInput에서 LLM이 본문에 써도 되는 음식·식재료명을 화이트리스트로 모은다(qualityScan·offMaterialFood 입력).
 *  타깃 식재료·검증 조합의 dish/ingredient·사촌만 — 재료 밖 음식명은 절대 포함하지 않는다(괴식 입구 차단).
 */
export function materialFoodsOf(m: MaterialsInput | null | undefined): string[] {
  if (!m) return [];
  const out = new Set<string>();
  if (m.targetIngredient) out.add(m.targetIngredient);
  for (const c of m.combos || []) {
    if (c?.dish) out.add(c.dish);
    if (c?.ingredient) out.add(c.ingredient);
  }
  for (const ck of m.cousins || []) if (ck) out.add(ck);
  return [...out];
}
