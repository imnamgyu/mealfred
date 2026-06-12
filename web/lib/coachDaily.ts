/**
 * lib/coachDaily.ts — v3 일간 전개 선택기(EPIC F) + 질문 정렬·피드백 루프(EPIC G)
 *
 * planFromWeekly의 v3 후계. 전부 순수 함수·LLM 0콜 — 크론(H-02)이 컷오버 플래그 뒤에서 호출한다.
 * 결정표(F-02 — 우선순위 고정):
 *   1 안전 인터럽트(축하·적신호·공백)는 호출자(크론)가 기존 selectScenario로 선처리(B-24 캡 적용)
 *   2 재발 유닛 존재 → 그 유닛 재개(mode=advance·재개 단)
 *   3 focus 진전 → advance/deepen   4 정체 → pivot(주당 캡)   5 캡 소진 정체 → plateau(maintain류)+재진단 플래그
 *   6 무기록 주(byDay<3) → 진도 동결 + lowdata 모드(F-07)
 */
import { UNITS, TH, type UnitId, type UnitDef, type Goal, type ProgressRow, type Evidence, type CRow, type ProbeAnswer, type ProbeDef } from './curriculumUnits';
import { advanceProgress, isStalled, type DailyDecision } from './curriculum';
import { icfqForDate } from './coach';
import { type WeeklyBudget, type WeeklyLedger, DEFAULT_BUDGET, DEFAULT_LEDGER } from './coachWeekly';

const age = (today: string, d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 86400000);

// ── F-04 — 시급 예외(이사님 확정 3종 한정 — 확장은 별도 승인) ────────────────────
// 시급 = D-04 사실 재서술 원장을 우회해 같은 사실을 다시 말할 수 있는 유일한 경우 + 전문가 안내 블록.
export const URGENT_RULES = ['icfq-risk', 'choke-memo', 'full-refusal-3d'] as const;
const CHOKE_RE = /질식|사레|컥|켁|숨\s?막|기도|삼키다가/;
const MEAL_SLOTS = new Set(['breakfast', 'lunch', 'dinner']);
export function isUrgent(p: { icfqRiskCount: number; rows: CRow[]; today: string }): boolean {
  if ((p.icfqRiskCount || 0) >= 2) return true;                                    // ① ICFQ 적신호 누적
  if (p.rows.some((r) => r.note && age(p.today, r.log_date) <= 2 && CHOKE_RE.test(r.note))) return true;   // ② 질식 위험 메모(최근 2일)
  for (let d = 1; d <= 3; d++) {                                                   // ③ 3일+ 전량 거부(끼니 행 전부 ate_well=false)
    const day = p.rows.filter((r) => age(p.today, r.log_date) === d && MEAL_SLOTS.has(r.slot || ''));
    if (!day.length || !day.every((r) => r.ate_well === false)) return false;
  }
  return true;
}

// ── F-06 — 주 첫 편지 판정 v3: 이월 유닛이면 intro 생략(매주 월요일 재도입 방지) ──
// recentIntroUnits = 최근 7일 편지가 intro 블록을 쓴 유닛(컨텍스트 blocks에서 수집) —
// 피벗 복귀 주가 prevWeekGoals상 'stopped'라 이월로 안 잡히는 구멍을 리플레이(I-05)가 적발해 추가.
export function introNeededV3(firstOfWeek: boolean, focusUnit: UnitId | null, prevWeekGoals: Goal[] | null | undefined, recentIntroUnits?: Iterable<string>): boolean {
  if (!firstOfWeek || !focusUnit) return false;
  if (recentIntroUnits && new Set(recentIntroUnits).has(focusUnit)) return false;
  return !(prevWeekGoals || []).some((g) => g.unit_id === focusUnit && g.status !== 'stopped');
}
/** 최근 편지 컨텍스트들에서 intro 블록을 쓴 유닛 수집(F-06 가드 입력 — 크론 H-02·러너 공용) */
export function recentIntroUnitsOf(ctxs: Array<Record<string, unknown> | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const c of ctxs || []) {
    const arr = c && Array.isArray((c as { blocks?: unknown }).blocks) ? ((c as { blocks: string[] }).blocks) : [];
    for (const id of arr) {
      const m = typeof id === 'string' ? id.match(/^(.+)\.intro\.\d+$/) : null;
      if (m && m[1] !== 'common') out.add(m[1]);
    }
  }
  return out;
}

