/**
 * lib/coachCompare.ts — Letter B 오케스트레이터 (WBS v2-하이브리드 EPIC E)
 *
 * 사상: 크론(route.ts)이 비대해지지 않도록 Letter B 생성 전 과정을 단일 진입점 buildLetterB로 분리한다.
 *   입력은 route가 이미 계산한 신호 묶음(+v3 두뇌 산출 dailyResult/anchor), 출력은 altLetter 페이로드.
 *   어떤 단계든 throw하면 catch해 null 반환 → A만 발행(발행 보장·S7 정신). DB 쓰기는 route가 담당(이 모듈 무상태).
 *
 * 흐름(E-02): selectDailyMaterials(A) → 직렬화·조합 안전검증(C) → buildTeachingGuide(B) → composeLetterB(C 작문·G 검증).
 *   ⚠️ Letter A(planFor+composeLetter)는 이 모듈을 호출하지 않는다(대조군 보존).
 *
 * 원자: E-02 골격·폴백 · E-03 freqMap 배선 · E-05 회전 입력 · E-09 design 스냅샷.
 */
import { selectDailyMaterials, type MealRow, type DailyMaterials } from './coachMaterials';
import { buildTeachingGuide, type TeachingGuide } from './coachGuide';
import { serializeMaterials, verifyComboSafety, materialFoodsOf, type MaterialsInput } from './coachGrounding';
import { scoreCombo } from './comboMatrix';
import { letterSimilarity, type LetterInput, type LetterVerify } from './coach';
import { type FreqMap } from './coachRecos';
import { type GroupSignal } from './nutrition';
import { type DailyV3Result } from './coachDaily';
import { type WeeklyAnchor } from './coachWeekly';
import { type CRow } from './curriculumUnits';

// composeLetterB 반환 형태(coach.ts) — 순환 의존 회피 위해 구조형으로 받는다(주입).
type ComposeBResult = {
  letter: string; oneliner: string; coachRegen: boolean;
  verify: { ok: boolean; violations: string[]; regen: boolean } | null;
  quality: { violations: string[]; regen: boolean } | null;
  modelUsed: string;
};
export type ComposeLetterB = (p: {
  base: LetterInput; detInput?: string; detForbid?: RegExp | null; deadlineMs?: number;
  daySeed?: number; cidHash?: number; scenarioId?: string; model?: string;
  gen?: (input: LetterInput, model?: string) => Promise<{ letter: string; oneliner: string }>;
  verifyFn?: (q: { letter: string; facts: string; noFoodAction: boolean; noRediagnose: boolean }) => Promise<LetterVerify>;
}) => Promise<ComposeBResult>;

// ── E-09 — altLetter 페이로드(어드민 검증 스냅샷) ─────────────────────────────────
export type AltLetterDesignMaterials = { food: string | null; reason: string; targetGroup: string | null; combos: { dish: string; ingredient: string; score: number }[]; reasonPhrases: string[] };
export type AltLetterDesign = {
  decision: { unit: string; mode: string; step: number } | null;
  materials: AltLetterDesignMaterials;
  guide: { unit_ko: string; arcStage: string; mode: string; stepN: number } | null;
  verify: { ok: boolean; violations: string[] } | null;
  quality: { violations: string[] } | null;
  simToPrevB: number | null;
  repeatAlertB: boolean;
  model: string;
  llmCalls: number;
  paths: string[];     // 탄 개선 플래그(A~I) — 어드민이 '어떤 가드 통과'를 확인
};
export type AltLetter = {
  letter: string;
  oneliner: string;
  design: AltLetterDesign;
  mirror: string | null;
  materials: AltLetterDesignMaterials;   // E-06 요약본(거대 객체 금지)
  verify: { ok: boolean; violations: string[] } | null;
  modelUsed: string;
  llmCalls: number;
};

