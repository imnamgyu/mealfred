/**
 * F-16 골든 — 커리큘럼 유닛 ↔ 일간 무브 결속(effectiveLever 스레딩).
 * 유닛 피벗(table-stage[env]→exposure-savings[food])이 본문 무브에 안 드러나던 연속성 plateau 봉합을 박제.
 *   ① 미전달 = 현행(주간 레버) byte-동일 · ② env닻+food레버=음식 프레임/타깃잠금 · ③ food닻+env레버=구조 프레임 ·
 *   ④ 과일 타깃=간식 채널 · ⑤ 음식/비음식 코히어런스(scenario.id ↔ NO_FOOD_ACTION_FRAMES 락스텝).
 */
import { describe, it, expect } from 'vitest';
import { planFromWeekly, type WeeklyAnchor, type WeeklyLever } from '../lib/coachWeekly';
import { NO_FOOD_ACTION_FRAMES, SNACK_CHANNEL } from '../lib/coach';
import type { CoachSignals } from '../lib/coachScenarios';

const sig = (o: Partial<CoachSignals> = {}): CoachSignals => ({
  timeseries: [], reds: [], homeReds: [], missing: [], homeMissing: [], homeRefused: [], daycareRefused: [], refused: [],
  notes: [], favoriteFoods: [], attendsDaycare: true, ageBand: '5y', recentLoggedDays: 5, recentWindow: 5, icfqRiskCount: 0,
  envBadPct: 0.9, envCount: 10, ...o,
});
const anc = (lever: WeeklyLever, o: Partial<WeeklyAnchor> = {}): WeeklyAnchor => ({
  child_id: 'c', week_key: '2026-W25', status: 'active', source: 'weekly_llm',
  mission: null, mission_target: '콩류', target_pool: ['콩류'], secondary_axis: null,
  budget: { expose: 2, push: 1, cadenceMinGap: 1, pushWindow: [2, 3, 4], lever },
  ledger: { pushUsed: false, exposeCount: {}, lastExposeDow: null, arcWeek: 1, reanchorUsed: false, adviceGivenAt: null, firstServeDow: null, progressWeek: 1 },
  impression: null, arc_week: 1, basis_hash: null, basis_attends_daycare: true,
  behavior_goal: '하루 한 끼는 화면 끄고 식탁에서', teaching_arc: { stages: ['why', 'reinforce'], implIntention: null }, check_method: null, goals: null, ...o,
});
const base = { recentPlans: [], targetExposeWtd: 0, progress: false, progressNote: null, firstOfWeek: false, lastArcStage: null, daySeed: 20000, cidHash: 7, dow: 3 };

describe('F-16 effectiveLever — 순수 가산성(미전달=주간 레버 byte-동일)', () => {
  it('effectiveLever 미전달 === undefined === null 모두 주간 레버 결과와 동일 시그니처', () => {
    const a = anc('environment');
    const s = sig();
    const r0 = planFromWeekly({ anchor: a, signals: s, ...base })!;
    const rU = planFromWeekly({ anchor: a, signals: s, ...base, effectiveLever: undefined })!;
    const rN = planFromWeekly({ anchor: a, signals: s, ...base, effectiveLever: null })!;
    expect(rU.plan.signature).toBe(r0.plan.signature);
    expect(rN.plan.signature).toBe(r0.plan.signature);
    expect(r0.plan.frame).toBe('mealtime-atmosphere');   // 주간 레버=environment 그대로
  });
});

describe('F-16 — env 닻 + 유닛 레버 food(노출 유닛 피벗) → 음식 프레임·타깃 잠금', () => {
  it('effectiveLever=food → frame ∈ {nutrient-gap,new-refusal,home-daycare-gap}·target=닻 mission_target', () => {
    const r = planFromWeekly({ anchor: anc('environment'), signals: sig({ missing: ['콩류'], homeMissing: ['콩류'] }), ...base, effectiveLever: 'food' })!;
    expect(['nutrient-gap', 'new-refusal', 'home-daycare-gap']).toContain(r.plan.frame);
    expect(r.plan.target).toBe('콩류');
    expect(NO_FOOD_ACTION_FRAMES.has(r.plan.frame)).toBe(false);   // 음식 행동 허용(useFood/bridgeFacts 켜짐) — 락스텝
  });
});

describe('F-16 — food 닻 + 유닛 레버 environment(환경 유닛) → 구조 프레임·env 무브', () => {
  it('effectiveLever=environment → frame=mealtime-atmosphere·moveKey=env:*·NO_FOOD_ACTION', () => {
    const r = planFromWeekly({ anchor: anc('food'), signals: sig(), ...base, effectiveLever: 'environment' })!;
    expect(r.plan.frame).toBe('mealtime-atmosphere');
    expect(r.plan.moveKey).toMatch(/^env:/);
    expect(NO_FOOD_ACTION_FRAMES.has(r.plan.frame)).toBe(true);   // 음식 행동 금지(useFood false 강제) — 락스텝
  });
});

describe('F-16 — 과일 타깃 food 피벗 = 간식 채널 유지(끼니에 곁들이지 않음)', () => {
  it('mission_target=과일(SNACK_CHANNEL) + effectiveLever=food → moveKey=snack', () => {
    expect(SNACK_CHANNEL.has('과일')).toBe(true);
    const r = planFromWeekly({ anchor: anc('environment', { mission_target: '과일', target_pool: ['과일'] }), signals: sig({ missing: ['과일'], homeMissing: ['과일'] }), ...base, effectiveLever: 'food' })!;
    expect(r.plan.moveKey).toBe('snack');
  });
});

describe('F-16 — effectiveLever가 forceScenarioId(food 경로)보다 구조 분기 우선(브레인 override 정합)', () => {
  it('effectiveLever=environment면 forceScenarioId(food) 무시하고 구조 프레임', () => {
    const r = planFromWeekly({ anchor: anc('food'), signals: sig(), ...base, effectiveLever: 'environment', forceScenarioId: 're-exposure-timing' })!;
    expect(r.plan.frame).toBe('mealtime-atmosphere');   // 구조 분기는 forceScenarioId(food-path 전용)를 타지 않음
  });
  it('effectiveLever=food + forceScenarioId(food) = 프레임 교체되되 타깃 잠금', () => {
    const r = planFromWeekly({ anchor: anc('environment'), signals: sig({ missing: ['콩류'], homeMissing: ['콩류'], daycareRefused: ['콩류'] }), ...base, effectiveLever: 'food', forceScenarioId: 're-exposure-timing' })!;
    expect(r.plan.frame).toBe('re-exposure-timing');
    expect(r.plan.target).toBe('콩류');
  });
});
