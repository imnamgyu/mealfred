/**
 * tests/coach-guide.test.ts — v3 두뇌 가이드 합성 (WBS v2-하이브리드 EPIC B · B-01~B-11)
 * 규칙: 엣지케이스 발견 시 여기에 케이스 추가(복리·prebuild 게이트). 아린 6통 수렴/환각/모호어 회귀 박제.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTeachingGuide, arcStageFor, softenImpression, doNotRestateFrom,
  assertNoZeroFreqStaple, nextProgressState, GUIDE_PERSISTENCE_NOTE,
  type TeachingGuide,
} from '../lib/coachGuide';
import { UNITS, UNIT_IDS, TH, type UnitId, type ProgressRow, type Evidence, type Goal } from '../lib/curriculumUnits';
import { type DailyDecision } from '../lib/curriculum';
import { type WeeklyAnchor, type WeeklyArcStage } from '../lib/coachWeekly';
import { type DailyV3Result } from '../lib/coachDaily';

const CID = 'arin';
type Mode = DailyDecision['mode'];

// ── 픽스처 헬퍼 ───────────────────────────────────────────────────────────────────
const prow = (unit: UnitId, over: Partial<ProgressRow> = {}): ProgressRow => ({
  child_id: CID, unit_id: unit, status: 'active', step: 1, evidence: {}, started_at: '2026-06-01',
  mastered_at: null, last_signal_at: null, stop_reason: null, relapse_count: 0, ...over,
});
const decision = (unit: UnitId, step: number, mode: Mode, pivotTo: UnitId | null = null): DailyDecision => ({ unit, step, mode, pivotTo });
/** evidence를 가진 focus 행을 updates에 실어 DailyV3Result 조립. */
const daily = (over: Partial<DailyV3Result> & { evidence?: Evidence } = {}): DailyV3Result => {
  const d = over.decision !== undefined ? over.decision : decision('table-stage', 1, 'advance');
  const ev = over.evidence || {};
  const updates = over.updates || (d ? [prow(d.unit, { step: d.step, evidence: ev })] : []);
  return {
    decision: d, updates, goalsAfter: over.goalsAfter || [], lowData: over.lowData ?? false,
    plateau: over.plateau ?? false, replanFlag: over.replanFlag ?? false, warnings: over.warnings || [],
  };
};
const anchor = (over: Partial<WeeklyAnchor> = {}): WeeklyAnchor => ({
  child_id: CID, week_key: '2026-W24', status: 'active', source: 'weekly_llm',
  mission: null, mission_target: null, target_pool: null, secondary_axis: null,
  budget: null, ledger: null, impression: null, arc_week: 1, basis_hash: null, basis_attends_daycare: true,
  behavior_goal: null, teaching_arc: null, check_method: null, goals: null, ...over,
});
const build = (over: Parameters<typeof buildTeachingGuide>[0] | Partial<Parameters<typeof buildTeachingGuide>[0]> = {}): TeachingGuide =>
  buildTeachingGuide({
    dailyResult: daily(), anchor: anchor(), firstOfWeek: false, lastArcStage: null,
    progress: false, recentCtxs: [], dow: 3, ...over,
  } as Parameters<typeof buildTeachingGuide>[0]);

// ── B-01 — 타입·계약 ──────────────────────────────────────────────────────────────
describe('B-01 TeachingGuide 계약', () => {
  it('B-01-1 9키 완결성', () => {
    const g = build();
    for (const k of ['unit_ko', 'lever', 'stepBehavior', 'why', 'arcStage', 'weeklyImpressionSoft', 'doNotRestate', 'stepN', 'mode']) {
      expect(g).toHaveProperty(k);
    }
  });
  it('B-01-2 lever ∈ UnitDef.lever 유니온', () => {
    const g = build({ dailyResult: daily({ decision: decision('autonomy-part', 1, 'advance') }) });
    expect(['food', 'environment', 'autonomy', 'texture', 'mixed']).toContain(g.lever);
  });
  it('B-01-3 doNotRestate는 항상 배열', () => {
    expect(Array.isArray(build().doNotRestate)).toBe(true);
    expect(Array.isArray(build({ dailyResult: daily({ lowData: true }) }).doNotRestate)).toBe(true);
  });
  it('B-01-4 coachGuide.ts는 Letter A 경로(coach.ts)를 import하지 않음', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../lib/coachGuide.ts', import.meta.url), 'utf8');
    expect(src.includes("from './coach'")).toBe(false);
  });
});

