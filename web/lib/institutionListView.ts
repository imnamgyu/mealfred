/**
 * /admin/institutions 뷰모델 — 월 옵션·선택 해석·코호트 등수/대표강점.
 *  - 코호트 = 같은 유형·전체 기간 누적(월 격리 제거·이사님 2026-06-24, /api/eval/rank와 동일 기준).
 *  - 월 드롭다운은 데이터에 없어도 "현재 KST 월"을 항상 포함(월 바뀌면 최신 월 즉시 선택 가능·이사님 2026-07-03).
 *  - 등수/대표강점은 유형별 정렬 풀 + 이분탐색 — 전량(1.5만+행) 대상 O(n·log n). 나이브 O(n²)는 수억 연산이라 금지.
 */
import { STANDOUT_META } from './institutionScore';

export type CohortRow = { type: string; score: number; standout_dims: Record<string, number> | null };

/** KST 기준 현재 월(YYYY-MM). 서버가 UTC여도 한국 달력 기준으로 계산. */
export const kstMonth = (now: Date) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 7);

/** 드롭다운 월 옵션 = 데이터에 있는 월 ∪ 현재 월, 최신순. */
export function buildMonthOptions(dataMonths: Iterable<string>, currentMonth: string): string[] {
  return [...new Set([...dataMonths, currentMonth])].sort().reverse();
}

/**
 * 선택 월 해석: 'all'=전체 · 옵션에 있는 YYYY-MM=그 월(데이터 0건이어도 빈 목록으로 표시) ·
 * 그 외/미지정=현재 월(데이터 있을 때) 아니면 데이터 최신 월.
 */
export function resolveSelectedMonth(
  param: string | undefined,
  options: string[],
  dataMonths: Set<string>,
  currentMonth: string,
): string {
  if (param === 'all') return 'all';
  if (param && /^\d{4}-\d{2}$/.test(param) && options.includes(param)) return param;
  if (dataMonths.has(currentMonth)) return currentMonth;
  return options.find((m) => dataMonths.has(m)) || currentMonth;
}

export type TypePools = Map<string, { size: number; scores: number[]; dims: Map<string, number[]> }>;

/** 유형별 정렬 풀 구축(1회 O(n·log n)) — 이후 등수·백분위는 이분탐색. */
export function buildTypePools(rows: CohortRow[]): TypePools {
  const pools: TypePools = new Map();
  for (const r of rows) {
    let p = pools.get(r.type);
    if (!p) {
      p = { size: 0, scores: [], dims: new Map(STANDOUT_META.map((m) => [m.key as string, []])) };
      pools.set(r.type, p);
    }
    p.size++;
    p.scores.push(r.score);
    for (const m of STANDOUT_META) p.dims.get(m.key)!.push(Number((r.standout_dims || {})[m.key] ?? 0));
  }
  for (const p of pools.values()) {
    p.scores.sort((a, b) => a - b);
    for (const arr of p.dims.values()) arr.sort((a, b) => a - b);
  }
  return pools;
}

/** 정렬 배열에서 v보다 큰 첫 인덱스(upper bound). */
const upperBound = (arr: number[], v: number) => {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid + 1; else hi = mid;
  }
  return lo;
};

/** 등수 = (나보다 높은 점수 수)+1 · total = 같은 유형 전체 기간 기관-월 행 수. */
export function rankInPool(pools: TypePools, type: string, score: number): { rank: number; total: number } {
  const p = pools.get(type);
  if (!p) return { rank: 1, total: 0 };
  return { rank: p.scores.length - upperBound(p.scores, score) + 1, total: p.scores.length };
}

/** 대표강점 한 줄("라벨·NN%") — percentile≥60인 차원 중 최고(동률이면 priority 낮은 쪽). 풀<8이면 '—'. */
export function standoutInPool(pools: TypePools, type: string, dims: Record<string, number> | null): string {
  const p = pools.get(type);
  if (!p || p.size < 8) return '—';
  let best: { label: string; pct: number; priority: number } | null = null;
  for (const m of STANDOUT_META) {
    const myVal = Number((dims || {})[m.key] ?? 0);
    if (myVal <= 0) continue;
    const vals = p.dims.get(m.key)!;
    const pct = Math.round((upperBound(vals, myVal) / vals.length) * 100);
    if (pct >= 60 && (!best || pct > best.pct || (pct === best.pct && m.priority < best.priority))) {
      best = { label: m.label, pct, priority: m.priority };
    }
  }
  return best ? `${best.label}·${best.pct}%` : '—';
}