// ── F-01 — 어제 델타(일일 진료차트 대조) ───────────────────────────────────────
export type Delta = { stepChanged: boolean; signalYesterday: boolean; moved: Array<{ key: string; from: number; to: number; dir: '↑' | '↓' }> };
export function yesterdayDelta(prev: ProgressRow | null, now: ProgressRow, today: string): Delta {
  const yest = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const moved: Delta['moved'] = [];
  const pe = (prev?.evidence || {}) as Evidence;
  const ne = (now.evidence || {}) as Evidence;
  for (const k of Object.keys(ne)) {
    const a = pe[k]; const b = ne[k];
    if (typeof a === 'number' && typeof b === 'number' && a !== b) moved.push({ key: k, from: a, to: b, dir: b > a ? '↑' : '↓' });
  }
  moved.sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from));
  return { stepChanged: (prev?.step ?? 0) !== now.step, signalYesterday: now.last_signal_at === yest, moved: moved.slice(0, 3) };
}

// ── F-03 — 채근 캡 게이트(M3 흡수): push성 블록은 '적기'에만 — avoidTags 공급원 ──
export function pushGateV3(p: { budget: WeeklyBudget | null; ledger: WeeklyLedger | null; dow: number; targetExposeWtd: number }): boolean {
  const budget = p.budget || DEFAULT_BUDGET;
  const ledger = p.ledger || DEFAULT_LEDGER;
  return (budget.push || 0) > 0 && !ledger.pushUsed && (budget.pushWindow || []).includes(p.dow) && p.targetExposeWtd >= 1;
}
/** 블록 선택 avoidTags — push 불가면 forbids:['push'] 블록 제외(코드 보장·강등은 비push 변형 선택) */
export function pushAvoidTags(allowed: boolean): string[] { return allowed ? [] : ['push']; }

// ── F-02·F-07·F-08 — 일간 전개 통합 ──────────────────────────────────────────
export type DailyV3Input = Parameters<typeof advanceProgress>[0] & {
  prevDecisions?: Array<{ unit: string; mode: string } | null | undefined>;   // 최근 결정(최신 우선 — 3연속 경고 F-01)
};
export type DailyV3Result = {
  decision: DailyDecision | null; updates: ProgressRow[]; goalsAfter: Goal[];
  lowData: boolean; plateau: boolean; replanFlag: boolean; warnings: string[];
};
export function decideDailyV3(p: DailyV3Input): DailyV3Result {
  const warnings: string[] = [];
  // F-07 — 무기록 주: 진도 동결(전이·적립 없음) + lowdata 모드. 복귀 후 이어가기(리셋 아님).
  const byDay = new Set(p.rows.filter((r) => { const a = age(p.today, r.log_date); return a >= 1 && a <= 7; }).map((r) => r.log_date)).size;
  const focus = p.goals.find((g) => g.status === 'focus') || null;
  if (byDay < TH.minLoggedDays) {
    const frow = focus ? p.progress[focus.unit_id] : null;
    return {
      decision: focus ? { unit: focus.unit_id, step: Math.max(1, frow?.step || 1), mode: 'observe', pivotTo: null } : null,
      updates: [], goalsAfter: p.goals, lowData: true, plateau: false, replanFlag: false, warnings,
    };
  }

  const r = advanceProgress(p);
  let decision = r.decision;
  let plateau = false; let replanFlag = false;

  // 결정표 2 — 재발 신규 감지: mastered였다가 오늘 relapsed로 떨어진 유닛이 있으면 그 유닛 재개가 오늘의 편지(최우선)
  const relapsedNew = r.updates.find((u) => u.status === 'relapsed' && p.progress[u.unit_id]?.status === 'mastered');
  if (relapsedNew) {
    decision = { unit: relapsedNew.unit_id, step: Math.max(1, relapsedNew.step), mode: 'advance', pivotTo: null };
  } else if (decision && decision.mode === 'observe') {
    // 결정표 5(F-08) — '보류'가 아니라 '정체+피벗 불가'면 plateau(태도 칭찬·행동 0) + 일요일 재진단 플래그
    const frow = r.updates.find((u) => u.unit_id === decision!.unit) || p.progress[decision.unit];
    if (frow && isStalled(frow, p.today, p.coachedDays[decision.unit] || 0)) {
      decision = { ...decision, mode: 'maintain' };
      plateau = true; replanFlag = true;
    }
  }

  // F-01 — 같은 (unit,mode) 3일 연속 경고(advance 3연속=사다리 과속 신호 — holdWeeks 검증 환기)
  if (decision && (p.prevDecisions || []).slice(0, 2).filter((d) => d && d.unit === decision!.unit && d.mode === decision!.mode).length >= 2) {
    warnings.push(`같은 전개 3연속: ${decision.unit}/${decision.mode}`);
  }
  return { decision, updates: r.updates, goalsAfter: r.goalsAfter, lowData: false, plateau, replanFlag, warnings };
}

