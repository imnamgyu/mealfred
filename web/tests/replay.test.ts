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