// ── B-02 — decision → unit_ko·lever·stepBehavior·stepN ───────────────────────────
describe('B-02 unit/step/lever 매핑', () => {
  it('B-02-1 table-stage step1', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, 'advance') }) });
    expect(g.unit_ko).toBe('식탁 무대');
    expect(g.lever).toBe('environment');
    expect(g.stepBehavior).toBe('하루 한 끼 화면 끄고 식탁에서');
    expect(g.stepN).toBe(1);
  });
  it('B-02-2 table-stage step2', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 2, 'advance') }) });
    expect(g.stepBehavior).toBe('주 5끼+ 같은 자리·같은 시간');
    expect(g.stepN).toBe(2);
  });
  it('B-02-3 exposure-savings food 레버', () => {
    const g = build({ dailyResult: daily({ decision: decision('exposure-savings', 1, 'advance') }) });
    expect(g.lever).toBe('food');
    expect(g.unit_ko).toBe('새 음식 조금씩 노출');
  });
  it('B-02-4 pressure-off mixed 레버', () => {
    const g = build({ dailyResult: daily({ decision: decision('pressure-off', 1, 'advance') }) });
    expect(g.lever).toBe('mixed');
    expect(g.unit_ko).toBe('압박 내려놓기');
  });
  it('B-02-5 step=0 클램프 → stepN=1', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 0, 'advance') }) });
    expect(g.stepN).toBe(1);
    expect(g.stepBehavior).toBe(UNITS['table-stage'].steps[0].behavior);
  });
  it('B-02-6 step 초과 클램프 → stepN=len', () => {
    const g = build({ dailyResult: daily({ decision: decision('sensory-texture', 99, 'advance') }) });
    expect(g.stepN).toBe(UNITS['sensory-texture'].steps.length);
    expect(g.stepBehavior).toBe(UNITS['sensory-texture'].steps[1].behavior);
  });
  it('B-02-7 pivot 결정이 pivotTo 유닛으로 매핑', () => {
    const g = build({ dailyResult: daily({ decision: decision('autonomy-part', 1, 'pivot', 'autonomy-part') }) });
    expect(g.unit_ko).toBe('자율성·참여 트랙');
  });
  it('B-02-8 12유닛×2단계 stepBehavior non-empty', () => {
    for (const u of UNIT_IDS) for (const step of [1, 2]) {
      const g = build({ dailyResult: daily({ decision: decision(u, step, 'advance'), evidence: {} }) });
      expect(g.stepBehavior.length).toBeGreaterThan(0);
    }
  });
  it('B-02-9 mode 가공 없이 통과', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 2, 'celebrate'), evidence: { envTablePct7d: 0.7 } }) });
    expect(g.mode).toBe('celebrate');
  });
  it('B-02-10 link-rhythm step2', () => {
    const g = build({ dailyResult: daily({ decision: decision('link-rhythm', 2, 'advance') }) });
    expect(g.stepBehavior).toBe('격일 리듬으로 재노출 이어가기(주 2회)');
    expect(g.lever).toBe('food');
  });
  it('B-02-11 food-bridge/no-bargain/table-talk label 정확', () => {
    expect(build({ dailyResult: daily({ decision: decision('food-bridge', 1, 'advance') }) }).unit_ko).toBe('확장 트랙(음식 다리)');
    expect(build({ dailyResult: daily({ decision: decision('no-bargain', 1, 'advance') }) }).unit_ko).toBe('달콤한 협상 끊기');
    expect(build({ dailyResult: daily({ decision: decision('table-talk', 1, 'advance') }) }).unit_ko).toBe('식탁의 말');
  });
});

