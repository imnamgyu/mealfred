/**
 * lib/curriculum.ts — v3 진도 상태기계 (WBS B-16~B-24 · A-05 · E-01)
 *
 * 전부 순수 함수 — DB·LLM·시계 의존 0(시각은 today 인자). 크론(H-02)이 로드→advanceProgress→upsert.
 *
 * 상태 전이 매트릭스 (B-23 — 불법 전이는 무시):
 *   not_started ─활성화→ active ─신호→ progressing ─사다리(holdWeeks 충족)→ step+1 …
 *   최종 단 충족 → maintenance(유지 주: 코칭 중단·관찰) ─유지 성공→ mastered / ─신호 붕괴→ active(재코칭)
 *   active|progressing ─정체(stallDays·코칭했는데 무신호)→ pivoted(stop_reason=stalled)
 *   mastered ─relapseWhen 연속 relapseWindowDays→ relapsed(step=최종단-1에서 재개) ─활성화→ active
 */
import { UNITS, TH, UNIT_IDS, type UnitId, type UnitDef, type ProgressRow, type Evidence, type CRow, type ProbeAnswer, type Goal, type UnitStatus } from './curriculumUnits';

const dstr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayAge = (today: string, d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
const yest = (t: string) => dstr(Date.parse(t) - 86400000);

export function blankRow(child_id: string, unit_id: UnitId): ProgressRow {
  return { child_id, unit_id, status: 'not_started', step: 0, evidence: {}, started_at: null, mastered_at: null, last_signal_at: null, stop_reason: null, relapse_count: 0 };
}

// ── B-18·B-19 — 진전/정체 ─────────────────────────────────────────────────────
/** 진전: 최근 stallDays 내 1차 신호 관측 */
export function isProgressing(row: ProgressRow, today: string): boolean {
  return !!row.last_signal_at && dayAge(today, row.last_signal_at) <= TH.stallDays;
}
/** 정체: 신호 stallDays+ 무관측 '그리고' 그 기간 실제로 가르쳤음(코칭 일수 ≥3 — "안 가르쳤음"과 구분) */
export function isStalled(row: ProgressRow, today: string, coachedDays: number): boolean {
  const noSignal = !row.last_signal_at || dayAge(today, row.last_signal_at) > TH.stallDays;
  return noSignal && coachedDays >= TH.coachedDaysForStall;
}

// ── B-16 + 상태별 진화(단일 유닛 하루치) ────────────────────────────────────────
export type EvolveEvents = { stepAdvanced: boolean; enteredMaintenance: boolean; graduated: boolean; backFromMaintenance: boolean; relapsed: boolean };
export function evolveRow(p: {
  def: UnitDef; row: ProgressRow; rows: CRow[]; answers: ProbeAnswer[]; today: string;
  coachedYesterday: boolean;   // 어제 편지가 이 유닛 블록을 썼나(D-03 원장) — 유지 주 '코칭 없이' 판정
  foodTarget?: string | null;
}): { row: ProgressRow; ev: EvolveEvents } {
  const { def, today } = p;
  const ev: EvolveEvents = { stepAdvanced: false, enteredMaintenance: false, graduated: false, backFromMaintenance: false, relapsed: false };
  const prev = p.row.evidence || {};
  const snap = def.extract(p.rows, p.answers, today, { foodTarget: p.foodTarget });
  const e: Evidence = { ...prev, ...snap };
  // 평생 적립 배열(노출 적금 누적 8~15회) — 최근 60개 캡(폭주 방지)
  if (typeof snap.hitToday === 'string') {
    const hd = new Set([...(Array.isArray(prev.hitDays) ? (prev.hitDays as string[]) : []), snap.hitToday]);
    e.hitDays = [...hd].sort().slice(-60);
  } else if (Array.isArray(prev.hitDays)) e.hitDays = prev.hitDays;
  const row: ProgressRow = { ...p.row, evidence: e };
  if (snap.signalToday === 1) row.last_signal_at = yest(today);   // 데이터는 어제까지 — 관측일=어제

  if (row.status === 'mastered') {            // B-21 재발 감지
    const r = def.relapseWhen(e);
    const streak = r === true ? (Number(prev.relapseStreakDays) || 0) + 1 : r === false ? 0 : (Number(prev.relapseStreakDays) || 0);
    e.relapseStreakDays = streak;
    if (streak >= TH.relapseWindowDays) {
      row.status = 'relapsed'; row.relapse_count += 1;
      row.step = Math.max(1, def.steps.length - 1);   // 처음이 아니라 직전 단부터 재개(기억 존중)
      e.relapseStreakDays = 0; e.passStreakDays = 0;
      ev.relapsed = true;
    }
    return { row, ev };
  }

  if (row.status === 'maintenance') {         // B-20 유지 주 — 코칭 없이 유지돼야 체득
    const fin = def.steps[def.steps.length - 1];
    const pass = fin.passWhen(e);
    if (pass === false) { row.status = 'active'; e.maintStartedAt = null; e.maintCoached = 0; ev.backFromMaintenance = true; return { row, ev }; }
    e.maintCoached = (Number(prev.maintCoached) || 0) + (p.coachedYesterday ? 1 : 0);
    const start = typeof e.maintStartedAt === 'string' ? (e.maintStartedAt as string) : null;
    if (start && dayAge(today, start) >= 7 * TH.maintenanceWeeks && (Number(e.maintCoached) || 0) === 0 && pass === true) {
      row.status = 'mastered'; row.mastered_at = today; ev.graduated = true;
    }
    return { row, ev };
  }

  if (row.status === 'active' || row.status === 'progressing') {   // B-17 사다리
    const cur = def.steps[Math.max(0, row.step - 1)];
    const pass = cur ? cur.passWhen(e) : null;
    const streak = pass === true ? (Number(prev.passStreakDays) || 0) + 1 : pass === false ? 0 : (Number(prev.passStreakDays) || 0);
    e.passStreakDays = streak;
    if (cur && Math.floor(streak / 7) >= cur.holdWeeks) {
      if (row.step < def.steps.length) { row.step += 1; e.passStreakDays = 0; ev.stepAdvanced = true; }
      else { row.status = 'maintenance'; e.maintStartedAt = today; e.maintCoached = 0; ev.enteredMaintenance = true; return { row, ev }; }
    }
    row.status = isProgressing(row, today) ? 'progressing' : 'active';
  }
  return { row, ev };
}

// ── B-22 피벗 선택 ────────────────────────────────────────────────────────────
export function pickPivot(goals: Goal[], progress: Partial<Record<UnitId, ProgressRow>>): UnitId | null {
  const cands = goals.filter((g) => g.status === 'standby').sort((a, b) => a.priority - b.priority);
  for (const g of cands) {
    const st = progress[g.unit_id]?.status;
    if (st === 'mastered' || st === 'maintenance') continue;
    return g.unit_id;
  }
  return null;
}

// ── E-01 goals 정규화 + A-05 레거시 병행기 ──────────────────────────────────────
export function normalizeGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list = raw
    .filter((g): g is { unit_id: string; priority?: number; status?: string } => !!g && typeof g === 'object' && typeof (g as { unit_id?: unknown }).unit_id === 'string')
    .filter((g) => (UNIT_IDS as string[]).includes(g.unit_id))
    .filter((g) => (seen.has(g.unit_id) ? false : (seen.add(g.unit_id), true)))
    .sort((a, b) => (a.priority || 9) - (b.priority || 9))
    .slice(0, 3);
  let focusSet = false;
  return list.map((g, i) => {
    const stopped = g.status === 'stopped';
    const focus = !stopped && !focusSet ? ((focusSet = true), true) : false;
    return { unit_id: g.unit_id as UnitId, priority: (i + 1) as 1 | 2 | 3, status: stopped ? 'stopped' : focus ? 'focus' : 'standby' };
  });
}
const LEVER_TO_UNIT: Record<string, UnitId> = { environment: 'table-stage', autonomy: 'autonomy-part', texture: 'sensory-texture', food: 'exposure-savings' };
/** 구닻(단일 lever) → goals 승격. goals 있으면 정규화만(A-05 — 컷오버 기간 양코드 호환). */
export function goalsOf(anchor: { goals?: unknown; budget?: { lever?: string } | null } | null): Goal[] {
  if (!anchor) return [];
  const n = normalizeGoals(anchor.goals);
  if (n.length) return n;
  const lever = anchor.budget?.lever;
  const unit = lever ? LEVER_TO_UNIT[lever] : null;
  return unit ? [{ unit_id: unit, priority: 1, status: 'focus' }] : [];
}

