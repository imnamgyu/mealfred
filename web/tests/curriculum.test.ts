/**
 * v3 진도 상태기계 회귀 테스트 (WBS B-25 — B-01~B-24·A-05·E-01 케이스 박제)
 * 규칙: 엣지케이스 발견 시 여기에 케이스 추가(복리). 배포 전 prebuild 게이트.
 */
import { describe, it, expect } from 'vitest';
import { UNITS, UNIT_IDS, TH, type CRow, type ProbeAnswer, type UnitId, type ProgressRow } from '../lib/curriculumUnits';
import { blankRow, evolveRow, isProgressing, isStalled, pickPivot, normalizeGoals, goalsOf, shouldSuppressInterrupt, advanceProgress } from '../lib/curriculum';

const TODAY = '2026-06-15';
const D = (n: number) => new Date(Date.parse(TODAY) - n * 86400000).toISOString().slice(0, 10);   // D(1)=어제
const row = (over: Partial<CRow>): CRow => ({
  log_date: D(1), slot: 'dinner', menus: ['밥'], refused: null, note: null,
  environment: null, place: 'home', ate_well: true, autonomy: null, texture: null, meal_time: null, ...over,
});
/** n일치 기본 기록(판정 보류 방지용 바닥 데이터) */
const baseDays = (n: number, over: Partial<CRow> = {}): CRow[] => Array.from({ length: n }, (_, i) => row({ log_date: D(i + 1), ...over }));
const ans = (unit: string, value: string, dAgo = 1): ProbeAnswer => ({ q_date: D(dAgo), unit_id: unit, signal: 's', value });
const ev = (unit: UnitId, rows: CRow[], answers: ProbeAnswer[] = [], foodTarget?: string) =>
  UNITS[unit].extract(rows, answers, TODAY, { foodTarget });

// ── B-01·B-02·B-03 — 레지스트리 정합성 ──────────────────────────────────────────
describe('B-01/02/03 레지스트리 정합성', () => {
  it('B-01-1 UnitId 12종 = SQL CHECK 목록과 동일', () => {
    expect(UNIT_IDS.sort()).toEqual([
      'autonomy-part', 'exposure-savings', 'food-bridge', 'fullness-respect', 'hunger-rhythm', 'link-rhythm',
      'no-bargain', 'parent-model', 'pressure-off', 'sensory-texture', 'table-stage', 'table-talk',
    ]);
  });
  it('B-02-1 전 유닛 완결성: steps≥2·probes≥1·extract·relapseWhen', () => {
    for (const u of UNIT_IDS) {
      const d = UNITS[u];
      expect(d.steps.length).toBeGreaterThanOrEqual(2);
      expect(d.probes.length).toBeGreaterThanOrEqual(1);
      expect(typeof d.extract).toBe('function');
      expect(typeof d.relapseWhen).toBe('function');
      expect(d.minWeek).toBeGreaterThanOrEqual(1);
    }
  });
  it("B-02-2 전 유닛 probes 칩에 '잘 모르겠어요' 포함(무지 존중)", () => {
    for (const u of UNIT_IDS) for (const p of UNITS[u].probes) expect(p.chips).toContain('잘 모르겠어요');
  });
  it('B-03-1 핵심 임계 존재·범위 sanity', () => {
    expect(TH.stallDays).toBeGreaterThan(2);
    expect(TH.maxPivotsPerWeek).toBe(1);
    expect(TH.envTableStep2).toBeGreaterThan(TH.envTableStep1);
  });
});

