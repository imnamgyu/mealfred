/**
 * ⭐ 오프라인 리플레이 하네스(결정론층) — N일을 통째로 돌려 '하루'가 아니라 '시계열'의 불변식을 검증한다.
 * 2026-06-11 사고의 교훈: 1일 스냅샷 QA는 반복을 못 잡는다 — 다일 리플레이가 배포 게이트.
 * (LLM 작문층 리플레이는 phase 2 확장 — 여기는 계획·사실·가드의 결정론 전 구간.)
 */
import { describe, it, expect } from 'vitest';
import { planFromWeekly, healAnchor, kstDow, type WeeklyAnchor } from '../lib/coachWeekly';
import { compileFacts, type FactRow } from '../lib/coachFacts';
import { planSignature, type CoachPlan } from '../lib/coach';
import { type CoachSignals } from '../lib/coachScenarios';

const D0 = Date.parse('2026-06-08');   // 월요일(주 시작)
const day = (n: number) => new Date(D0 + n * 86400000).toISOString().slice(0, 10);

// 합성 가정: 등원아·평일 기관 점심·저녁 화면 식사 잦음·간식 메모 가끔(실데이터 아린 패턴의 익명 모사)
function rowsUpTo(today: string): FactRow[] {
  const rows: FactRow[] = [];
  for (let n = -3; n < 14; n++) {
    const d = day(n);
    if (d >= today) break;
    const dw = kstDow(d);
    if (dw >= 1 && dw <= 5) rows.push({ log_date: d, slot: 'lunch', menus: ['급식밥', '배추김치'], refused: null, note: null, environment: null, place: 'daycare', ate_well: true });
    rows.push({ log_date: d, slot: 'dinner', menus: ['밥', '미역국'], refused: null, note: n % 5 === 0 ? '저녁에 잘 먹었어요' : null, environment: n % 4 === 0 ? 'table' : 'screen', place: 'home', ate_well: true });
    rows.push({ log_date: d, slot: 'breakfast', menus: ['빵'], refused: n % 6 === 0 ? '당근' : null, note: null, environment: 'screen', place: 'home', ate_well: true });
  }
  return rows.filter((r) => Date.parse(r.log_date) >= Date.parse(today) - 7 * 86400000);   // 크론과 동일 trailing 창
}

const signals: CoachSignals = {
  timeseries: [], reds: [], homeReds: [], missing: [], homeMissing: [],
  homeRefused: [], daycareRefused: [], refused: [], notes: [], favoriteFoods: [],
  attendsDaycare: true, ageBand: '5y', recentLoggedDays: 5, recentWindow: 5, icfqRiskCount: 0,
  envBadPct: 0.8, envCount: 12,
};
const envAnchor: WeeklyAnchor = healAnchor({
  child_id: 'replay-child', week_key: '2026-W24', status: 'active', source: 'weekly_llm',
  mission: null, mission_target: '콩류', target_pool: ['콩류'], secondary_axis: null,
  budget: { expose: 2, push: 0, cadenceMinGap: 1, pushWindow: [2, 3, 4], lever: 'environment' },
  ledger: null, impression: null, arc_week: 1, basis_hash: null, basis_attends_daycare: true,
  behavior_goal: null, teaching_arc: null, check_method: null,   // 컬럼 미적용 상태에서 시작 → heal로 보충(사고 재현)
});