// ── E-03 신호 빌더 — 주간 후보 산출용 CandidateSignals를 rows에서 계산(크론 H-02·리플레이 I-05 공용) ──
const SIG_PRESSURE_RE = /한\s?입만|다\s?먹어|먹어야|억지로|혼냈|먹이려/;
const SIG_BARGAIN_RE = /먹으면\s|줄게|사줄게|상으로|보상으로/;
const SIG_PREMEAL_RE = /(저녁|밥|끼니)\s?(직전|전)에?\s?(간식|우유|주스)/;
export function buildCandSignals(rows: CRow[], today: string, attendsDaycare: boolean): import('./curriculumUnits').CandidateSignals {
  const w7 = rows.filter((r) => { const a = age(today, r.log_date); return a >= 1 && a <= 7; });
  const env = w7.filter((r) => r.environment);
  const auto = w7.filter((r) => r.autonomy);
  const tex = w7.filter((r) => r.texture);
  const mt = w7.filter((r) => typeof r.meal_time === 'number');
  const memoDays = (re: RegExp) => new Set(w7.filter((r) => r.note && re.test(r.note)).map((r) => r.log_date)).size;
  const snackBy: Record<string, number> = {};
  w7.forEach((r) => { if ((r.slot || '').includes('snack')) snackBy[r.log_date] = (snackBy[r.log_date] || 0) + 1; });
  // 신규 식재료(28일 창 — food-bridge 트리거)
  const prior = rows.filter((r) => { const a = age(today, r.log_date); return a > 7 && a <= 28; });
  const seen = new Set(prior.flatMap((r) => r.menus || []));
  const newFoods = new Set(w7.flatMap((r) => r.menus || []).filter((m) => m && !seen.has(m)));
  const refusedAll = new Set<string>();
  const refusedDc = new Set<string>();
  rows.forEach((r) => String(r.refused || '').split(/[,，·]/).forEach((t) => {
    const k = t.trim();
    if (!k) return;
    refusedAll.add(k);
    if (r.place === 'daycare') refusedDc.add(k);
  }));
  return {
    envBadPct: env.length ? env.filter((r) => r.environment !== 'table').length / env.length : null, envCount: env.length,
    selfPct: auto.length ? auto.filter((r) => r.autonomy === 'self').length / auto.length : null, autoCount: auto.length,
    texLow: tex.length >= 3 && tex.filter((r) => r.texture === 'puree' || r.texture === 'mashed').length / tex.length > 0.5, texCount: tex.length,
    mtOver30Pct: mt.length ? mt.filter((r) => (r.meal_time as number) >= 30).length / mt.length : null, mtCount: mt.length,
    missingCount: 0,   // 영양 파이프라인 산출(크론이 fg.missing으로 덮음 — 리플레이는 0)
    refusedCount: refusedAll.size, dcRefusedCount: refusedDc.size,
    pressureMemoDays: memoDays(SIG_PRESSURE_RE), bargainMemoDays: memoDays(SIG_BARGAIN_RE),
    snackHeavyDays: Object.values(snackBy).filter((n) => n >= 3).length, preMealMemoDays: memoDays(SIG_PREMEAL_RE),
    newFoodCount: newFoods.size, attendsDaycare, eatenCount: new Set(rows.flatMap((r) => r.menus || [])).size,
  };
}