// ── B-04~B-15 — 추출기 (진전/보류/오탐 3종) ────────────────────────────────────
describe('B-04 pressure-off', () => {
  it('1 압박 메모 일수(날짜 단위)', () => {
    const e = ev('pressure-off', [...baseDays(4), row({ log_date: D(2), slot: 'lunch', note: '한 입만 더 먹어보자 했어요' })]);
    expect(e.pressureMemoDays).toBe(1);
  });
  it('2 기록 3일 미만=보류(null)', () => {
    expect(ev('pressure-off', baseDays(2)).signalToday).toBeNull();
  });
  it('3 태그 표본 2 미만이면 negTagPct null', () => {
    const e = ev('pressure-off', baseDays(4), [ans('pressure-off', '압박')]);
    expect(e.negTagPct7d).toBeNull();
  });
});
describe('B-05 hunger-rhythm', () => {
  it('1 하루 3회+ 간식=그레이징 의심일', () => {
    const snacks = ['am_snack', 'pm_snack', 'snack'].map((s) => row({ log_date: D(2), slot: s }));
    const e = ev('hunger-rhythm', [...baseDays(4), ...snacks]);
    expect(e.snackHeavyDays).toBe(1);
  });
  it('2 식전 간식 메모 감지', () => {
    const e = ev('hunger-rhythm', [...baseDays(4), row({ note: '저녁 직전에 간식 줬어요' })]);
    expect(e.preMealMemoDays).toBe(1);
  });
  it('3 어제 정상=signalToday 1', () => {
    expect(ev('hunger-rhythm', baseDays(4)).signalToday).toBe(1);
  });
});
describe('B-06 table-stage', () => {
  it('1 envTablePct 계산', () => {
    const rows = [row({ environment: 'table' }), row({ log_date: D(2), environment: 'screen' }), row({ log_date: D(3), environment: 'screen' }), row({ log_date: D(4), environment: 'table' })];
    expect(ev('table-stage', rows).envTablePct7d).toBe(0.5);
  });
  it('2 env 표본 3 미만=보류', () => {
    expect(ev('table-stage', [row({ environment: 'table' })]).envTablePct7d).toBeNull();
  });
  it('3 어제 식탁 1끼=signalToday 1', () => {
    const rows = [row({ environment: 'table' }), row({ log_date: D(2), environment: 'screen' }), row({ log_date: D(3), environment: 'screen' })];
    expect(ev('table-stage', rows).signalToday).toBe(1);
  });
});
describe('B-07 exposure-savings', () => {
  const rows = [...baseDays(5), row({ log_date: D(1), slot: 'lunch', menus: ['두부조림'] }), row({ log_date: D(3), slot: 'lunch', menus: ['두부국'] })];
  it('1 타깃 노출 일수+hitToday', () => {
    const e = ev('exposure-savings', rows, [], '두부');
    expect(e.targetExposeDays7d).toBe(2);
    expect(e.hitToday).toBe(D(1));
  });
  it('2 타깃 미지정=no-op', () => {
    expect(ev('exposure-savings', rows).signalToday).toBeNull();
  });
  it('3 자발 섭취 카운트', () => {
    expect(ev('exposure-savings', rows, [], '두부').selfEatCount).toBe(2);
  });
});
describe('B-08 fullness-respect', () => {
  it('1 30분 초과율(표본 4+)', () => {
    const rows = [35, 20, 40, 15].map((m, i) => row({ log_date: D(i + 1), meal_time: m }));
    expect(ev('fullness-respect', rows).over30Pct).toBe(0.5);
  });
  it('2 표본 부족=null', () => {
    expect(ev('fullness-respect', baseDays(4)).over30Pct).toBeNull();
  });
  it('3 완식 강요 메모', () => {
    const e = ev('fullness-respect', [...baseDays(3), row({ note: '다 먹을 때까지 앉혀뒀어요' })]);
    expect(e.forceMemoDays).toBe(1);
  });
});
describe('B-09 parent-model', () => {
  it('1 가족 저녁 일수(집만)', () => {
    const rows = [...baseDays(4), row({ log_date: D(5), slot: 'dinner', place: 'daycare' })];
    expect(ev('parent-model', rows).familyDinnerDays).toBe(4);
  });
  it('2 프로브 답 적립', () => {
    expect(ev('parent-model', baseDays(4), [ans('parent-model', '같이 먹었어요')]).modelYes).toBe(1);
  });
  it('3 어제 가족 저녁=signal 1', () => {
    expect(ev('parent-model', baseDays(4)).signalToday).toBe(1);
  });
});
describe('B-10 no-bargain', () => {
  it('1 거래 메모 감지', () => {
    const e = ev('no-bargain', [...baseDays(3), row({ note: '이거 먹으면 젤리 줄게 했네요' })]);
    expect(e.bargainMemoDays).toBe(1);
  });
  it('2 거래 없으면 0', () => {
    expect(ev('no-bargain', baseDays(4)).bargainMemoDays).toBe(0);
  });
  it('3 중립 프로브 적립', () => {
    expect(ev('no-bargain', baseDays(4), [ans('no-bargain', '거래 없이 차렸어요')]).neutralYes).toBe(1);
  });
});
describe('B-11 table-talk', () => {
  it('1 표본 4 미만=pct null(질문 보충 대상)', () => {
    expect(ev('table-talk', baseDays(4), [ans('table-talk', '맛이 어떤지 물었어요')]).objectTalkPct).toBeNull();
  });
  it('2 표본 4+면 pct 계산', () => {
    const a = [1, 2, 3, 4].map((d) => ans('table-talk', d <= 3 ? '맛이 어떤지 물었어요' : '먹으라고 챙겼어요', d));
    expect(ev('table-talk', baseDays(4), a).objectTalkPct).toBe(0.75);
  });
  it('3 금지어 메모 감지', () => {
    expect(ev('table-talk', [...baseDays(3), row({ note: '안 먹으면 간식 없다고 했어요' })]).banWordDays).toBe(1);
  });
});
describe('B-12 sensory-texture', () => {
  it('1 최빈 질감 서열 인덱스', () => {
    const rows = ['finger', 'finger', 'puree'].map((t, i) => row({ log_date: D(i + 1), texture: t }));
    expect(ev('sensory-texture', rows).texModeIdx).toBe(2);
  });
  it('2 표본 부족=보류', () => {
    expect(ev('sensory-texture', [row({ texture: 'finger' })]).signalToday).toBeNull();
  });
  it('3 어제 핑거푸드+=signal 1', () => {
    const rows = ['finger', 'puree', 'puree'].map((t, i) => row({ log_date: D(i + 1), texture: t }));
    expect(ev('sensory-texture', rows).signalToday).toBe(1);
  });
});
describe('B-13 food-bridge', () => {
  it('1 신규 음식(28일 창 대비·집만)', () => {
    const prior = [row({ log_date: D(10), menus: ['밥', '미역국'] })];
    const cur = [row({ log_date: D(1), menus: ['밥', '단호박찜'] }), row({ log_date: D(2), menus: ['미역국'] }), row({ log_date: D(3), menus: ['밥'] })];
    const e = ev('food-bridge', [...prior, ...cur]);
    expect(e.newFoodCount7d).toBe(1);
    expect(e.signalToday).toBe(1);
  });
  it('2 기관 신규는 제외(M5)', () => {
    const prior = [row({ log_date: D(10), menus: ['밥'] })];
    const cur = [...baseDays(3), row({ log_date: D(1), place: 'daycare', menus: ['새우오징어볶음'] })];
    expect(ev('food-bridge', [...prior, ...cur]).newFoodCount7d).toBe(0);
  });
  it('3 기록 부족=보류', () => {
    expect(ev('food-bridge', baseDays(2)).signalToday).toBeNull();
  });
});
describe('B-14 autonomy-part', () => {
  it('1 selfPct(표본 4+)', () => {
    const rows = ['self', 'fed', 'self', 'self'].map((a, i) => row({ log_date: D(i + 1), autonomy: a }));
    expect(ev('autonomy-part', rows).selfPct7d).toBe(0.75);
  });
  it('2 표본 부족=null', () => {
    expect(ev('autonomy-part', baseDays(4)).selfPct7d).toBeNull();
  });
  it('3 역할 프로브 적립', () => {
    expect(ev('autonomy-part', baseDays(4), [ans('autonomy-part', '역할을 줬어요')]).roleYes).toBe(1);
  });
});
describe('B-15 link-rhythm', () => {
  it('1 기관 거부→집 재노출 매칭(4일 창)', () => {
    const rows = [row({ log_date: D(4), place: 'daycare', slot: 'lunch', refused: '당근' }), row({ log_date: D(1), menus: ['당근볶음'] }), ...baseDays(3).map((r, i) => ({ ...r, log_date: D(i + 2) }))];
    const e = ev('link-rhythm', rows);
    expect(e.dcRefuseHomeRetry7d).toBe(1);
    expect(e.signalToday).toBe(1);
  });
  it('2 기관 거부 없음=no-op', () => {
    expect(ev('link-rhythm', baseDays(4)).signalToday).toBeNull();
  });
  it('3 창 밖 재노출은 미매칭', () => {
    const rows = [row({ log_date: D(7), place: 'daycare', refused: '당근' }), row({ log_date: D(1), menus: ['당근볶음'] })];
    expect(ev('link-rhythm', rows).dcRefuseHomeRetry7d).toBe(0);
  });
});

