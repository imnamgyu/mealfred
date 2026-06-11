/**
 * 계획 엔진(회전·dedup·아크) + 명단 정합성 회귀 테스트 — 2026-06-11 '3일 복붙' 사고 박제.
 */
import { describe, it, expect } from 'vitest';
import { buildCoachPlan, planSignature, SCEN_MOVES, STRUCTURAL_FRAMES, NO_FOOD_ACTION_FRAMES, MOVE_MENU, MOVE_KEYS, type CoachPlan } from '../lib/coach';
import { planFromWeekly, type WeeklyAnchor } from '../lib/coachWeekly';
import { SCENARIOS, type CoachSignals } from '../lib/coachScenarios';

const signals = (over: Partial<CoachSignals> = {}): CoachSignals => ({
  timeseries: [], reds: [], homeReds: [], missing: [], homeMissing: [],
  homeRefused: [], daycareRefused: [], refused: [], notes: [], favoriteFoods: [],
  attendsDaycare: true, ageBand: '5y', recentLoggedDays: 5, recentWindow: 5, icfqRiskCount: 0,
  envBadPct: 0.9, envCount: 10, ...over,
});
const anchor = (over: Partial<WeeklyAnchor> = {}): WeeklyAnchor => ({
  child_id: 'c1', week_key: '2026-W24', status: 'active', source: 'weekly_llm',
  mission: null, mission_target: '콩류', target_pool: ['콩류'], secondary_axis: null,
  budget: { expose: 2, push: 1, cadenceMinGap: 1, pushWindow: [2, 3, 4], lever: 'environment' },
  ledger: { pushUsed: false, exposeCount: {}, lastExposeDow: null, arcWeek: 1, reanchorUsed: false, adviceGivenAt: null, firstServeDow: null, progressWeek: 1 },
  impression: null, arc_week: 1, basis_hash: null, basis_attends_daycare: true,
  behavior_goal: '하루 한 끼는 화면 끄고 식탁에 앉혀, 끼니 30분 전 간식은 멈추기',
  teaching_arc: { stages: ['why', 'reinforce'], implIntention: null }, check_method: { method: 'observe' }, ...over,
});
const wk = (p: Partial<Parameters<typeof planFromWeekly>[0]> = {}) => planFromWeekly({
  anchor: anchor(), signals: signals(), recentPlans: [], targetExposeWtd: 0,
  progress: false, progressNote: null, firstOfWeek: false, lastArcStage: null,
  daySeed: 20000, cidHash: 7, dow: 3, ...p,
});

describe('명단 단일 소스 정합성(적대감사 회귀위험 #2 박제)', () => {
  it('STRUCTURAL_FRAMES = SCEN_MOVES 키와 동일', () => {
    expect(STRUCTURAL_FRAMES.sort()).toEqual(Object.keys(SCEN_MOVES).sort());
  });
  it('SCEN_MOVES의 모든 프레임은 실존 시나리오', () => {
    const ids = new Set(SCENARIOS.map((s) => s.id));
    STRUCTURAL_FRAMES.forEach((f) => expect(ids.has(f)).toBe(true));
  });
  it('NO_FOOD_ACTION = 구조 프레임 - 질감(음식 형태 변경이 본질)', () => {
    expect([...NO_FOOD_ACTION_FRAMES].sort()).toEqual(['autonomy-power-struggle', 'mealtime-atmosphere']);
  });
  it('MOVE_MENU와 MOVE_KEYS는 평행 배열(길이 동일)', () => {
    expect(MOVE_MENU.length).toBe(MOVE_KEYS.length);
  });
});

describe('구조 프레임 무브 회전(3일 복붙 사고 박제)', () => {
  it('시그니처가 최근 것을 피해 회전한다', () => {
    const recent: CoachPlan[] = [
      { frame: 'mealtime-atmosphere', target: null, moveKey: 'env:ritual', move: 'x', signature: planSignature('mealtime-atmosphere', null, 'env:ritual') },
      { frame: 'mealtime-atmosphere', target: null, moveKey: 'env:cutoff', move: 'x', signature: planSignature('mealtime-atmosphere', null, 'env:cutoff') },
    ];
    const bp = buildCoachPlan({ frame: 'mealtime-atmosphere', targetPool: [], recentPlans: recent, daySeed: 1, cidHash: 1 });
    expect(['env:ritual', 'env:cutoff']).not.toContain(bp.moveKey);
    expect(bp.escalate).toBe(false);
  });
  it('메뉴 전부 소진되면 escalate(→plateau 쉬어가기)', () => {
    const menu = SCEN_MOVES['mealtime-atmosphere'];
    const recent: CoachPlan[] = menu.map((m) => ({ frame: 'mealtime-atmosphere', target: null, moveKey: m.key, move: m.move, signature: planSignature('mealtime-atmosphere', null, m.key) }));
    const bp = buildCoachPlan({ frame: 'mealtime-atmosphere', targetPool: [], recentPlans: recent, daySeed: 1, cidHash: 1 });
    expect(bp.escalate).toBe(true);
  });
  it('같은 시드·같은 이력이면 결정론(재현 가능)', () => {
    const a = buildCoachPlan({ frame: 'mealtime-atmosphere', targetPool: [], recentPlans: [], daySeed: 42, cidHash: 9 });
    const b = buildCoachPlan({ frame: 'mealtime-atmosphere', targetPool: [], recentPlans: [], daySeed: 42, cidHash: 9 });
    expect(a.signature).toBe(b.signature);
  });
});

describe('주간 아크 단계(planFromWeekly)', () => {
  it('주 첫 편지 = intro(진단+왜는 주 1회만)', () => {
    const r = wk({ firstOfWeek: true });
    expect(r?.weeklyArc?.stage).toBe('intro');
  });
  it('진척 관측 + 직전이 reinforce 아님 → reinforce', () => {
    const r = wk({ progress: true, lastArcStage: 'observe', progressNote: '어제 아침 끼니를 화면 없이' });
    expect(r?.weeklyArc?.stage).toBe('reinforce');
    expect(r?.weeklyArc?.progressNote).toContain('화면 없이');
  });
  it('reinforce 이틀 연속 금지(직전 reinforce면 회전 단계로)', () => {
    const r = wk({ progress: true, lastArcStage: 'reinforce' });
    expect(r?.weeklyArc?.stage).not.toBe('reinforce');
    expect(['how', 'obstacle', 'observe']).toContain(r?.weeklyArc?.stage);
  });
  it('비-food 레버는 구조 프레임 + 전용 무브 시그니처(target/move null 고정 금지 — 사고 원형)', () => {
    const r = wk({});
    expect(r?.plan.frame).toBe('mealtime-atmosphere');
    expect(r?.plan.moveKey).toMatch(/^env:/);
    expect(r?.plan.signature).not.toBe(planSignature('mealtime-atmosphere', null, null));
  });
  it('비-food 무브 포화 시 plateau로 쉬어가기', () => {
    const menu = SCEN_MOVES['mealtime-atmosphere'];
    const recent: CoachPlan[] = menu.map((m) => ({ frame: 'mealtime-atmosphere', target: null, moveKey: m.key, move: m.move, signature: planSignature('mealtime-atmosphere', null, m.key) }));
    const r = wk({ recentPlans: recent });
    expect(r?.plan.frame).toBe('plateau');
  });
  it('behavior_goal 없는 닻(컬럼 미적용)은 arc=null — healAnchor가 메모리 보충해야 함', () => {
    const r = wk({ anchor: anchor({ behavior_goal: null }) });
    expect(r?.weeklyArc).toBeNull();
  });
});