describe('리플레이: 환경 레버 한 주(월~토) — 3일 복붙 사고의 불변식', () => {
  const sigs: string[] = [];
  const stages: string[] = [];
  let prevArc: string | null = null;
  const recentPlans: CoachPlan[] = [];

  for (let n = 0; n < 6; n++) {
    const today = day(n + 1);   // 화~일 아침 크론이 전날까지 데이터로 생성한다고 가정
    const r: NonNullable<ReturnType<typeof planFromWeekly>> = planFromWeekly({
      anchor: envAnchor, signals, recentPlans: recentPlans.slice(0, 3),
      targetExposeWtd: 0, progress: n >= 3, progressNote: n >= 3 ? '어제 저녁 끼니를 화면 없이' : null,
      firstOfWeek: n === 0, lastArcStage: prevArc, daySeed: 20610 + n, cidHash: 77, dow: kstDow(today),
    })!;
    sigs.push(r.plan.signature);
    stages.push(r.weeklyArc!.stage);
    prevArc = r.weeklyArc!.stage;
    recentPlans.unshift(r.plan);
  }

  it('연속 3일 창에서 같은 시그니처 0건(사고 당시: 3일 동일)', () => {
    for (let i = 0; i < sigs.length; i++) {
      const window = sigs.slice(Math.max(0, i - 2), i);
      expect(window).not.toContain(sigs[i]);
    }
  });
  it('빈 시그니처(frame|-|-) 0건 — 사고 원형 금지', () => {
    sigs.forEach((s) => expect(s).not.toBe(planSignature('mealtime-atmosphere', null, null)));
  });
  it('첫날은 intro, 이후 intro 재등장 0건(진단 재서술은 주 1회)', () => {
    expect(stages[0]).toBe('intro');
    expect(stages.slice(1)).not.toContain('intro');
  });
  it('reinforce 이틀 연속 0건', () => {
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i] === 'reinforce' && stages[i - 1] === 'reinforce').toBe(false);
    }
  });
});

// ── B-26 진도 리플레이 불변식 (WBS) — 다일 통주로 상태기계의 시계열 안전성 검증 ──
import { advanceProgress, blankRow, normalizeGoals } from '../lib/curriculum';
import { TH, type CRow, type UnitId, type ProgressRow } from '../lib/curriculumUnits';