// ── B-16~B-21 — 진화(사다리·유지 주·재발) ─────────────────────────────────────
const mkProg = (unit: UnitId, over: Partial<ProgressRow> = {}): ProgressRow => ({ ...blankRow('c1', unit), status: 'active', step: 1, started_at: D(20), ...over });
const tableRows = (pct: number) => {   // envTablePct=pct가 되는 10끼 env 기록 + 바닥
  const n = Math.round(pct * 10);
  return [...Array.from({ length: 10 }, (_, i) => row({ log_date: D((i % 6) + 1), slot: i % 2 ? 'dinner' : 'breakfast', environment: i < n ? 'table' : 'screen' }))];
};
describe('B-16/17 병합·사다리', () => {
  it('B-17-1 holdWeeks 미충족(streak<7)이면 미전이', () => {
    const r = mkProg('table-stage', { evidence: { passStreakDays: 5 } });
    const { row: r2, ev: e } = evolveRow({ def: UNITS['table-stage'], row: r, rows: tableRows(0.5), answers: [], today: TODAY, coachedYesterday: false });
    expect(e.stepAdvanced).toBe(false);
    expect(r2.step).toBe(1);
    expect(r2.evidence.passStreakDays).toBe(6);
  });
  it('B-17-2 streak 7일(=1주) 충족 시 step+1·streak 리셋', () => {
    const r = mkProg('table-stage', { evidence: { passStreakDays: 6 } });
    const { row: r2, ev: e } = evolveRow({ def: UNITS['table-stage'], row: r, rows: tableRows(0.5), answers: [], today: TODAY, coachedYesterday: false });
    expect(e.stepAdvanced).toBe(true);
    expect(r2.step).toBe(2);
    expect(r2.evidence.passStreakDays).toBe(0);
  });
  it('B-16-1 판정 보류(null)면 streak 동결', () => {
    const r = mkProg('table-stage', { evidence: { passStreakDays: 4 } });
    const { row: r2 } = evolveRow({ def: UNITS['table-stage'], row: r, rows: baseDays(4), answers: [], today: TODAY, coachedYesterday: false });
    expect(r2.evidence.passStreakDays).toBe(4);
  });
  it('B-16-2 실패(false)면 streak 리셋', () => {
    const r = mkProg('table-stage', { evidence: { passStreakDays: 4 } });
    const { row: r2 } = evolveRow({ def: UNITS['table-stage'], row: r, rows: tableRows(0.2), answers: [], today: TODAY, coachedYesterday: false });
    expect(r2.evidence.passStreakDays).toBe(0);
  });
  it('B-16-3 노출 hitDays 평생 적립(중복 없이)', () => {
    const r = mkProg('exposure-savings', { evidence: { hitDays: [D(3)] } });
    const rows = [...baseDays(5), row({ log_date: D(1), menus: ['두부조림'] })];
    const { row: r2 } = evolveRow({ def: UNITS['exposure-savings'], row: r, rows, answers: [], today: TODAY, coachedYesterday: false, foodTarget: '두부' });
    expect(r2.evidence.hitDays).toEqual([D(3), D(1)].sort());
  });
});
describe('B-20 유지 주(졸업) · B-21 재발', () => {
  it('B-20-1 최종 단 충족 streak 도달→maintenance 진입', () => {
    const r = mkProg('table-stage', { step: 2, evidence: { passStreakDays: 13 } });
    const { row: r2, ev: e } = evolveRow({ def: UNITS['table-stage'], row: r, rows: tableRows(0.7), answers: [], today: TODAY, coachedYesterday: false });
    expect(e.enteredMaintenance).toBe(true);
    expect(r2.status).toBe('maintenance');
  });
  it('B-20-2 유지 주에 코칭 있으면 졸업 안 됨(maintCoached>0)', () => {
    const r = mkProg('table-stage', { step: 2, status: 'maintenance', evidence: { maintStartedAt: D(8), maintCoached: 1 } });
    const { ev: e } = evolveRow({ def: UNITS['table-stage'], row: r, rows: tableRows(0.7), answers: [], today: TODAY, coachedYesterday: false });
    expect(e.graduated).toBe(false);
  });
  it('B-20-3 유지 주 무코칭+신호 유지→mastered', () => {
    const r = mkProg('table-stage', { step: 2, status: 'maintenance', evidence: { maintStartedAt: D(8), maintCoached: 0 } });
    const { row: r2, ev: e } = evolveRow({ def: UNITS['table-stage'], row: r, rows: tableRows(0.7), answers: [], today: TODAY, coachedYesterday: false });
    expect(e.graduated).toBe(true);
    expect(r2.status).toBe('mastered');
    expect(r2.mastered_at).toBe(TODAY);
  });
  it('B-20-4 유지 주 신호 붕괴→active 복귀(재코칭)', () => {
    const r = mkProg('table-stage', { step: 2, status: 'maintenance', evidence: { maintStartedAt: D(3) } });
    const { row: r2, ev: e } = evolveRow({ def: UNITS['table-stage'], row: r, rows: tableRows(0.2), answers: [], today: TODAY, coachedYesterday: false });
    expect(e.backFromMaintenance).toBe(true);
    expect(r2.status).toBe('active');
  });
  it('B-21-1 재발 streak 미달이면 mastered 유지', () => {
    const r = mkProg('table-stage', { step: 2, status: 'mastered', evidence: { relapseStreakDays: 5 } });
    const { row: r2 } = evolveRow({ def: UNITS['table-stage'], row: r, rows: tableRows(0.2), answers: [], today: TODAY, coachedYesterday: false });
    expect(r2.status).toBe('mastered');
    expect(r2.evidence.relapseStreakDays).toBe(6);
  });
  it('B-21-2 2주 연속 붕괴→relapsed·직전 단 재개·카운트+1', () => {
    const r = mkProg('table-stage', { step: 2, status: 'mastered', evidence: { relapseStreakDays: TH.relapseWindowDays - 1 } });
    const { row: r2, ev: e } = evolveRow({ def: UNITS['table-stage'], row: r, rows: tableRows(0.2), answers: [], today: TODAY, coachedYesterday: false });
    expect(e.relapsed).toBe(true);
    expect(r2.status).toBe('relapsed');
    expect(r2.step).toBe(1);
    expect(r2.relapse_count).toBe(1);
  });
  it('B-21-3 신호 회복이면 재발 streak 리셋', () => {
    const r = mkProg('table-stage', { step: 2, status: 'mastered', evidence: { relapseStreakDays: 10 } });
    const { row: r2 } = evolveRow({ def: UNITS['table-stage'], row: r, rows: tableRows(0.7), answers: [], today: TODAY, coachedYesterday: false });
    expect(r2.evidence.relapseStreakDays).toBe(0);
  });
});