// ── B-03 — mode → arcStage ───────────────────────────────────────────────────────
describe('B-03 arcStageFor 매핑', () => {
  const base = { firstOfWeek: false, lastArcStage: null as string | null, progress: false, dow: 3 };
  it('B-03-1 celebrate→reinforce (firstOfWeek 무관)', () => {
    expect(arcStageFor({ ...base, mode: 'celebrate', firstOfWeek: true })).toBe('reinforce');
    expect(arcStageFor({ ...base, mode: 'celebrate', firstOfWeek: false })).toBe('reinforce');
  });
  it('B-03-2 주첫+advance→intro', () => {
    expect(arcStageFor({ ...base, mode: 'advance', firstOfWeek: true })).toBe('intro');
  });
  it('B-03-3 주첫+pivot→intro', () => {
    expect(arcStageFor({ ...base, mode: 'pivot', firstOfWeek: true })).toBe('intro');
  });
  it('B-03-4 maintain→observe', () => {
    expect(arcStageFor({ ...base, mode: 'maintain' })).toBe('observe');
  });
  it('B-03-5 progress+직전 비reinforce→reinforce', () => {
    expect(arcStageFor({ ...base, mode: 'deepen', progress: true, lastArcStage: 'how' })).toBe('reinforce');
  });
  it('B-03-6 reinforce 2연속 차단', () => {
    const s = arcStageFor({ ...base, mode: 'deepen', progress: true, lastArcStage: 'reinforce' });
    expect(['how', 'obstacle', 'observe']).toContain(s);
    expect(s).not.toBe('reinforce');
  });
  it('B-03-7 deepen은 주중에 intro 금지', () => {
    const s = arcStageFor({ ...base, mode: 'deepen', firstOfWeek: false });
    expect(['how', 'obstacle', 'observe']).toContain(s);
    expect(s).not.toBe('intro');
  });
  it('B-03-8 요일 회전 결정론(같은 입력=같은 출력)', () => {
    const a = arcStageFor({ ...base, mode: 'deepen', dow: 2 });
    const b = arcStageFor({ ...base, mode: 'deepen', dow: 2 });
    expect(a).toBe(b);
  });
  it('B-03-9 요일 회전 분산(dow 다르면 최소 2종 stage)', () => {
    const stages = [1, 2, 3].map((dow) => arcStageFor({ ...base, mode: 'deepen', dow }));
    expect(new Set(stages).size).toBeGreaterThanOrEqual(2);
  });
  it('B-03-10 주중엔 intro 절대 없음', () => {
    for (const mode of ['advance', 'deepen', 'pivot', 'maintain', 'observe'] as Mode[]) {
      expect(arcStageFor({ ...base, mode, firstOfWeek: false })).not.toBe('intro');
    }
  });
  it('B-03-11 observe mode + 주중 → ROT', () => {
    expect(['how', 'obstacle', 'observe']).toContain(arcStageFor({ ...base, mode: 'observe' }));
  });
});