describe('B-26 진도 리플레이 불변식(14~20일 통주)', () => {
  const dstr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const crow = (logDate: string, over: Partial<CRow> = {}): CRow => ({
    log_date: logDate, slot: 'dinner', menus: ['밥'], refused: null, note: null,
    environment: null, place: 'home', ate_well: true, autonomy: null, texture: null, meal_time: null, ...over,
  });
  /** today 기준 직전 6일 env 기록(pct 비율 식탁) + 바닥 */
  const envRows = (today: string, pct: number): CRow[] => {
    const out: CRow[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = dstr(Date.parse(today) - i * 86400000);
      out.push(crow(d, { slot: 'breakfast', environment: Math.round(pct * 6) >= i ? 'table' : 'screen' }));
      out.push(crow(d));
    }
    return out;
  };
  const goals0 = normalizeGoals([{ unit_id: 'table-stage', priority: 1 }, { unit_id: 'hunger-rhythm', priority: 2 }]);
  type Loop = { progress: Partial<Record<UnitId, ProgressRow>>; history: { status: string; step: number; mode: string | null }[] };
  const runLoop = (days: number, start: Partial<Record<UnitId, ProgressRow>>, rowsOf: (today: string) => CRow[], coached: number): Loop => {
    const progress: Partial<Record<UnitId, ProgressRow>> = { ...start };
    const history: Loop['history'] = [];
    let pivots = 0;
    let goals = goals0;   // 피벗 시 goalsAfter 적용(크론의 닻 저장 모사)
    for (let n = 0; n < days; n++) {
      const today = dstr(Date.parse('2026-07-01') + n * 86400000);
      if (n % 7 === 0) pivots = 0;   // 주 경계 피벗 카운터 리셋(크론 동작 모사)
      const { updates, decision, goalsAfter } = advanceProgress({
        childId: 'c1', goals, progress, rows: rowsOf(today), answers: [],
        coachedDays: { 'table-stage': coached }, coachedYesterday: [], pivotsThisWeek: pivots, today,
      });
      if (decision?.mode === 'pivot') pivots++;
      goals = goalsAfter;
      updates.forEach((u) => { progress[u.unit_id] = u; });
      const f = progress['table-stage'] ?? blankRow('c1', 'table-stage');
      history.push({ status: f.status, step: f.step, mode: decision?.mode ?? null });
    }
    return { progress, history };
  };

  it('시나리오① 순항: step 점프 없음·maintenance 경유 졸업·status 역행 없음', () => {
    const start: Partial<Record<UnitId, ProgressRow>> = {
      'table-stage': { ...blankRow('c1', 'table-stage'), status: 'active', step: 2, started_at: '2026-06-20', evidence: { passStreakDays: 12 } },
    };
    const { progress, history } = runLoop(12, start, (t) => envRows(t, 0.8), 0);
    for (let i = 1; i < history.length; i++) {
      expect(Math.abs(history[i].step - history[i - 1].step)).toBeLessThanOrEqual(1);   // 점프 금지
      const bad = history[i - 1].status === 'mastered' && history[i].status === 'active';   // mastered→active 직행 금지(relapsed 경유만)
      expect(bad).toBe(false);
    }
    expect(history.some((h) => h.status === 'maintenance')).toBe(true);   // 유지 주 경유
    expect(progress['table-stage']!.status).toBe('mastered');             // 졸업 도달
    expect(history.filter((h) => h.mode === 'celebrate').length).toBe(1); // 졸업 축하 1회
  });

  it('시나리오② 정체: 주당 피벗 1회 캡·standby 활성화', () => {
    const start: Partial<Record<UnitId, ProgressRow>> = {
      'table-stage': { ...blankRow('c1', 'table-stage'), status: 'active', step: 1, started_at: '2026-06-20', last_signal_at: '2026-06-20' },
    };
    const { progress, history } = runLoop(7, start, (t) => envRows(t, 0).map((r) => ({ ...r, environment: null })), 4);   // env 기록 0(무신호)·코칭 4일
    expect(history.filter((h) => h.mode === 'pivot').length).toBe(1);   // 7일 창 피벗 1회만
    expect(['active', 'progressing']).toContain(progress['hunger-rhythm']?.status);   // standby 활성화(이후 신호 받으면 progressing — 둘 다 정상)
    expect(progress['table-stage']!.status).toBe('pivoted');
    expect(progress['table-stage']!.stop_reason).toBe('stalled');
  });

  it('시나리오③ 재발: goal 밖 mastered 유닛 — 2주 붕괴→relapsed(직전 단 재개·카운트+1)', () => {
    // no-bargain은 goals에 없음 → 재발 스캔이 감지만 하고 재활성화는 주간 재선발 몫
    const start: Partial<Record<UnitId, ProgressRow>> = {
      'no-bargain': { ...blankRow('c1', 'no-bargain'), status: 'mastered', step: 2, mastered_at: '2026-06-01', evidence: {} },
      'table-stage': { ...blankRow('c1', 'table-stage'), status: 'active', step: 1, started_at: '2026-06-20', last_signal_at: '2026-06-30' },
    };
    const bargainRows = (t: string): CRow[] => [
      ...envRows(t, 0.8),
      crow(dstr(Date.parse(t) - 1 * 86400000), { slot: 'pm_snack', note: '이거 먹으면 젤리 줄게 했어요' }),
      crow(dstr(Date.parse(t) - 3 * 86400000), { slot: 'pm_snack', note: '먹으면 사줄게 했어요' }),
    ];
    const { progress } = runLoop(TH.relapseWindowDays + 1, start, bargainRows, 0);
    const f = progress['no-bargain']!;
    expect(f.status).toBe('relapsed');
    expect(f.relapse_count).toBe(1);
    expect(f.step).toBe(1);   // 처음(0)이 아니라 직전 단부터
  });

  it('시나리오④ focus가 relapse한 날: 이중 진화 없이 같은 날 재활성화(active)·카운트 1회만', () => {
    const start: Partial<Record<UnitId, ProgressRow>> = {
      'table-stage': { ...blankRow('c1', 'table-stage'), status: 'mastered', step: 2, mastered_at: '2026-06-01', evidence: { relapseStreakDays: TH.relapseWindowDays - 1 } },
    };
    const { progress, history } = runLoop(2, start, (t) => envRows(t, 0.1), 0);
    expect(history[0].status).toBe('active');           // relapse 감지 즉시 focus 재활성화(코칭 재개)
    expect(progress['table-stage']!.relapse_count).toBe(1);   // 이중 적립 없음
  });
});

