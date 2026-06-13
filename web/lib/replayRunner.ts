/**
 * lib/replayRunner.ts — v3 통주 리플레이 러너 (WBS I-05 — H-02 크론 루프의 오프라인 리허설)
 *
 * 입력 = meal_logs 모양 rows(합성 I-02 또는 아린 실데이터 캡처 I-04). LLM 0콜 — 주간 종합은
 * 콜드 방식(candidateUnits 결정론)으로 대신한다(Sonnet 순위만 빠진 동일 파이프).
 * 하루 스텝 = 주간 닻(일요일 재종합·피로 캡) → decideDailyV3 → assembleLetter → buildLetterCtx —
 * H-02가 같은 순서를 DB 위에서 수행한다. 여기서 어긋나면 크론도 어긋난다(복리의 본체).
 */
import { UNITS, TH, type UnitId, type Goal, type ProgressRow, type CRow, type ProbeAnswer } from './curriculumUnits';
import { normalizeGoals } from './curriculum';
import { candidateUnits, applyFocusFatigue } from './coachWeekly';
import { decideDailyV3, isUrgent, introNeededV3, recentIntroUnitsOf, buildCandSignals } from './coachDaily';
import { assembleLetter, buildLetterCtx, collectBlockLedger } from './assembleLetter';
import { compileFactCards } from './coachFacts';
import { loadBlocks, type LetterBlock } from './letterBlocks';
import { type ReplayDay } from './replayMetrics';