// ── B-04 — why 수치 근거 ──────────────────────────────────────────────────────────
describe('B-04 why 수치 근거', () => {
  const NUM_RE = /[0-9]/;
  const VAGUE_RE = /요즘|최근|이번주/;
  it('B-04-1 table-stage why에 수치·임계 포함', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, 'advance'), evidence: { envTablePct7d: 0.45 } }) });
    expect(g.why).toContain('45');
    expect(g.why).toContain('40');
    expect(VAGUE_RE.test(g.why)).toBe(false);
  });
  it('B-04-2 exposure-savings why에 노출일·주목표', () => {
    const g = build({ dailyResult: daily({ decision: decision('exposure-savings', 1, 'deepen'), evidence: { targetExposeDays7d: 1 } }) });
    expect(g.why).toContain('1');
    expect(g.why).toContain(String(TH.exposeWeekly));
  });
  it('B-04-3 evidence 없음 → 표본부족 degrade(가짜 % 0)', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, 'deepen'), evidence: {} }) });
    expect(/[0-9]+%/.test(g.why)).toBe(false);
    expect(/표본|관찰/.test(g.why)).toBe(true);
  });
  it('B-04-4 모호 기간어 금지(여러 입력)', () => {
    for (const u of UNIT_IDS) for (const mode of ['advance', 'deepen', 'maintain', 'pivot', 'celebrate', 'observe'] as Mode[]) {
      const g = build({ dailyResult: daily({ decision: decision(u, 1, mode), evidence: {} }) });
      expect(VAGUE_RE.test(g.why)).toBe(false);
    }
  });
  it('B-04-5 maintain 각도 — 정체/태도, 행동 권유 어휘 없음', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, 'maintain'), evidence: { envTablePct7d: 0.3 } }) });
    expect(/정체|태도/.test(g.why)).toBe(true);
    expect(/해보|시도하|올려|밀어/.test(g.why)).toBe(false);
  });
  it('B-04-6 pivot 각도 — 전환/바꿔', () => {
    const g = build({ dailyResult: daily({ decision: decision('autonomy-part', 1, 'pivot', 'autonomy-part'), evidence: {} }) });
    expect(/전환|바꿔|바꾸/.test(g.why)).toBe(true);
  });
  it('B-04-7 임계는 TH에서 읽음(envTableStep1 반영)', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, 'advance'), evidence: { envTablePct7d: 0.45 } }) });
    expect(g.why).toContain(String(Math.round(TH.envTableStep1 * 100)));   // 40 — 매직넘버 아님
  });
  it('B-04-8 celebrate why=유지/통과', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 2, 'celebrate'), evidence: { envTablePct7d: 0.7 } }) });
    expect(/유지|통과/.test(g.why)).toBe(true);
  });
  it('B-04-9 why 길이 상한(≤120)', () => {
    for (const u of UNIT_IDS) {
      const g = build({ dailyResult: daily({ decision: decision(u, 1, 'advance'), evidence: { envTablePct7d: 0.45, targetExposeDays7d: 1, selfPct7d: 0.2 } }) });
      expect(g.why.length).toBeLessThanOrEqual(120);
    }
  });
  it('B-04-10 deepen why=신호 있으나 정체/이어', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, 'deepen'), evidence: { envTablePct7d: 0.42 } }) });
    expect(/신호/.test(g.why)).toBe(true);
    expect(/정체|이어/.test(g.why)).toBe(true);
  });
});

// ── B-05 — weeklyImpressionSoft ───────────────────────────────────────────────────
describe('B-05 softenImpression', () => {
  it('B-05-1 정상 impression 보존', () => {
    expect(softenImpression('지난주 환경이 나아졌어요.')).toContain('환경');
  });
  it('B-05-2 진단어 문장 드롭', () => {
    const s = softenImpression('ARFID 의심됩니다. 환경부터 보려 해요.');
    expect(s).not.toContain('ARFID');
    expect(s).toContain('환경');
  });
  it("B-05-3 내부용어 '미션/진도' 드롭", () => {
    const s = softenImpression('이번 주 미션은 진도 2단계. 식탁 분위기는 편안했어요.');
    expect(s == null || (!s.includes('미션') && !s.includes('진도'))).toBe(true);
  });
  it('B-05-4 null impression → null', () => {
    expect(softenImpression(null)).toBeNull();
    expect(softenImpression('')).toBeNull();
  });
  it('B-05-5 길이 상한 200', () => {
    const long = '환경이 좋아졌어요. '.repeat(40);
    expect((softenImpression(long) || '').length).toBeLessThanOrEqual(200);
  });
  it('B-05-6 anchor=null 방어(buildTeachingGuide)', () => {
    const g = build({ anchor: null });
    expect(g.weeklyImpressionSoft).toBeNull();
  });
});