describe('리플레이: 사실 카드 14일 — 점심 추세·이벤트 단어 전 구간', () => {
  it('평일 점심이 이어지는 동안엔 매일 결식-아님, 주말엔 점심 단정 forbid 상시 유지', () => {
    for (let n = 2; n < 12; n++) {
      const today = day(n);
      const fc = compileFacts({ rows: rowsUpTo(today), today });
      const re = fc.forbidParts.length ? new RegExp(fc.forbidParts.join('|')) : null;
      expect(re?.test('점심을 거르는 패턴이에요')).toBe(true);   // 어떤 날에도 단정은 금지
    }
  });
  it('과거 단발 뷔페 메모가 있어도 3일 지나면 전 구간 언급 금지', () => {
    const base = rowsUpTo(day(8));
    base.push({ log_date: day(2), slot: 'dinner', menus: ['외식'], refused: null, note: '저녁 뷔페 다녀옴', environment: null, place: 'home', ate_well: true });
    const fc = compileFacts({ rows: base, today: day(8) });
    const re = new RegExp(fc.forbidParts.join('|'));
    expect(re.test('뷔페에서 여러 음식을')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// I-05 — v3 통주 리플레이: 합성 30가정 × 14일 = 매 배포의 리허설(prebuild 게이트)
// ════════════════════════════════════════════════════════════════════════════
import { runV3Family, type ReplayFamily } from '../lib/replayRunner';
import { replayMetrics, cutoverGate, type ReplayDay } from '../lib/replayMetrics';
import SYN from './fixtures/synthetic-families.json';

describe('I-05 v3 30가정 통주(I-06 컷오버 게이트)', () => {
  const families = (SYN as { families: ReplayFamily[] }).families;
  const all: ReplayDay[] = [];
  const perFam: Array<{ id: string; days: ReplayDay[] }> = [];
  for (const f of families) {
    const days = runV3Family(f, { days: 14 });
    perFam.push({ id: f.id, days });
    all.push(...days);
  }

  it('규모 sanity: 30가정 · 발행 300통+(저기록 가정의 생략일 허용)', () => {
    expect(families.length).toBe(30);
    expect(all.length).toBeGreaterThan(300);
  });
  it('I-06 게이트: 가정별 지표 전부 통과(블록 중복 0·재서술 0·intro 재등장 0·피벗 캡·폴백<3%)', () => {
    const fails = perFam.flatMap(({ id, days }) => cutoverGate(replayMetrics(days)).map((f) => `${id}: ${f}`));
    expect(fails).toEqual([]);
  });
  it('전개 분포 sanity: advance·deepen이 흐름의 중심 + 피벗·plateau 경로 실존(flat 가정)', () => {
    const m = replayMetrics(all);
    expect((m.modeDist.advance || 0) + (m.modeDist.deepen || 0)).toBeGreaterThan(all.length * 0.3);
    expect((m.modeDist.pivot || 0)).toBeGreaterThanOrEqual(1);
    expect(m.llmCallsPerLetter).toBe(0);   // ⑦ 조립식 = LLM 0콜(윤문 OFF 기본)
  });
  it('규격: 전 편지 길이 ≤380·빈 편지 0', () => {
    expect(all.filter((d) => !d.letter || d.letter.length > 380).map((d) => `${d.date}`)).toEqual([]);
  });
  it('주제 피로: focus 연속 ≤3주(E-06 캡 + 재도전 허용 진동과 정합)', () => {
    for (const { id, days } of perFam) {
      const m = replayMetrics(days);
      expect(m.focusStreakMaxWeeks, id).toBeLessThanOrEqual(3);
    }
  });
});
