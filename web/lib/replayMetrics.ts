/**
 * lib/replayMetrics.ts — v3 리플레이 지표 (WBS I-01 · 컷오버 게이트 I-06의 측정기)
 *
 * 설계 §5 지표 교체분: 유사도 p95·검증위반율(자유작문 시대) → 조립식 시대의 구조 지표.
 * 입력 = 일자순 ReplayDay[](리플레이 러너 I-05 산출 — 운영 J-01 집계도 같은 모양으로 재사용 가능).
 * 전부 순수 함수 · LLM 0콜.
 */
import { type UnitId } from './curriculumUnits';
import { type DailyDecision } from './curriculum';

export type ReplayDay = {
  date: string;
  decision: DailyDecision | null;
  usedBlocks: string[];
  letter: string;
  factUsed: string | null;
  factUsedKind: 'diagnosis' | 'daily' | null;
  fallback: boolean;
  focusUnit: UnitId | null;
  weekKey: string;             // 주 경계(피벗 캡·focus streak 계산)
  llmCalls?: number;
};

export type ReplayReport = {
  letters: number;
  blockRepeat3d: number;        // ① 같은 블록 id가 직전 3통 안에 재등장한 건수 — 목표 0(D-03 보장 검증)
  diagnosisReuse: number;       // ② 같은 (유닛:진단카드)가 2회+ 인용 — 목표 0(D-04 재서술 봉쇄 검증)
  openerRunMax: number;         // ③ 연속 편지 첫 15자 동일 run 최대 — 목표 ≤1(주제 수렴 사고 지표)
  introReentry7d: number;       // ③' 같은 유닛 intro 블록이 7일 내 재등장 — 목표 0(F-06 검증)
  pivotCapViolations: number;   // ④⑤ 한 주(weekKey) 안에서 피벗 2회+ — 목표 0(휙휙 금지)
  modeDist: Record<string, number>;   // ⑥ 흐름 건강도(advance·deepen 비중)
  llmCallsPerLetter: number;    // ⑦ v3 효과 수치(조립=0·윤문 OFF 기준)
  focusStreakMaxWeeks: number;  // ⑧ 같은 unit focus 연속 주 최대 — 주제 피로 감시(E-06 임계와 대조)
  fallbackCount: number;
  fallbackRate: number;         // 게이트: <3%(I-06)
};

const head15 = (t: string) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 15);

export function replayMetrics(days: ReplayDay[]): ReplayReport {
  const seq = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let blockRepeat3d = 0;
  let diagnosisReuse = 0;
  let introReentry7d = 0;
  let pivotCapViolations = 0;
  let fallbackCount = 0;
  const modeDist: Record<string, number> = {};
  let llm = 0;

  const citedDiag = new Map<string, number>();            // `${unit}:${key}` → 인용 횟수
  const lastIntroAt = new Map<string, number>();          // unit → 마지막 intro 인덱스(일)
  const pivotsByWeek = new Map<string, number>();

  for (let i = 0; i < seq.length; i++) {
    const d = seq[i];
    llm += d.llmCalls || 0;
    if (d.fallback) fallbackCount++;
    if (d.decision) modeDist[d.decision.mode] = (modeDist[d.decision.mode] || 0) + 1;

    // ① 3일(직전 3통) 창 블록 재사용
    const window = new Set(seq.slice(Math.max(0, i - 3), i).flatMap((x) => x.usedBlocks));
    blockRepeat3d += d.usedBlocks.filter((id) => window.has(id)).length;

    // ② 진단 카드 재인용 — 원장 수명과 동일한 '주간' 스코프(주가 바뀌면 카드 통계가 새 사실이라 재언급 허용이 설계)
    if (d.factUsedKind === 'diagnosis' && d.factUsed) {
      const k = `${d.weekKey}|${d.factUsed}`;
      const n = (citedDiag.get(k) || 0) + 1;
      citedDiag.set(k, n);
      if (n >= 2) diagnosisReuse++;
    }

    // ③' intro 재등장(7일)
    for (const id of d.usedBlocks) {
      const m = id.match(/^(.+)\.intro\.\d+$/);
      if (!m || m[1] === 'common') continue;
      const prev = lastIntroAt.get(m[1]);
      if (prev != null && i - prev < 7) introReentry7d++;
      lastIntroAt.set(m[1], i);
    }

    // ④ 주당 피벗 캡
    if (d.decision?.mode === 'pivot') {
      const n = (pivotsByWeek.get(d.weekKey) || 0) + 1;
      pivotsByWeek.set(d.weekKey, n);
      if (n >= 2) pivotCapViolations++;
    }
  }

  // ③ 도입 15자 동일 run
  let openerRunMax = seq.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i].letter && head15(seq[i].letter) === head15(seq[i - 1].letter)) run++;
    else run = 1;
    openerRunMax = Math.max(openerRunMax, run);
  }

  // ⑧ focus 연속 주(주 단위 최빈 focus의 연속)
  const weekFocus = new Map<string, UnitId | null>();
  for (const d of seq) if (!weekFocus.has(d.weekKey)) weekFocus.set(d.weekKey, d.focusUnit);
  const weeks = [...weekFocus.values()];
  let focusStreakMaxWeeks = weeks.length ? 1 : 0;
  let ws = 1;
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i] && weeks[i] === weeks[i - 1]) ws++;
    else ws = 1;
    focusStreakMaxWeeks = Math.max(focusStreakMaxWeeks, ws);
  }

  return {
    letters: seq.length,
    blockRepeat3d, diagnosisReuse, openerRunMax, introReentry7d, pivotCapViolations,
    modeDist, llmCallsPerLetter: seq.length ? Math.round((llm / seq.length) * 100) / 100 : 0,
    focusStreakMaxWeeks, fallbackCount,
    fallbackRate: seq.length ? Math.round((fallbackCount / seq.length) * 1000) / 1000 : 0,
  };
}

/** I-06 — 컷오버 수치 게이트(미달 항목 목록 반환 — 빈 배열 = 통과) */
export function cutoverGate(r: ReplayReport): string[] {
  const fails: string[] = [];
  if (r.blockRepeat3d > 0) fails.push(`블록 3일 중복 ${r.blockRepeat3d}(목표 0)`);
  if (r.diagnosisReuse > 0) fails.push(`진단 재서술 ${r.diagnosisReuse}(목표 0)`);
  if (r.openerRunMax > 2) fails.push(`도입 동일 연속 ${r.openerRunMax}(목표 ≤2)`);
  if (r.introReentry7d > 0) fails.push(`intro 7일 내 재등장 ${r.introReentry7d}(목표 0)`);
  if (r.pivotCapViolations > 0) fails.push(`주당 피벗 캡 위반 ${r.pivotCapViolations}(목표 0)`);
  if (r.fallbackRate >= 0.03) fails.push(`폴백률 ${(r.fallbackRate * 100).toFixed(1)}%(목표 <3%)`);
  return fails;
}