// ── B-06 — doNotRestate ───────────────────────────────────────────────────────────
describe('B-06 doNotRestateFrom', () => {
  it('B-06-1 이미 intro한 focus 유닛 → 재도입 금지', () => {
    const out = doNotRestateFrom([{ blocks: ['table-stage.intro.1'] }], 'table-stage', '식탁 무대');
    expect(out.some((s) => s.includes('식탁 무대'))).toBe(true);
  });
  it('B-06-2 intro 안 한 유닛 → 금지 없음', () => {
    const out = doNotRestateFrom([{ blocks: ['hunger-rhythm.intro.1'] }], 'table-stage', '식탁 무대');
    expect(out.some((s) => s.includes('식탁 무대'))).toBe(false);
  });
  it('B-06-3 빈 ctxs → []', () => {
    expect(doNotRestateFrom([], 'table-stage', '식탁 무대')).toEqual([]);
  });
  it('B-06-4 recentIntroUnitsOf 재사용(common 제외)', () => {
    const out = doNotRestateFrom([{ blocks: ['common.intro.1'] }], 'table-stage', '식탁 무대');
    expect(out.some((s) => s.includes('common'))).toBe(false);
  });
  it('B-06-5 null/undefined ctx 항목 방어', () => {
    expect(doNotRestateFrom([null, undefined, {}], 'table-stage', '식탁 무대')).toEqual([]);
  });
  it('B-06-7 거울 사실 재인용 금지 수집', () => {
    const out = doNotRestateFrom([{ mirror: '당근 3일 등장' }], 'table-stage', '식탁 무대');
    expect(out.some((s) => s.includes('당근 3일 등장'))).toBe(true);
  });
  it('B-06-8 항목 중복 제거', () => {
    const out = doNotRestateFrom([{ blocks: ['table-stage.intro.1'] }, { blocks: ['table-stage.intro.2'] }], 'table-stage', '식탁 무대');
    expect(out.filter((s) => s.includes('식탁 무대')).length).toBe(1);
  });
});

// ── B-07 — 온보딩·무기록 분기 ──────────────────────────────────────────────────────
describe('B-07 온보딩/무기록', () => {
  const NUM_RE = /[0-9]/;
  it('B-07-1 lowData=true → 온보딩 가이드', () => {
    const g = build({ dailyResult: daily({ lowData: true, decision: decision('table-stage', 1, 'observe') }) });
    expect(g.arcStage).toBe('observe');
    expect(NUM_RE.test(g.why)).toBe(false);
    expect(g.doNotRestate.some((s) => /단정/.test(s))).toBe(true);
  });
  it('B-07-2 decision=null → 관찰 가이드', () => {
    const g = build({ dailyResult: daily({ decision: null }) });
    expect(g.mode).toBe('observe');
    expect(g.stepBehavior).toBe('');
  });
  it('B-07-3 온보딩 가짜 결핍 0(mission_target 무관)', () => {
    const g = build({ dailyResult: daily({ lowData: true, decision: decision('table-stage', 1, 'observe') }), anchor: anchor({ mission_target: '채소' }) });
    expect(g.why.includes('채소')).toBe(false);
  });
  it('B-07-4 lowData에서도 unit_ko는 focus 노출', () => {
    const g = build({ dailyResult: daily({ lowData: true, decision: decision('table-stage', 1, 'observe') }) });
    expect(g.unit_ko).toBe('식탁 무대');
  });
  it('B-07-5 lowData → why에 evidence 수치 0', () => {
    const g = build({ dailyResult: daily({ lowData: true, decision: decision('table-stage', 2, 'observe'), evidence: { envTablePct7d: 0.9 } }) });
    expect(/[0-9]+%/.test(g.why)).toBe(false);
  });
  it('B-07-6 frow.step 보존(리셋 아님)', () => {
    const g = build({ dailyResult: daily({ lowData: true, decision: decision('table-stage', 2, 'observe') }) });
    expect(g.stepN).toBe(2);
  });
});