// ── B-18/19/22 + A-05/E-01 + B-24 ────────────────────────────────────────────
describe('B-18/19 진전·정체', () => {
  it('B-18-1 신호 5일 내=진전', () => {
    expect(isProgressing(mkProg('table-stage', { last_signal_at: D(5) }), TODAY)).toBe(true);
  });
  it('B-18-2 신호 7일 전=비진전', () => {
    expect(isProgressing(mkProg('table-stage', { last_signal_at: D(7) }), TODAY)).toBe(false);
  });
  it('B-19-1 무신호+코칭 3일=정체', () => {
    expect(isStalled(mkProg('table-stage', { last_signal_at: D(8) }), TODAY, 3)).toBe(true);
  });
  it('B-19-2 무신호+코칭 0일=비정체(안 가르쳤음)', () => {
    expect(isStalled(mkProg('table-stage', { last_signal_at: D(8) }), TODAY, 0)).toBe(false);
  });
});
describe('B-22 피벗 · E-01 정규화 · A-05 병행기 · B-24 인터럽트 캡', () => {
  const goals = normalizeGoals([
    { unit_id: 'table-stage', priority: 1 }, { unit_id: 'hunger-rhythm', priority: 2 }, { unit_id: 'exposure-savings', priority: 3 },
  ]);
  it('E-01-1 focus 정확히 1개·우선순위 재부여', () => {
    expect(goals.filter((g) => g.status === 'focus').length).toBe(1);
    expect(goals.map((g) => g.priority)).toEqual([1, 2, 3]);
  });
  it('E-01-2 미지 unit 제거·중복 제거·3개 캡', () => {
    const g = normalizeGoals([{ unit_id: 'x' }, { unit_id: 'table-stage' }, { unit_id: 'table-stage' }, { unit_id: 'hunger-rhythm' }, { unit_id: 'no-bargain' }, { unit_id: 'table-talk' }]);
    expect(g.length).toBe(3);
    expect(new Set(g.map((x) => x.unit_id)).size).toBe(3);
  });
  it('B-22-1 standby 우선순위순 피벗·mastered 스킵', () => {
    const prog: Partial<Record<UnitId, ProgressRow>> = { 'hunger-rhythm': mkProg('hunger-rhythm', { status: 'mastered' }) };
    expect(pickPivot(goals, prog)).toBe('exposure-savings');
  });
  it('B-22-2 후보 없으면 null', () => {
    expect(pickPivot(normalizeGoals([{ unit_id: 'table-stage' }]), {})).toBeNull();
  });
  it('A-05-1 goals 없으면 lever 승격', () => {
    expect(goalsOf({ budget: { lever: 'environment' } })).toEqual([{ unit_id: 'table-stage', priority: 1, status: 'focus' }]);
  });
  it('A-05-2 goals 있으면 정규화 우선', () => {
    expect(goalsOf({ goals: [{ unit_id: 'no-bargain', priority: 1 }], budget: { lever: 'environment' } })[0].unit_id).toBe('no-bargain');
  });
  it('A-05-3 둘 다 없으면 빈 배열(관찰 주)', () => {
    expect(goalsOf({ budget: { lever: undefined } })).toEqual([]);
  });
  it('B-24-1 같은 인터럽트 2일 연속이면 3일째 억제', () => {
    expect(shouldSuppressInterrupt('progress-celebrate', ['progress-celebrate', 'progress-celebrate', 'x'])).toBe(true);
  });
  it('B-24-2 1일만 연속이면 허용', () => {
    expect(shouldSuppressInterrupt('progress-celebrate', ['progress-celebrate', 'x'])).toBe(false);
  });
  it('B-24-3 적신호는 절대 억제 안 함', () => {
    expect(shouldSuppressInterrupt('neophobia-arfid-watch', ['neophobia-arfid-watch', 'neophobia-arfid-watch'])).toBe(false);
  });
});

