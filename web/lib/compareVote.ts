/**
 * lib/compareVote.ts — A/B 편지 비교 승자 판정(EPIC G·순수 함수, LLM 0콜, 부수효과 0).
 *
 * 데이터 소스: compare_votes(child_id, letter_date, variant 'A'|'B', rating 'up'|'down'|'repeat').
 *   변형(A=기존 v2 · B=하이브리드 새 설계)별 1탭 평가를 모아 'B가 A를 이기는지'를 결정론으로 계산한다.
 *
 * 핵심 설계(v3 수렴이 근본 결함이었음):
 *   - 🔁(repeat, '또 비슷해요')를 👎(down)보다 무겁게 본다. 반복/수렴은 이 엔진의 1순위 결함이라 별도·고배점.
 *   - up*2 − down*1 − repeat*1.5 가중 점수. 표본 0이면 0.
 *   - 미세차는 tie로 묶어 단정을 피한다(임계 = max(1, 총표본*0.1)).
 *   - 표본이 임계(MIN_N) 미만이면 'insufficient'(콜드스타트 안전).
 *
 * 어드민 위젯(/admin/compare·[childId] 스레드)·selfcheck 크론이 이 단일 소스를 공유한다.
 */

export type Variant = 'A' | 'B';
export type Rating = 'up' | 'down' | 'repeat';

/** 한 변형의 1탭 평가 집계. */
export type VariantTally = { up: number; down: number; repeat: number };

/** 입력 1행 — compare_votes 한 행에 대응(variant·rating만 본다). */
export type Vote = { variant: Variant; rating: Rating };

export type Winner = 'A' | 'B' | 'tie' | 'insufficient';

export type JudgeOpts = {
  /** 'insufficient' 판정 최소 총표본(기본 4 — 4표 미만은 데이터 부족). */
  minN?: number;
  /** tie 임계 계수 — |aScore-bScore| < max(tieFloor, 총표본*tieRate)면 tie(기본 floor 1·rate 0.1). */
  tieFloor?: number;
  tieRate?: number;
};

export type JudgeResult = {
  winner: Winner;
  aScore: number;
  bScore: number;
  /** 반복신고율 0~1(repeat / 전체표본), 분모 0이면 0. */
  aRepeat: number;
  bRepeat: number;
  /** 총표본 수(A+B 전체 평가 건수). */
  n: number;
};

const num = (x: unknown): number => {
  // 적대 방어 — 음수·NaN·non-finite 입력에도 throw 없이 0 이상 정수로 정규화.
  const v = typeof x === 'number' && Number.isFinite(x) ? x : 0;
  return v > 0 ? Math.floor(v) : 0;
};

/** 변형 한 개의 가중 점수. up*2 − down − repeat*1.5. 표본 0이면 0. (반복을 별점보다 무겁게.) */
export function scoreVariant(t: VariantTally): number {
  const up = num(t?.up), down = num(t?.down), repeat = num(t?.repeat);
  return up * 2 - down * 1 - repeat * 1.5;
}

/** 반복신고율 = repeat / (up+down+repeat). 분모 0이면 0(NaN 아님). */
export function repeatRate(t: VariantTally): number {
  const up = num(t?.up), down = num(t?.down), repeat = num(t?.repeat);
  const total = up + down + repeat;
  return total > 0 ? repeat / total : 0;
}

/** 평탄한 Vote 배열 → 변형별 집계. 알 수 없는 variant/rating은 조용히 무시(적대 안전). */
export function tally(votes: ReadonlyArray<Vote>): { A: VariantTally; B: VariantTally } {
  const A: VariantTally = { up: 0, down: 0, repeat: 0 };
  const B: VariantTally = { up: 0, down: 0, repeat: 0 };
  for (const v of votes || []) {
    const bucket = v?.variant === 'A' ? A : v?.variant === 'B' ? B : null;
    if (!bucket) continue;
    if (v.rating === 'up' || v.rating === 'down' || v.rating === 'repeat') bucket[v.rating]++;
  }
  return { A, B };
}

const totalOf = (t: VariantTally) => num(t.up) + num(t.down) + num(t.repeat);

/**
 * 승자 판정. 입력은 compare_votes 평탄 배열(variant·rating). 부수효과·throw 없음.
 * ① 총표본 < minN → 'insufficient'(콜드스타트).
 * ② |aScore-bScore| < tie 임계 → 'tie'(미세차 단정 방지).
 * ③ 그 외 점수 높은 쪽 승자.
 */
export function judgeWinner(votes: ReadonlyArray<Vote>, opts: JudgeOpts = {}): JudgeResult {
  const minN = num(opts.minN) || 4;
  const tieFloor = typeof opts.tieFloor === 'number' && Number.isFinite(opts.tieFloor) ? opts.tieFloor : 1;
  const tieRate = typeof opts.tieRate === 'number' && Number.isFinite(opts.tieRate) ? opts.tieRate : 0.1;

  const { A, B } = tally(votes);
  const aScore = scoreVariant(A);
  const bScore = scoreVariant(B);
  const aRepeat = repeatRate(A);
  const bRepeat = repeatRate(B);
  const n = totalOf(A) + totalOf(B);

  let winner: Winner;
  if (n < minN) {
    winner = 'insufficient';
  } else {
    const tieThreshold = Math.max(tieFloor, n * tieRate);
    if (Math.abs(aScore - bScore) < tieThreshold) winner = 'tie';
    else winner = bScore > aScore ? 'B' : 'A';
  }
  return { winner, aScore, bScore, aRepeat, bRepeat, n };
}

const WINNER_LABEL: Record<Winner, string> = {
  A: 'A(기존 v2) 우세', B: 'B(새 설계) 우세', tie: '무승부', insufficient: '데이터 부족',
};

/** 신뢰도 — 총표본 기반. <5 low · <15 mid · 이상 high. */
export function confidenceOf(n: number): 'low' | 'mid' | 'high' {
  const v = num(n);
  if (v < 5) return 'low';
  if (v < 15) return 'mid';
  return 'high';
}

/**
 * 어드민·selfcheck alert 공유 요약 문자열.
 * 예: 'B(새 설계) 우세 — 👍 A5:B8 · 🔁 A60%:B0% · 표본 13(mid)'
 */
export function buildCompareSummary(votes: ReadonlyArray<Vote>, opts: JudgeOpts = {}): string {
  const { A, B } = tally(votes);
  const r = judgeWinner(votes, opts);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const conf = confidenceOf(r.n);
  return `${WINNER_LABEL[r.winner]} — 👍 A${num(A.up)}:B${num(B.up)} · 🔁 A${pct(r.aRepeat)}:B${pct(r.bRepeat)} · 표본 ${r.n}(${conf})`;
}