// ── B-08 — 통합 ────────────────────────────────────────────────────────────────────
describe('B-08 buildTeachingGuide 통합', () => {
  it('B-08-1 정상 합성 — 전 필드', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, 'advance'), evidence: { envTablePct7d: 0.45 } }), anchor: anchor({ impression: '환경이 좋아졌어요.' }), firstOfWeek: true });
    expect(g.unit_ko).toBeTruthy();
    expect(g.lever).toBeTruthy();
    expect(g.stepBehavior).toBeTruthy();
    expect(g.why).toBeTruthy();
    expect(g.arcStage).toBeTruthy();
    expect(Array.isArray(g.doNotRestate)).toBe(true);
    expect(g.mode).toBe('advance');
  });
  it('B-08-2 lowData 분기 우선', () => {
    const g = build({ dailyResult: daily({ lowData: true, decision: decision('table-stage', 1, 'advance'), evidence: { envTablePct7d: 0.9 } }) });
    expect(g.arcStage).toBe('observe');
    expect(/[0-9]+%/.test(g.why)).toBe(false);
  });
  it('B-08-3 plateau → observe 강제', () => {
    const g = build({ dailyResult: daily({ plateau: true, decision: decision('table-stage', 1, 'maintain'), evidence: { envTablePct7d: 0.2 } }) });
    expect(g.arcStage).toBe('observe');
  });
  it('B-08-4 anchor=null 안전 폴백', () => {
    const g = build({ anchor: null, dailyResult: daily({ decision: decision('table-stage', 1, 'advance'), evidence: { envTablePct7d: 0.45 } }) });
    expect(g.weeklyImpressionSoft).toBeNull();
    expect(g.why).toContain('45');
  });
  it('B-08-5 LLM 0콜(callClaude 미import)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../lib/coachGuide.ts', import.meta.url), 'utf8');
    expect(src.includes('callClaude')).toBe(false);
  });
  it('B-08-6 firstOfWeek 전파 → intro', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, 'advance') }), firstOfWeek: true });
    expect(g.arcStage).toBe('intro');
  });
  it('B-08-7 recentCtxs 전파 → doNotRestate', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, 'deepen') }), recentCtxs: [{ blocks: ['table-stage.intro.1'] }] });
    expect(g.doNotRestate.length).toBeGreaterThan(0);
  });
  it('B-08-8 동일 입력 동일 출력(결정론)', () => {
    const args = { dailyResult: daily({ decision: decision('table-stage', 1, 'deepen'), evidence: { envTablePct7d: 0.42 } }), anchor: anchor({ impression: '환경 개선.' }), firstOfWeek: false, lastArcStage: 'how', progress: false, recentCtxs: [{ blocks: ['table-stage.intro.1'] }], dow: 3 };
    expect(JSON.stringify(buildTeachingGuide(args))).toBe(JSON.stringify(buildTeachingGuide(args)));
  });
  it('B-08-9 내부 warning 누설 안 됨', () => {
    const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, 'advance'), warnings: ['같은 전개 3연속'], evidence: { envTablePct7d: 0.45 } }) });
    const blob = JSON.stringify(g);
    expect(blob.includes('같은 전개 3연속')).toBe(false);
    expect(blob.includes('3연속')).toBe(false);
  });
});