// ── G-01·G-06 — 측정 공백 감지(+쿨다운 3일·유닛당 주 2회 캡) ────────────────────
export type RecentProbe = { q_date: string; probeId: string; unit_id: string };
export function measurementGap(def: UnitDef, evidence: Evidence | null, recentProbes: RecentProbe[], today: string): ProbeDef | null {
  const mine7 = recentProbes.filter((rp) => rp.unit_id === def.id && age(today, rp.q_date) <= 7);
  if (mine7.length >= 2) return null;   // 유닛당 주 2회 캡(질문 잔소리화 방지) → 호출자는 로테이션 폴백
  const e = evidence || {};
  for (const probe of def.probes) {
    const v = e[probe.signal];
    if (v !== null && v !== undefined) continue;   // P1 — 데이터로 이미 아는 신호는 절대 안 묻는다(G-09 감사 대상)
    if (recentProbes.some((rp) => rp.probeId === probe.id && age(today, rp.q_date) <= 3)) continue;   // 같은 probe 3일 쿨다운
    return probe;
  }
  return null;
}

// ── G-03·G-05·G-08 — 질문 선택기(우선순위 체인) ────────────────────────────────
export type QuestionPick =
  | { kind: 'icfq'; icfq: { key: string; q: string; chips: string[]; risk: string } }
  | { kind: 'probe'; unit: UnitId; probe: ProbeDef; topic: 'unit-probe'; ctx: { unitProbe: { unit_id: UnitId; signal: string; step: number; probeId: string } } }
  | { kind: 'rotation' };
export function selectQuestionV3(p: {
  today: string; focusDef: UnitDef | null; focusEvidence: Evidence | null; step: number; recentProbes: RecentProbe[];
}): QuestionPick {
  const icfq = icfqForDate(p.today);
  if (icfq) return { kind: 'icfq', icfq };   // ① ICFQ 주기일(안전 스크리너) 우선 — unitProbe는 자연 이월(G-05)
  if (p.focusDef) {
    const probe = measurementGap(p.focusDef, p.focusEvidence, p.recentProbes, p.today);
    if (probe) {
      return {
        kind: 'probe', unit: p.focusDef.id, probe, topic: 'unit-probe',
        ctx: { unitProbe: { unit_id: p.focusDef.id, signal: probe.signal, step: Math.max(1, p.step || 1), probeId: probe.id } },
      };
    }
  }
  return { kind: 'rotation' };               // ③ 기존 QUESTION_MOVES 로테이션 폴백
}

// ── G-04 — 답변 → evidence 파서(칩 정확 일치만 — '잘 모르겠어요'는 표본 미적립) ──
export function parseProbeAnswers(qs: Array<{ q_date: string; answer: string | null; context: Record<string, unknown> | null }>): ProbeAnswer[] {
  const out: ProbeAnswer[] = [];
  for (const q of qs || []) {
    const up = (q.context as { unitProbe?: { unit_id?: string; signal?: string; probeId?: string } } | null)?.unitProbe;
    if (!up?.unit_id || !up.signal) continue;
    const a = (q.answer || '').trim();
    if (!a || a === '잘 모르겠어요') continue;          // 무지 존중 — 미적립
    const def = UNITS[up.unit_id as UnitId];
    if (!def) continue;
    const probe = def.probes.find((pr) => pr.id === up.probeId);
    if (!probe || !probe.chips.includes(a)) continue;   // 자유 텍스트·미지 칩은 보수적 미적립
    out.push({ q_date: q.q_date, unit_id: up.unit_id, signal: up.signal, value: a });
  }
  return out;
}