/** DailyMaterials → serializeMaterials 입력으로 어댑팅(조합은 verifyComboSafety로 최종 게이트). */
function toMaterialsInput(m: DailyMaterials): MaterialsInput | null {
  if (!m.recommendedIng || !m.targetGroup) return null;
  // C-09 최종 게이트 — selectDailyMaterials가 buildValidatedCombos(임계2)로 1차 거른 것에 verifyComboSafety(임계1) 한 번 더.
  const safe = verifyComboSafety(
    (m.validatedCombos || []).map((c) => ({ dish: c.liked, ingredient: m.recommendedIng! })),
    (dish, ing) => scoreCombo(dish, ing).score,
  );
  // validatedCombos.deficient는 표시형(밥·빵 등 주식 형태) — 점수/직렬화 라벨은 표시형으로 맞춘다.
  const displayOf: Record<string, string> = {};
  for (const c of m.validatedCombos || []) displayOf[c.liked] = c.deficient;
  const combos = safe.map((s) => ({ dish: s.dish, ingredient: displayOf[s.dish] || s.ingredient, score: s.score }));
  return {
    target: m.targetGroup,
    targetIngredient: m.recommendedIng,
    combos,
    rationale: (m.reasonPhrases || []).join(' · '),
    periodFact: m.deficiencyWindow ? `${m.deficiencyWindow.group}가 최근 7일 중 ${m.deficiencyWindow.daysOf7}일 등장(권장 주 ${m.deficiencyWindow.threshold}일)` : '',
    cousins: undefined,
  };
}