// ── B-09 — 진도 영속 계약 ──────────────────────────────────────────────────────────
describe('B-09 nextProgressState', () => {
  it('B-09-1 updates → progressUpserts', () => {
    const r1 = prow('table-stage'); const r2 = prow('hunger-rhythm');
    const out = nextProgressState(daily({ updates: [r1, r2], decision: decision('table-stage', 1, 'advance') }));
    expect(out.progressUpserts.length).toBe(2);
  });
  it('B-09-2 goalsAfter → goalsForAnchor', () => {
    const goals: Goal[] = [{ unit_id: 'table-stage', priority: 1, status: 'focus' }, { unit_id: 'hunger-rhythm', priority: 2, status: 'standby' }];
    const out = nextProgressState(daily({ goalsAfter: goals, decision: decision('table-stage', 1, 'advance') }));
    expect(out.goalsForAnchor).toEqual(goals);
  });
  it('B-09-3 피벗 focus 플립 보존', () => {
    const goals: Goal[] = [{ unit_id: 'table-stage', priority: 1, status: 'stopped' }, { unit_id: 'autonomy-part', priority: 2, status: 'focus' }];
    const out = nextProgressState(daily({ goalsAfter: goals, decision: decision('autonomy-part', 1, 'pivot', 'autonomy-part') }));
    expect(out.goalsForAnchor.find((g) => g.unit_id === 'table-stage')?.status).toBe('stopped');
    expect(out.goalsForAnchor.find((g) => g.unit_id === 'autonomy-part')?.status).toBe('focus');
  });
  it('B-09-4 lowData=true → 진도 동결(빈 upsert)', () => {
    const out = nextProgressState(daily({ lowData: true, updates: [], decision: decision('table-stage', 1, 'observe') }));
    expect(out.progressUpserts.length).toBe(0);
  });
  it('B-09-5 순수(DB/supabase import 0)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../lib/coachGuide.ts', import.meta.url), 'utf8');
    expect(/supabase|createClient|from '@\//.test(src)).toBe(false);
  });
  it('B-09-6 GUIDE_PERSISTENCE_NOTE 정책 키워드', () => {
    expect(GUIDE_PERSISTENCE_NOTE).toContain('Letter B만');
    expect(GUIDE_PERSISTENCE_NOTE).toContain('진도');
    expect(GUIDE_PERSISTENCE_NOTE).toContain('비참여');
  });
});

// ── B-10 — 0회 식재료 누설 가드 ─────────────────────────────────────────────────────
describe('B-10 assertNoZeroFreqStaple', () => {
  const FREQ = { 당근: 184, 토마토: 42, 브로콜리: 25, 양배추: 20, 시금치: 13, 근대: 11, 치즈: 18, 단호박: 0, 요거트: 0 };
  it('B-10-1 0회 식재료 노출 탐지', () => {
    const v = assertNoZeroFreqStaple({ why: '단호박을 곁들여 보세요', stepBehavior: '' }, FREQ);
    expect(v.length).toBe(1);
    expect(v[0].ing).toBe('단호박');
  });
  it('B-10-2 정상 빈도 식재료 통과', () => {
    expect(assertNoZeroFreqStaple({ why: '당근은 베타카로틴이 좋아요', stepBehavior: '' }, FREQ).length).toBe(0);
  });
  it('B-10-3 freqMap fixture 정합(인계서 실측)', () => {
    expect(FREQ.당근).toBe(184); expect(FREQ.토마토).toBe(42); expect(FREQ.단호박).toBe(0); expect(FREQ.요거트).toBe(0);
  });
  it('B-10-4 가이드는 식재료를 새로 만들지 않음(C 경계)', () => {
    const g = build({ dailyResult: daily({ decision: decision('exposure-savings', 1, 'advance'), evidence: { targetExposeDays7d: 1 } }) });
    expect(assertNoZeroFreqStaple(g, FREQ).length).toBe(0);   // 식재료 미주입 → 0회 식재료 0건
  });
  it('B-10-5 빈 freqMap 방어(검사 스킵)', () => {
    expect(assertNoZeroFreqStaple({ why: '단호박', stepBehavior: '' }, {})).toEqual([]);
    expect(assertNoZeroFreqStaple({ why: '단호박', stepBehavior: '' }, null)).toEqual([]);
  });
});