const addD = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const isoWeekKey = (d: string) => {
  const dt = new Date(Date.parse(d + 'T00:00:00Z'));
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const week = 1 + Math.round((dt.getTime() - firstThu.getTime()) / 604800000);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

export type ReplayFamily = {
  id: string; rows: CRow[]; base: string;
  attendsDaycare?: boolean; refused?: string[]; name?: string;
};
export type ReplayOptions = {
  days?: number;                 // base 직전 며칠을 발행할지(기본 14)
  blocks?: LetterBlock[];        // 기본 = 실 풀
  week?: number;                 // 가입 주차(온보딩 게이트 — 기본 9=정상)
  firstLogDate?: string;         // 첫 기록일 — 주차를 날짜별로 계산(E-05 게이트 충실 — 백필용)
  foodTarget?: string | null;    // 닻 mission_target 주입(백필 — 크론 패리티)
};
export type ReplayFullResult = {
  days: ReplayDay[];
  ctxs: Array<Record<string, unknown>>;            // 발행 편지와 1:1 정렬된 letterCtx(백필 upsert용)
  progress: Partial<Record<UnitId, ProgressRow>>;  // 최종 진도(curriculum_progress 영속용)
  goals: Goal[];                                   // 최종 포트폴리오(닻 goals 영속용)
};

export function runV3Family(fam: ReplayFamily, opt: ReplayOptions = {}): ReplayDay[] {
  return runV3FamilyFull(fam, opt).days;
}

export function runV3FamilyFull(fam: ReplayFamily, opt: ReplayOptions = {}): ReplayFullResult {
  const days = opt.days ?? 14;
  const blocks = opt.blocks ?? loadBlocks();
  const name = fam.name || '아이';
  const foodTarget = opt.foodTarget ?? fam.refused?.[0] ?? null;
  let cidHash = 0; for (let k = 0; k < fam.id.length; k++) cidHash = (cidHash * 31 + fam.id.charCodeAt(k)) >>> 0;

  let progress: Partial<Record<UnitId, ProgressRow>> = {};
  let goals: Goal[] = [];
  let prevWeekGoals: Goal[] | null = null;
  let cited: string[] = [];
  const ctxs: Array<Record<string, unknown>> = [];
  const decisionsLog: Array<{ date: string; unit: UnitId } | null> = [];
  const focusHistory: Array<{ unit_id: UnitId | null; stepAdvanced: boolean }> = [];
  let weekAdvanced = false;
  let pivotsThisWeek = 0;
  let curWeek = '';
  const out: ReplayDay[] = [];

  for (let t = days; t >= 1; t--) {
    const today = addD(fam.base, -(t - 1));
    const weekKey = isoWeekKey(today);
    const rows28 = fam.rows.filter((r) => {
      const a = (Date.parse(today) - Date.parse(r.log_date)) / 86400000;
      return a >= 1 && a <= 28;
    });
    // 주 경계 — 주간 재종합(콜드: 후보 산출+피로 캡. Sonnet 순위는 운영 전용 — 파이프는 동일)
    if (weekKey !== curWeek || !goals.length) {
      if (curWeek) {
        focusHistory.unshift({ unit_id: goals.find((g) => g.status === 'focus')?.unit_id ?? null, stepAdvanced: weekAdvanced });
        prevWeekGoals = goals;
      }
      const sig = buildCandSignals(rows28, today, !!fam.attendsDaycare);
      const weekN = opt.week ?? (opt.firstLogDate
        ? Math.max(1, Math.floor((Date.parse(today) - Date.parse(opt.firstLogDate)) / 86400000 / 7) + 1)
        : 9);
      const cands = candidateUnits({ sig, progress, week: weekN });
      let g = normalizeGoals(cands.map((c, i) => ({ unit_id: c.unit_id, priority: (i + 1) as 1 | 2 | 3, status: i === 0 ? 'focus' : 'standby' })));
      if (focusHistory.length) g = applyFocusFatigue(g, focusHistory);
      goals = g;
      curWeek = weekKey;
      pivotsThisWeek = 0;
      weekAdvanced = false;
      cited = [];   // D-04 — 진단 인용 원장은 주간 수명(주가 바뀌면 카드 통계 자체가 새 사실)
    }
    // coachedDays: 최근 stallDays간 그 유닛으로 편지가 나간 '일수'(D-03 원장 근사 — 결정 유닛 기준)
    const coachedDays: Partial<Record<UnitId, number>> = {};
    for (const d of decisionsLog.slice(-TH.stallDays)) if (d) coachedDays[d.unit] = (coachedDays[d.unit] || 0) + 1;
    const yesterday = decisionsLog[decisionsLog.length - 1];

    const r = decideDailyV3({
      childId: fam.id, goals, progress, rows: rows28, answers: [] as ProbeAnswer[],
      coachedDays, coachedYesterday: yesterday ? [yesterday.unit] : [], pivotsThisWeek,
      foodTarget, today, prevDecisions: out.slice(-2).map((d) => d.decision),
    });
    for (const u of r.updates) progress = { ...progress, [u.unit_id]: u };
    if (r.decision?.mode === 'advance') weekAdvanced = true;
    if (r.decision?.mode === 'pivot') pivotsThisWeek++;
    goals = r.goalsAfter;
    if (!r.decision) { decisionsLog.push(null); continue; }   // goal 없음(관찰 주 폴백 외) — 편지 생략일

    const facts = compileFactCards({ rows: rows28.filter((x) => (Date.parse(today) - Date.parse(x.log_date)) / 86400000 <= 7), today });
    const firstOfWeek = !out.some((d) => d.weekKey === weekKey);
    const recentIntros = recentIntroUnitsOf(ctxs.slice(-7));
    const introNeeded = introNeededV3(firstOfWeek, r.decision.unit, prevWeekGoals, recentIntros);
    const suppressIntro = r.decision.mode === 'pivot' && recentIntros.has(r.decision.unit);
    const det = facts.forbidParts.length ? new RegExp(facts.forbidParts.join('|')) : null;
    const ao = assembleLetter({
      decision: r.decision, unitDef: UNITS[r.decision.unit], factCards: facts.cards,
      blocks, blockLedger: collectBlockLedger(ctxs.slice(-3)), factsCited: cited,
      recentCombos: ctxs.slice(-7).map((c) => (Array.isArray(c.blocks) ? (c.blocks as string[]).join('+') : '')).filter(Boolean),
      name, daySeed: Math.floor(Date.parse(today) / 86400000), cidHash,
      food: foodTarget, introNeeded, suppressIntro, lowData: r.lowData,
      urgent: isUrgent({ icfqRiskCount: 0, rows: rows28, today }), detForbid: det,
    });
    const ctx = buildLetterCtx({ source: 'replay', out: ao, decision: r.decision, goalsSnapshot: goals, prevFactsCited: cited });
    cited = ctx.factsCited as string[];
    ctxs.push(ctx);
    decisionsLog.push({ date: today, unit: r.decision.unit });
    out.push({
      date: today, decision: r.decision, usedBlocks: ao.usedBlocks, letter: ao.letter, oneliner: ao.oneliner,
      factUsed: ao.factUsed, factUsedKind: ao.factUsedKind, fallback: ao.fallback,
      focusUnit: goals.find((g) => g.status === 'focus')?.unit_id ?? null, weekKey, llmCalls: 0,
    });
  }
  return { days: out, ctxs, progress, goals };
}