/** TeachingGuide → LetterInput.teachingGuide 직렬화 문자열(고정 블록 아님 — LLM 재료). */
export function serializeGuide(g: TeachingGuide): string {
  const parts = [
    `유닛: ${g.unit_ko}(${g.lever})`,
    g.stepBehavior ? `행동: ${g.stepBehavior}` : '',
    g.why ? `근거: ${g.why}` : '',
    `각도: ${g.arcStage}`,
    g.weeklyImpressionSoft ? `배경: ${g.weeklyImpressionSoft}` : '',
    g.doNotRestate.length ? `재서술 금지: ${g.doNotRestate.join(' / ')}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

export type BuildLetterBArgs = {
  childName: string;
  ageBand: string;
  rows: CRow[];                          // 자녀 최근 끼니 행(decideDailyV3·재료 입력)
  meals: MealRow[];                      // liked 판정용(recentMeals 형태)
  today: string;
  freqMap: FreqMap;                      // E-03 — 죽은코드 부활(급식빈도 가중)
  favoriteFoods: string[];
  reds: string[];
  missing: string[];
  groupSignals: GroupSignal[];           // computeGroupSignals(byDay,catOf).signals
  recordedDays: number;
  onboardingMeta?: { hasHeight?: boolean; hasWeight?: boolean; hasConditions?: boolean };
  recentBMaterials: string[];            // E-05 — 최근 B 추천 식재료(3일 무재사용 회전 입력)
  pastBLetters: { date: string; letter: string }[];   // E-05 — B 자체 연속성(A와 분리)
  factCards: string[] | null;
  mirror: string | null;
  timeseries: string[];
  attendsDaycare: boolean;
  chronicGuidance?: string;
  dailyResult: DailyV3Result;            // E-07 — v3 두뇌(진도·결정)
  anchor: WeeklyAnchor | null;
  firstOfWeek: boolean;
  lastArcStage: string | null;
  progress: boolean;
  recentCtxs: Array<Record<string, unknown>>;   // doNotRestate 입력
  dow: number;
  daySeed: number;
  cidHash: number;
  deadlineMs?: number;
  /** LLM 작문 — 주입(coach.composeLetterB). 미주입이면 즉시 null(전역 import 비의존·테스트). */
  composeLetterB: ComposeLetterB;
  /** 옵션 — 작문 LLM 생성기 주입(테스트). 런타임은 생략(composeLetterB 내부 실경로). */
  gen?: (input: LetterInput, model?: string) => Promise<{ letter: string; oneliner: string }>;
  verifyFn?: (q: { letter: string; facts: string; noFoodAction: boolean; noRediagnose: boolean }) => Promise<LetterVerify>;
};

/**
 * Letter B 생성 단일 진입점. selectDailyMaterials → guide → composeLetterB.
 *   어떤 단계든 throw → catch → null(A는 별개로 항상 발행). deadlineMs 이미 지났으면 LLM 진입 전 null(S7).
 */
export async function buildLetterB(args: BuildLetterBArgs): Promise<AltLetter | null> {
  try {
    // E-08 — 데드라인 이미 지났으면 LLM 호출 전 null(A 보호 우선·발행 보장)
    if (args.deadlineMs != null && Date.now() >= args.deadlineMs) return null;

    // ① 재료(A 엔진) — 결정론 회전·괴식 차단·근거 문구
    const materials = selectDailyMaterials({
      signals: args.groupSignals,
      meals: args.meals,
      favoriteFoods: args.favoriteFoods,
      recentRecos: args.recentBMaterials,
      freqMap: args.freqMap,
      recordedDays: args.recordedDays,
      onboardingMeta: args.onboardingMeta,
      tipSeed: args.daySeed + args.cidHash,
    });
    const matInput = toMaterialsInput(materials);
    const onboardingMode = materials.mode === 'onboarding';

    // ② 두뇌 가이드(B 엔진) — decision/anchor → arcStage·why·doNotRestate
    const guide = buildTeachingGuide({
      dailyResult: args.dailyResult,
      anchor: args.anchor,
      firstOfWeek: args.firstOfWeek,
      lastArcStage: args.lastArcStage,
      progress: args.progress,
      recentCtxs: args.recentCtxs,
      dow: args.dow,
    });

    const materialsText = matInput ? serializeMaterials(matInput) : null;
    const materialFoods = matInput ? materialFoodsOf(matInput) : [];

    // ③ Letter B 작문(C 작문 경로 + G 품질·검증 가드)
    const base: LetterInput = {
      childName: args.childName,
      ageBand: args.ageBand,
      reds: args.reds,
      missing: args.missing,
      favoriteFoods: args.favoriteFoods,
      timeseries: args.timeseries,
      attendsDaycare: args.attendsDaycare,
      pastLetters: args.pastBLetters,                 // E-05 — B 이력으로 유사도/연속성(A와 분리)
      chronicGuidance: args.chronicGuidance,
      factCards: args.factCards,
      groundingMode: 'merged',
      teachingGuide: serializeGuide(guide),
      materials: materialsText,
      materialFoods,
      mirror: args.mirror,
      onboardingMode,
      missingInputHints: materials.missingInputs || null,
      weeklyArc: { stage: guide.arcStage, behaviorGoal: guide.stepBehavior, progressNote: null },
    };

    // 재차 데드라인 가드(재료/가이드 계산 후) — 잔여 없으면 LLM 진입 전 null
    if (args.deadlineMs != null && Date.now() >= args.deadlineMs) return null;

    const out = await args.composeLetterB({
      base,
      deadlineMs: args.deadlineMs,
      daySeed: args.daySeed,
      cidHash: args.cidHash,
      scenarioId: 'nutrient-gap',
      gen: args.gen,
      verifyFn: args.verifyFn,
    });
    if (!out || !out.letter) return null;

    // ④ E-09 — design 스냅샷(재료·근거·진단·검증·반복 자가측정)
    const llmCalls = 1
      + (out.coachRegen ? 1 : 0)
      + (out.verify ? 1 : 0)
      + (out.verify?.regen ? 1 : 0)
      + (out.quality?.regen ? 1 : 0);
    const simToPrevB = args.pastBLetters.length
      ? Math.round(Math.max(...args.pastBLetters.map((q) => letterSimilarity(out.letter, q.letter))) * 1000) / 1000
      : null;
    const decision = args.dailyResult.decision
      ? { unit: args.dailyResult.decision.unit, mode: args.dailyResult.decision.mode, step: args.dailyResult.decision.step }
      : null;
    const matSummary: AltLetterDesignMaterials = {
      food: materials.recommendedIng,
      reason: (materials.reasonPhrases || [])[0] || '',
      targetGroup: materials.targetGroup,
      combos: matInput ? matInput.combos : [],
      reasonPhrases: (materials.reasonPhrases || []).slice(0, 4),
    };
    const paths: string[] = ['B'];                                   // 두뇌 가이드 경유
    if (matInput && matInput.combos.length) paths.push('A');         // 조합 안전검증 경유
    if (Object.keys(args.freqMap || {}).length) paths.push('C');     // 빈도 가중 경유
    if (materials.deficiencyWindow) paths.push('F');                 // 결핍 수치 경유
    if (out.quality) paths.push('G');                                // 품질검증 경유
    const verify = out.verify ? { ok: out.verify.ok, violations: out.verify.violations } : null;

    const design: AltLetterDesign = {
      decision,
      materials: matSummary,
      guide: { unit_ko: guide.unit_ko, arcStage: guide.arcStage, mode: guide.mode, stepN: guide.stepN },
      verify,
      quality: out.quality ? { violations: out.quality.violations } : null,
      simToPrevB,
      repeatAlertB: (simToPrevB ?? 0) >= 0.6,
      model: out.modelUsed,
      llmCalls,
      paths,
    };

    return {
      letter: out.letter,
      oneliner: out.oneliner || '',
      design,
      mirror: args.mirror,
      materials: matSummary,
      verify,
      modelUsed: out.modelUsed,
      llmCalls,
    };
  } catch (e) {
    console.warn('[coachCompare] buildLetterB:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