// ── B-11 — 아린 6통 회귀 + 14일 리플레이 ────────────────────────────────────────────
describe('B-11 아린 회귀·리플레이', () => {
  it('B-11-1 같은 mode 6일 → arcStage 분산(복붙 수렴 차단)', () => {
    const stages = [1, 2, 3, 4, 5, 6].map((dow) =>
      build({ dailyResult: daily({ decision: decision('table-stage', 1, 'deepen'), evidence: { envTablePct7d: 0.42 } }), firstOfWeek: false, dow }).arcStage);
    expect(new Set(stages).size).toBeGreaterThanOrEqual(2);
  });
  it('B-11-2 14일 시뮬 — 임의 7일 창에서 intro ≤1', () => {
    // 주 첫날(dow 1=월)만 firstOfWeek=true·advance, 나머지는 deepen 주중
    const stages: string[] = [];
    for (let i = 0; i < 14; i++) {
      const dow = ((i + 1) % 7);                                 // 0..6 회전
      const firstOfWeek = dow === 1;                              // 월요일=주 첫
      stages.push(build({ dailyResult: daily({ decision: decision('table-stage', 1, firstOfWeek ? 'advance' : 'deepen'), evidence: { envTablePct7d: 0.42 } }), firstOfWeek, dow }).arcStage);
    }
    for (let i = 0; i + 7 <= stages.length; i++) {
      const intros = stages.slice(i, i + 7).filter((s) => s === 'intro').length;
      expect(intros).toBeLessThanOrEqual(1);
    }
  });
  it('B-11-3 6 가이드 모호어 0', () => {
    for (const mode of ['advance', 'deepen', 'maintain', 'observe'] as Mode[]) {
      const g = build({ dailyResult: daily({ decision: decision('table-stage', 1, mode), evidence: { envTablePct7d: 0.42 } }) });
      expect(/요즘|최근/.test(g.why)).toBe(false);
    }
  });
  it('B-11-4 limping 고착 → pivot/plateau 가이드(observe 톤)', () => {
    // decideDailyV3가 plateau를 던진 케이스 — 가이드는 observe 강제·maintain 각도
    const g = build({ dailyResult: daily({ plateau: true, decision: decision('table-stage', 1, 'maintain'), evidence: { envTablePct7d: 0.14 } }) });
    expect(g.arcStage).toBe('observe');
    expect(/정체|태도/.test(g.why)).toBe(true);
  });
  it('B-11-5 가입 다음날 환각 0', () => {
    const g = build({ dailyResult: daily({ lowData: true, decision: decision('table-stage', 1, 'observe') }), anchor: anchor({ mission_target: '콩류' }) });
    expect(/[0-9]+%|콩류|채소.*비/.test(g.why)).toBe(false);
  });
  it('B-11-6 14일 시뮬 reinforce 이틀연속 0', () => {
    const stages: WeeklyArcStage[] = [];
    let last: string | null = null;
    for (let i = 0; i < 14; i++) {
      const dow = ((i + 1) % 7);
      const progress = i % 2 === 0;                               // 격일 진척 → reinforce 후보 잦게
      const s = arcStageFor({ mode: 'deepen', firstOfWeek: false, lastArcStage: last, progress, dow });
      stages.push(s); last = s;
    }
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i] === 'reinforce' && stages[i - 1] === 'reinforce').toBe(false);
    }
  });
  it('B-11-7 전 유닛×전 mode 스모크(throw 0·9필드)', () => {
    for (const u of UNIT_IDS) for (const mode of ['advance', 'deepen', 'maintain', 'pivot', 'celebrate', 'observe'] as Mode[]) {
      const g = build({ dailyResult: daily({ decision: decision(u, 1, mode, mode === 'pivot' ? u : null), evidence: { envTablePct7d: 0.4 } }) });
      for (const k of ['unit_ko', 'lever', 'stepBehavior', 'why', 'arcStage', 'doNotRestate', 'stepN', 'mode']) {
        expect(g).toHaveProperty(k);
      }
      expect(g.unit_ko.length).toBeGreaterThan(0);
    }
  });
  it('B-11-8 결정론 — 시드 고정 14일 재현', () => {
    const run = () => {
      const seq: string[] = [];
      for (let i = 0; i < 14; i++) {
        const dow = ((i + 1) % 7);
        seq.push(JSON.stringify(build({ dailyResult: daily({ decision: decision('table-stage', 1, 'deepen'), evidence: { envTablePct7d: 0.42 } }), firstOfWeek: dow === 1, dow })));
      }
      return seq.join('|');
    };
    expect(run()).toBe(run());
  });
});