// ── B-23 통합 상태기계 ─────────────────────────────────────────────────────────
describe('B-23 advanceProgress', () => {
  const goals = normalizeGoals([{ unit_id: 'table-stage', priority: 1 }, { unit_id: 'hunger-rhythm', priority: 2 }]);
  const base = { childId: 'c1', goals, answers: [] as ProbeAnswer[], coachedDays: {} as Partial<Record<UnitId, number>>, coachedYesterday: [] as UnitId[], pivotsThisWeek: 0, today: TODAY };
  it('B-23-1 첫날: focus 자동 활성화(step 1·started_at)', () => {
    const { updates, decision } = advanceProgress({ ...base, progress: {}, rows: tableRows(0.5) });
    const f = updates.find((u) => u.unit_id === 'table-stage')!;
    expect(f.status).not.toBe('not_started');
    expect(f.step).toBe(1);
    expect(decision?.unit).toBe('table-stage');
  });
  it('B-23-2 신호 관측 중=deepen', () => {
    const prog = { 'table-stage': mkProg('table-stage', { last_signal_at: D(2) }) };
    const { decision } = advanceProgress({ ...base, progress: prog, rows: tableRows(0.5) });
    expect(decision?.mode).toBe('deepen');
  });
  it('B-23-3 단 전진의 날=advance', () => {
    const prog = { 'table-stage': mkProg('table-stage', { evidence: { passStreakDays: 6 } }) };
    const { decision } = advanceProgress({ ...base, progress: prog, rows: tableRows(0.5) });
    expect(decision?.mode).toBe('advance');
    expect(decision?.step).toBe(2);
  });
  it('B-23-4 정체+캡 여유=pivot(standby 활성화·focus는 pivoted)', () => {
    const prog = { 'table-stage': mkProg('table-stage', { last_signal_at: D(10) }) };
    const { updates, decision } = advanceProgress({ ...base, progress: prog, rows: baseDays(5), coachedDays: { 'table-stage': 4 } });
    expect(decision?.mode).toBe('pivot');
    expect(decision?.pivotTo).toBe('hunger-rhythm');
    expect(updates.find((u) => u.unit_id === 'table-stage')!.status).toBe('pivoted');
    expect(updates.find((u) => u.unit_id === 'hunger-rhythm')!.status).toBe('active');
  });
  it('B-23-5 정체+피벗 캡 소진=observe(주당 1회 — 휙휙 방지)', () => {
    const prog = { 'table-stage': mkProg('table-stage', { last_signal_at: D(10) }) };
    const { decision } = advanceProgress({ ...base, progress: prog, rows: baseDays(5), coachedDays: { 'table-stage': 4 }, pivotsThisWeek: 1 });
    expect(decision?.mode).toBe('observe');
  });
  it('B-23-6 maintenance=maintain(편지에서 침묵 대상)', () => {
    const prog = { 'table-stage': mkProg('table-stage', { step: 2, status: 'maintenance', evidence: { maintStartedAt: D(2), maintCoached: 0 } }) };
    const { decision } = advanceProgress({ ...base, progress: prog, rows: tableRows(0.7) });
    expect(decision?.mode).toBe('maintain');
  });
  it('B-23-7 졸업의 날=celebrate', () => {
    const prog = { 'table-stage': mkProg('table-stage', { step: 2, status: 'maintenance', evidence: { maintStartedAt: D(8), maintCoached: 0 } }) };
    const { decision } = advanceProgress({ ...base, progress: prog, rows: tableRows(0.7) });
    expect(decision?.mode).toBe('celebrate');
  });
  it('B-23-8 goal 밖 mastered 유닛도 재발 스캔(무너지면 재감지)', () => {
    const prog = { 'no-bargain': mkProg('no-bargain', { status: 'mastered', evidence: { relapseStreakDays: TH.relapseWindowDays - 1 } }) };
    const rows = [...baseDays(4), row({ note: '먹으면 줄게 했어요' }), row({ log_date: D(2), note: '먹으면 사줄게' })];
    const { updates } = advanceProgress({ ...base, progress: prog, rows });
    expect(updates.find((u) => u.unit_id === 'no-bargain')!.status).toBe('relapsed');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EPIC E — 주간 목표 포트폴리오 (E-03~E-09)
// ════════════════════════════════════════════════════════════════════════════
import { candidateUnits, goalsCapForWeek, applyFocusFatigue, leverForUnit, healAnchor as healAnchorW, type WeeklyAnchor } from '../lib/coachWeekly';
import { parseProbeAnswers } from '../lib/coachDaily';
import type { CandidateSignals, Goal } from '../lib/curriculumUnits';

const SIG0: CandidateSignals = {
  envBadPct: null, envCount: 0, selfPct: null, autoCount: 0, texLow: false, texCount: 0,
  mtOver30Pct: null, mtCount: 0, missingCount: 0, refusedCount: 0, dcRefusedCount: 0,
  pressureMemoDays: 0, bargainMemoDays: 0, snackHeavyDays: 0, preMealMemoDays: 0,
  newFoodCount: 1, attendsDaycare: false, eatenCount: 30,
};

describe('E-03 candidateUnits 후보 산출', () => {
  it('E-03-0 환경 신호 → table-stage 1순위(레지스트리 trigger)', () => {
    const c = candidateUnits({ sig: { ...SIG0, envBadPct: 0.9, envCount: 6 }, progress: {}, week: 9 });
    expect(c[0].unit_id).toBe('table-stage');
  });
  it('E-03-1 재발 유닛 +3 가산(최우선)', () => {
    const c = candidateUnits({
      sig: { ...SIG0, envBadPct: 0.9, envCount: 6 },
      progress: { 'no-bargain': mkProg('no-bargain', { status: 'relapsed' }) }, week: 9,
    });
    expect(c[0].unit_id).toBe('no-bargain');
  });
  it('E-03-2 mastered·maintenance 제외', () => {
    const c = candidateUnits({
      sig: { ...SIG0, envBadPct: 0.9, envCount: 6 },
      progress: { 'table-stage': mkProg('table-stage', { status: 'mastered' }) }, week: 9,
    });
    expect(c.some((x) => x.unit_id === 'table-stage')).toBe(false);
  });
  it('E-03-3 신호 0 → 기초 순서 첫 미이수 폴백("처방 없는 주엔 수업")', () => {
    const c = candidateUnits({ sig: SIG0, progress: {}, week: 9 });
    expect(c.length).toBe(1);
    expect(c[0].unit_id).toBe('pressure-off');
    const c2 = candidateUnits({ sig: SIG0, progress: { 'pressure-off': mkProg('pressure-off', { status: 'mastered' }) }, week: 9 });
    expect(c2[0].unit_id).toBe('hunger-rhythm');
  });
  it('E-05-2 온보딩 게이트: 1주차엔 minWeek 2+ 유닛 제외', () => {
    const c = candidateUnits({ sig: { ...SIG0, missingCount: 2, refusedCount: 1 }, progress: {}, week: 1 });
    expect(c.some((x) => x.unit_id === 'exposure-savings')).toBe(false);   // minWeek 2
    const c3 = candidateUnits({ sig: { ...SIG0, missingCount: 2 }, progress: {}, week: 3 });
    expect(c3.some((x) => x.unit_id === 'exposure-savings')).toBe(true);
  });
});

describe('E-05·E-06 — 주차 캡·주제 피로', () => {
  const G = (focus: UnitId, standby: UnitId): Goal[] => [
    { unit_id: focus, priority: 1, status: 'focus' }, { unit_id: standby, priority: 2, status: 'standby' },
  ];
  it('E-05-1 goalsCapForWeek: 1주=1 · 2주=2 · 3주+=3', () => {
    expect(goalsCapForWeek(1)).toBe(1);
    expect(goalsCapForWeek(2)).toBe(2);
    expect(goalsCapForWeek(5)).toBe(3);
  });
  it('E-06-1 같은 focus 2주 연속 전진 0 → 3주째 강등·차순위 승격', () => {
    const out = applyFocusFatigue(G('table-stage', 'hunger-rhythm'), [
      { unit_id: 'table-stage', stepAdvanced: false }, { unit_id: 'table-stage', stepAdvanced: false },
    ]);
    expect(out.find((g) => g.status === 'focus')!.unit_id).toBe('hunger-rhythm');
    expect(out.find((g) => g.unit_id === 'table-stage')!.status).toBe('standby');
  });
  it('E-06-2 전진 있었으면 3주째 유지 허용(딥다이브)', () => {
    const out = applyFocusFatigue(G('table-stage', 'hunger-rhythm'), [
      { unit_id: 'table-stage', stepAdvanced: true }, { unit_id: 'table-stage', stepAdvanced: false },
    ]);
    expect(out.find((g) => g.status === 'focus')!.unit_id).toBe('table-stage');
  });
});

describe('E-09·A-05 — 닻 치유·레버 병행', () => {
  const anchor = (over: Partial<WeeklyAnchor>): WeeklyAnchor => ({
    child_id: 'c1', week_key: 'w', status: 'active', source: 's', mission: null, mission_target: '콩류',
    target_pool: null, secondary_axis: null,
    budget: { expose: 2, push: 0, cadenceMinGap: 1, pushWindow: [], lever: 'environment' },
    ledger: null, impression: null, arc_week: 1, basis_hash: null, basis_attends_daycare: null,
    behavior_goal: '하루 한 끼 화면 끄기', teaching_arc: null, check_method: null, ...over,
  });
  it('E-09-1 구닻(goals 없음) → lever에서 goals 승격', () => {
    const healed = healAnchorW(anchor({}));
    expect(healed.goals?.[0]).toMatchObject({ unit_id: 'table-stage', status: 'focus' });
  });
  it('E-09-2 goals 있으면 그대로', () => {
    const healed = healAnchorW(anchor({ goals: [{ unit_id: 'hunger-rhythm', priority: 1, status: 'focus' }] }));
    expect(healed.goals?.[0].unit_id).toBe('hunger-rhythm');
  });
  it('A-05 leverForUnit: mixed→environment·food 유닛→food', () => {
    expect(leverForUnit('pressure-off')).toBe('environment');
    expect(leverForUnit('exposure-savings')).toBe('food');
    expect(leverForUnit('autonomy-part')).toBe('autonomy');
  });
});

describe('G-04 답변→evidence 파서', () => {
  const ctxOf = (probeId: string, signal = 'envTablePct7d') => ({ unitProbe: { unit_id: 'table-stage', signal, step: 1, probeId } });
  it('G-04-1 칩 정확 일치 → ProbeAnswer', () => {
    const out = parseProbeAnswers([{ q_date: D(1), answer: '식탁에서 화면 없이', context: ctxOf('ts-env') }]);
    expect(out).toEqual([{ q_date: D(1), unit_id: 'table-stage', signal: 'envTablePct7d', value: '식탁에서 화면 없이' }]);
  });
  it("G-04-2 '잘 모르겠어요'·자유텍스트 미적립(무지 존중·보수적)", () => {
    expect(parseProbeAnswers([
      { q_date: D(1), answer: '잘 모르겠어요', context: ctxOf('ts-env') },
      { q_date: D(1), answer: '식탁 근처에서 대충요', context: ctxOf('ts-env') },
    ])).toEqual([]);
  });
  it('G-04-3 unitProbe 없는 답(ICFQ·일반질문) 무시', () => {
    expect(parseProbeAnswers([{ q_date: D(1), answer: '네', context: { icfq: 'x' } }])).toEqual([]);
  });
  it('B-04 회귀 — pressure-off 부정태그는 칩 원문으로 계산(매핑 키 비교 잠복버그 박제)', () => {
    const answers = [ans('pressure-off', '먹이느라 실랑이했어요'), ans('pressure-off', '편안했어요', 2), ans('pressure-off', '속상해서 한마디 했어요', 3), ans('pressure-off', '편안했어요', 4)];
    const e = ev('pressure-off', baseDays(4), answers);
    expect(e.negTagPct7d).toBe(0.5);
    const old = ev('pressure-off', baseDays(4), [ans('pressure-off', '압박'), ans('pressure-off', '압박', 2)]);
    expect(old.negTagPct7d).toBe(0);   // 매핑 키('압박')는 칩이 아니므로 0 — 구버전 비교식이었다면 1이 됐을 입력
  });
});

describe('E-10 — 주간 통주', () => {
  it('E-10 4주 리플레이: 2주 정체 → 3주째 강등 → 4주째 재도전 허용(직전 2주 연속이 아니므로 — E-06 스펙)', () => {
    const sig = { ...SIG0, envBadPct: 0.8, envCount: 6, snackHeavyDays: 3 };    // table-stage(2.8) > hunger-rhythm(2)
    const history: Array<{ unit_id: UnitId | null; stepAdvanced: boolean }> = [];
    const focusByWeek: UnitId[] = [];
    for (let w = 1; w <= 4; w++) {
      const cands = candidateUnits({ sig, progress: {}, week: 9 });
      let goals = normalizeGoals(cands.map((c, i) => ({ unit_id: c.unit_id, priority: (i + 1) as 1 | 2 | 3, status: i === 0 ? 'focus' : 'standby' })));
      goals = applyFocusFatigue(goals, history);
      const focus = goals.find((g) => g.status === 'focus')!.unit_id;
      focusByWeek.push(focus);
      history.unshift({ unit_id: focus, stepAdvanced: false });                 // 매주 전진 0(최악 시나리오)
    }
    // 강등은 '3주 연속 선발'에만 — 한 주 쉰 뒤 재도전은 허용(다주 아크와의 균형점). 진동 주기=3주(2집중+1환기).
    expect(focusByWeek).toEqual(['table-stage', 'table-stage', 'hunger-rhythm', 'table-stage']);
  });
});