// ── B-24 인터럽트 캡(순수 판단부 — 배선은 H) ────────────────────────────────────
/** 같은 인터럽트가 직전 2일 연속이면 3일째 억제. 안전(적신호)은 절대 억제 안 함. */
export function shouldSuppressInterrupt(id: string, recentScenarioIds: string[]): boolean {
  if (id === 'neophobia-arfid-watch') return false;
  return recentScenarioIds.slice(0, 2).filter((x) => x === id).length >= 2;
}

// ── B-23 통합 상태기계 ─────────────────────────────────────────────────────────
export type DailyDecision = { unit: UnitId; step: number; mode: 'advance' | 'deepen' | 'pivot' | 'maintain' | 'celebrate' | 'observe'; pivotTo: UnitId | null };
export function advanceProgress(p: {
  childId: string; goals: Goal[]; progress: Partial<Record<UnitId, ProgressRow>>;
  rows: CRow[]; answers: ProbeAnswer[];
  coachedDays: Partial<Record<UnitId, number>>;   // 최근 stallDays간 유닛 블록 발행 '일수'(D-03 원장)
  coachedYesterday: UnitId[];                      // 어제 편지가 쓴 유닛(유지 주 판정)
  pivotsThisWeek: number; foodTarget?: string | null; today: string;
}): { updates: ProgressRow[]; decision: DailyDecision | null; goalsAfter: Goal[] } {
  const out = new Map<UnitId, ProgressRow>();
  const get = (u: UnitId) => out.get(u) ?? p.progress[u] ?? blankRow(p.childId, u);
  const evolve = (u: UnitId, row: ProgressRow) =>
    evolveRow({ def: UNITS[u], row, rows: p.rows, answers: p.answers, today: p.today, coachedYesterday: p.coachedYesterday.includes(u), foodTarget: p.foodTarget });

  // 1) 재발 스캔 — mastered 전체(goal 여부 무관: "무너지면 다시 감지")
  for (const u of UNIT_IDS) {
    const r = p.progress[u];
    if (r?.status === 'mastered') out.set(u, evolve(u, r).row);
  }

  const focus = p.goals.find((g) => g.status === 'focus');
  if (!focus) return { updates: [...out.values()], decision: null, goalsAfter: p.goals };

  // 2) focus 활성화 + 진화 — ⚠️ 재발 스캔에서 이미 오늘치 진화한 유닛은 재진화 금지(이중 적립 버그 — B-26 리플레이가 적발)
  const preEvolved = out.has(focus.unit_id);
  let frow = get(focus.unit_id);
  if (frow.status === 'not_started' || frow.status === 'pivoted' || frow.status === 'relapsed') {
    frow = { ...frow, status: 'active' as UnitStatus, step: Math.max(1, frow.step || 1), started_at: frow.started_at ?? p.today, stop_reason: null };
  }
  let fres: { row: ProgressRow; ev: EvolveEvents };
  if (preEvolved) {
    fres = { row: frow, ev: { stepAdvanced: false, enteredMaintenance: false, graduated: false, backFromMaintenance: false, relapsed: false } };
  } else {
    fres = evolve(focus.unit_id, frow);
  }
  out.set(focus.unit_id, fres.row);

  // 3) standby 증거 적립(이미 시작된 것만 — 판정용·코칭 아님)
  for (const g of p.goals.filter((g) => g.status === 'standby')) {
    if (out.has(g.unit_id)) continue;
    const r0 = p.progress[g.unit_id];
    if (!r0 || r0.status === 'not_started') continue;
    out.set(g.unit_id, evolve(g.unit_id, r0).row);
  }

  // 4) 오늘의 전개 결정
  let mode: DailyDecision['mode'];
  let pivotTo: UnitId | null = null;
  let goalsAfter: Goal[] = p.goals;
  const fr2 = out.get(focus.unit_id)!;
  if (fres.ev.graduated) mode = 'celebrate';
  else if (fr2.status === 'maintenance') mode = 'maintain';
  else if (fres.ev.stepAdvanced) mode = 'advance';
  else if (isProgressing(fr2, p.today)) mode = 'deepen';
  else if (isStalled(fr2, p.today, p.coachedDays[focus.unit_id] || 0)) {
    pivotTo = p.pivotsThisWeek < TH.maxPivotsPerWeek ? pickPivot(p.goals, p.progress) : null;
    if (pivotTo) {
      mode = 'pivot';
      out.set(focus.unit_id, { ...fr2, status: 'pivoted', stop_reason: 'stalled' });
      let prow = get(pivotTo);
      if (prow.status === 'not_started' || prow.status === 'pivoted' || prow.status === 'relapsed') {
        prow = { ...prow, status: 'active', step: Math.max(1, prow.step || 1), started_at: prow.started_at ?? p.today, stop_reason: null };
      }
      out.set(pivotTo, prow);
      // ⭐ 피벗은 goals의 focus도 플립해야 영속된다(정적 goals가 다음 날 피벗을 되돌리는 버그 — B-26 리플레이 적발).
      //   호출자(크론 H-02/E-07)는 goalsAfter를 닻에 저장할 의무.
      goalsAfter = p.goals.map((g) =>
        g.unit_id === focus.unit_id ? { ...g, status: 'stopped' as const, reason: 'stalled' }
        : g.unit_id === pivotTo ? { ...g, status: 'focus' as const } : g);
    } else mode = 'observe';   // 피벗 캡 소진/대상 없음 → plateau류(F-08)
  } else mode = 'observe';     // 판정 보류(표본 부족 등) — 질문 정렬(G)이 메움

  const dUnit = mode === 'pivot' && pivotTo ? pivotTo : focus.unit_id;
  const dRow = out.get(dUnit)!;
  return { updates: [...out.values()], decision: { unit: dUnit, step: dRow.step, mode, pivotTo }, goalsAfter };
}
