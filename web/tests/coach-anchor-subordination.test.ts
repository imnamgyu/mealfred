/**
 * EPIC A 골든 — 뇌↔주간 닻 계약(Decision Subordination).
 * 최상위 근본원인(일간 두뇌가 주간 닻을 통째 폐기) 봉합이 회귀로 되살아나지 않게 박제.
 * 순수함수 단위: anchorOverrideAllowed(게이트)·planFromWeekly(forceScenarioId 잠금 보존)·targetPoolForScenario(결핍군 필터).
 */
import { describe, it, expect } from 'vitest';
import { anchorOverrideAllowed, planFromWeekly, LEVER_SCENARIO, SAFE_INTERRUPT_SCENARIOS, FOOD_OVERRIDE_CAP, DEFAULT_LEDGER, type WeeklyAnchor } from '../lib/coachWeekly';
import { targetPoolForScenario } from '../lib/coach';
import { groupOf } from '../lib/nutrition';
import type { CoachSignals } from '../lib/coachScenarios';

const sig = (o: Partial<CoachSignals> = {}): CoachSignals => ({
  timeseries: [], reds: [], homeReds: [], missing: [], homeMissing: [], homeRefused: [], daycareRefused: [], refused: [],
  notes: [], favoriteFoods: [], attendsDaycare: false, ageBand: 'younger', recentLoggedDays: 10, recentWindow: 7, icfqRiskCount: 0, ...o,
});
const anc = (o: Partial<WeeklyAnchor> = {}): WeeklyAnchor => ({
  child_id: 'c', week_key: '2026-W25', status: 'active', source: 'weekly_llm',
  mission: null, mission_target: '콩류', target_pool: ['콩류'], secondary_axis: null,
  budget: { expose: 2, push: 1, cadenceMinGap: 1, pushWindow: [2, 3, 4], lever: 'food' },
  ledger: { ...DEFAULT_LEDGER }, impression: null, arc_week: 1, basis_hash: null, basis_attends_daycare: false,
  behavior_goal: '콩류를 격일로 작게 곁들이기', teaching_arc: { stages: ['why', 'reinforce'] }, check_method: null, goals: null, ...o,
});

describe('A-04/A-06 — anchorOverrideAllowed 게이트', () => {
  it('food 주 = 항상 허용(기존 다양성 보존)·food override 아님', () => {
    const r = anchorOverrideAllowed({ anchorLever: 'food', sid: 'nutrient-gap', fov: 0, triggerOk: true });
    expect(r.allow).toBe(true); expect(r.isFoodOverride).toBe(false);
  });
  it('비-food 주 + 레버 호환 시나리오 = 허용·캡 소비 없음', () => {
    const r = anchorOverrideAllowed({ anchorLever: 'environment', sid: LEVER_SCENARIO.environment, fov: 0, triggerOk: true });
    expect(r.allow).toBe(true); expect(r.isFoodOverride).toBe(false);
  });
  it('비-food 주 + food 시나리오 + 캡 미소진 = 허용(food override 1 소진)', () => {
    const r = anchorOverrideAllowed({ anchorLever: 'environment', sid: 'nutrient-gap', fov: 0, triggerOk: true });
    expect(r.allow).toBe(true); expect(r.isFoodOverride).toBe(true);
  });
  it('비-food 주 + food 시나리오 + 캡 소진 = 차단(음식 잔소리 연속 방지)', () => {
    const r = anchorOverrideAllowed({ anchorLever: 'environment', sid: 'nutrient-gap', fov: FOOD_OVERRIDE_CAP, triggerOk: true });
    expect(r.allow).toBe(false);
  });
  it('SAFE_INTERRUPT(전환 축하 등) = 닻 무관 항상 허용', () => {
    expect(SAFE_INTERRUPT_SCENARIOS.has('progress-celebrate')).toBe(true);
    const r = anchorOverrideAllowed({ anchorLever: 'environment', sid: 'progress-celebrate', fov: FOOD_OVERRIDE_CAP, triggerOk: true });
    expect(r.allow).toBe(true); expect(r.isFoodOverride).toBe(false);
  });
  it('A-06 — 트리거 미충족이면 차단(daycareRefused=[]에서 re-exposure 강제 등)', () => {
    const r = anchorOverrideAllowed({ anchorLever: 'food', sid: 're-exposure-timing', fov: 0, triggerOk: false });
    expect(r.allow).toBe(false);
  });
  it('FOOD_OVERRIDE_CAP = 2(주당)', () => expect(FOOD_OVERRIDE_CAP).toBe(2));
  // ⭐ F-16 양방향화 — food 주에 두뇌가 구조(환경·자율·식감) 시나리오로 덮는 것을 차단(주간 food 잠금 보존·자가정독 #1 봉합)
  it('F-16 — food 주 + 구조 시나리오(mealtime-atmosphere) = 차단', () => {
    const r = anchorOverrideAllowed({ anchorLever: 'food', sid: 'mealtime-atmosphere', fov: 0, triggerOk: true });
    expect(r.allow).toBe(false); expect(r.isFoodOverride).toBe(false);
  });
  it('F-16 — food 주 + food 시나리오(nutrient-gap) = 종전대로 허용', () => {
    const r = anchorOverrideAllowed({ anchorLever: 'food', sid: 'nutrient-gap', fov: 0, triggerOk: true });
    expect(r.allow).toBe(true);
  });
  it('F-16 — food 주 + 안전 인터럽트(적신호)는 구조여도 항상 허용', () => {
    const r = anchorOverrideAllowed({ anchorLever: 'food', sid: 'neophobia-arfid-watch', fov: 0, triggerOk: true });
    expect(r.allow).toBe(true);
  });
});

describe('A-03 — planFromWeekly forceScenarioId(닻 안에서 시나리오만 교체·타깃 잠금 보존)', () => {
  const base = { signals: sig({ homeMissing: ['콩류'], missing: ['콩류'] }), recentPlans: [], targetExposeWtd: 0, progress: false, firstOfWeek: true, daySeed: 1, cidHash: 1, dow: 2 };
  it('force 미전달 = 닻 타깃(콩류) 그대로', () => {
    const wk = planFromWeekly({ anchor: anc(), ...base })!;
    expect(wk).not.toBeNull();
    expect(wk.plan.target).toBe('콩류');
  });
  it('force=re-exposure-timing = frame 교체되되 target=콩류 잠금 유지', () => {
    const wk = planFromWeekly({ anchor: anc(), ...base, forceScenarioId: 're-exposure-timing' })!;
    expect(wk.plan.frame).toBe('re-exposure-timing');
    expect(wk.plan.target).toBe('콩류');
  });
  it('push 캡 — pushUsed=true면 forceScenarioId여도 채근(push) 미적용', () => {
    const a = anc({ ledger: { ...DEFAULT_LEDGER, pushUsed: true } });
    const wk = planFromWeekly({ anchor: a, ...base, targetExposeWtd: 3, dow: 3, forceScenarioId: 'nutrient-gap' })!;
    expect(wk.pushApplied).toBe(false);
  });
  it('비결핍이면(pool 빔) plateau로 — 닻 타깃이 더는 결핍 아닐 때', () => {
    const wk = planFromWeekly({ anchor: anc(), ...base, signals: sig({ homeMissing: [], missing: [] }), forceScenarioId: 'nutrient-gap' })!;
    expect(wk.plan.frame).toBe('plateau');
  });
});

describe('A-08 — targetPoolForScenario 결핍군 필터(치킨 누수 차단)', () => {
  it('refusedExposable 있으면 그것만(치킨 제외·콩류만)', () => {
    const s = sig({ homeRefused: ['치킨', '콩류'], daycareRefused: ['치킨'], refusedExposable: ['콩류'] });
    expect(targetPoolForScenario('re-exposure-timing', s)).toEqual(['콩류']);
    expect(targetPoolForScenario('new-refusal', s)).not.toContain('치킨');
  });
  it('refusedExposable 없으면(구경로) 기존 합집합 폴백', () => {
    const s = sig({ homeRefused: ['콩류'], daycareRefused: ['생선'] });
    expect(targetPoolForScenario('re-exposure-timing', s).sort()).toEqual(['생선', '콩류']);
  });
  it('nutrient-gap은 결핍 식품군 풀(거부 필터 무관)', () => {
    const s = sig({ homeMissing: ['콩류'], missing: ['비타민A채소'] });
    expect(targetPoolForScenario('nutrient-gap', s).sort()).toEqual(['비타민A채소', '콩류']);
  });
});

describe('K-01(가드감사) — refExposable 네임스페이스: 카테고리→식품군 빗대기(과잉억제 봉합)', () => {
  const catStub = (cat: string) => (x: string): string | undefined => (x ? cat : undefined);
  it('catOf 카테고리를 식품군 공간으로 매핑(생선→생선·해산물·콩_콩제품→콩류·잎채소→비타민A채소)', () => {
    expect(groupOf('고등어거부', catStub('생선'))).toBe('생선·해산물');
    expect(groupOf('두부거부', catStub('콩_콩제품'))).toBe('콩류');
    expect(groupOf('시금치거부', catStub('잎채소'))).toBe('비타민A채소');
  });
  it('결핍군 필터가 식품군 공간에서 매치 — 구버전(카테고리 직접비교)이면 영구차단되던 케이스 회귀 박제', () => {
    const deficient = new Set(['콩류', '생선·해산물']);
    const filt = (r: string, cat: string) => { const g = groupOf(r, catStub(cat)); return !!g && deficient.has(g); };
    expect(filt('고등어거부', '생선')).toBe(true);       // ✅ 신버전: 재노출 타깃 가능
    expect(filt('두부거부', '콩_콩제품')).toBe(true);
    expect(deficient.has('생선')).toBe(false);            // ⚠️ 구버전은 catOf='생선'을 직접 비교 → false(영구차단)
    expect(deficient.has('콩_콩제품')).toBe(false);
  });
});
