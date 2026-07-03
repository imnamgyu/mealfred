/**
 * /admin/institutions 뷰모델 — 월 옵션·선택 해석·코호트 등수/대표강점(이분탐색 최적화).
 * 핵심 회귀방지 2건(2026-07-03):
 *  1) 월 드롭다운에 현재 KST 월이 데이터 없어도 항상 뜬다(월 바뀌면 최신 월 선택 불가하던 버그).
 *  2) 이분탐색 등수/대표강점이 기존 나이브 O(n²) 구현과 결과 동일(전량 계산 전환 시 의미 보존).
 */
import { describe, it, expect } from 'vitest';
import {
  kstMonth, buildMonthOptions, resolveSelectedMonth, buildTypePools, rankInPool, standoutInPool,
  type CohortRow,
} from '../lib/institutionListView';
import { STANDOUT_META } from '../lib/institutionScore';

describe('kstMonth', () => {
  it('UTC 자정 직전이면 한국은 이미 다음 달', () => {
    expect(kstMonth(new Date('2026-06-30T15:30:00Z'))).toBe('2026-07');   // KST 07-01 00:30
    expect(kstMonth(new Date('2026-07-03T02:00:00Z'))).toBe('2026-07');
  });
});

describe('buildMonthOptions — 현재 월 항상 포함', () => {
  it('데이터에 없는 현재 월(2026-07)이 맨 앞에 뜬다', () => {
    expect(buildMonthOptions(['2026-05', '2026-06', '2025-07'], '2026-07'))
      .toEqual(['2026-07', '2026-06', '2026-05', '2025-07']);
  });
  it('데이터에 이미 있으면 중복 없이 최신순', () => {
    expect(buildMonthOptions(['2026-07', '2026-06'], '2026-07')).toEqual(['2026-07', '2026-06']);
  });
  it('데이터 0건이어도 현재 월 하나는 뜬다', () => {
    expect(buildMonthOptions([], '2026-07')).toEqual(['2026-07']);
  });
});

describe('resolveSelectedMonth', () => {
  const options = ['2026-07', '2026-06', '2026-05'];
  const dataMonths = new Set(['2026-06', '2026-05']);
  it('데이터 없는 현재 월도 명시 선택 가능(빈 목록 표시용)', () => {
    expect(resolveSelectedMonth('2026-07', options, dataMonths, '2026-07')).toBe('2026-07');
  });
  it('미지정이면 현재 월에 데이터 없을 때 데이터 최신 월로', () => {
    expect(resolveSelectedMonth(undefined, options, dataMonths, '2026-07')).toBe('2026-06');
  });
  it('미지정 + 현재 월에 데이터 있으면 현재 월', () => {
    expect(resolveSelectedMonth(undefined, options, new Set(['2026-07', '2026-06']), '2026-07')).toBe('2026-07');
  });
  it("'all'은 전체", () => {
    expect(resolveSelectedMonth('all', options, dataMonths, '2026-07')).toBe('all');
  });
  it('옵션에 없는 월·이상값은 기본값으로', () => {
    expect(resolveSelectedMonth('2024-01', options, dataMonths, '2026-07')).toBe('2026-06');
    expect(resolveSelectedMonth('<script>', options, dataMonths, '2026-07')).toBe('2026-06');
  });
});

// ── 기존 page.tsx의 나이브 구현(2026-06-24 정본 의미) — 이분탐색 결과와 대조용 ──
function naiveRank(pool: CohortRow[], score: number) {
  return { rank: pool.filter((x) => x.score > score).length + 1, total: pool.length };
}
function naiveStandout(pool: CohortRow[], dims: Record<string, number> | null): string {
  if (pool.length < 8) return '—';
  let best: { label: string; pct: number; priority: number } | null = null;
  for (const m of STANDOUT_META) {
    const myVal = Number((dims || {})[m.key] ?? 0);
    if (myVal <= 0) continue;
    const vals = pool.map((p) => Number((p.standout_dims || {})[m.key] ?? 0));
    const pct = Math.round((vals.filter((v) => v <= myVal).length / vals.length) * 100);
    if (pct >= 60 && (!best || pct > best.pct || (pct === best.pct && m.priority < best.priority))) best = { label: m.label, pct, priority: m.priority };
  }
  return best ? `${best.label}·${best.pct}%` : '—';
}

/** 결정적 의사난수(시드 고정) — Date/Math.random 없이 다양한 분포 생성. */
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rankInPool·standoutInPool — 나이브 구현과 결과 동일', () => {
  const rnd = mulberry(20260703);
  const types = ['daycare', 'kindergarten', 'school'];
  const rows: CohortRow[] = Array.from({ length: 600 }, () => ({
    type: types[Math.floor(rnd() * 3)],
    score: Math.round(rnd() * 400) / 4 + 60,           // 60~160, 동점 다수 유도
    standout_dims: rnd() < 0.15 ? null : Object.fromEntries(
      STANDOUT_META.map((m) => [m.key, rnd() < 0.2 ? 0 : Math.round(rnd() * 80) / 10]),
    ),
  }));
  const pools = buildTypePools(rows);
  const byType = new Map<string, CohortRow[]>();
  for (const r of rows) (byType.get(r.type) ?? byType.set(r.type, []).get(r.type)!).push(r);

  it('600행 × 3유형 전수 대조', () => {
    for (const r of rows) {
      const pool = byType.get(r.type)!;
      expect(rankInPool(pools, r.type, r.score)).toEqual(naiveRank(pool, r.score));
      expect(standoutInPool(pools, r.type, r.standout_dims)).toBe(naiveStandout(pool, r.standout_dims));
    }
  });

  it('풀 8개 미만이면 대표강점 — (기존 게이트 유지)', () => {
    const small = buildTypePools(rows.slice(0, 5).map((r) => ({ ...r, type: 'tiny' })));
    expect(standoutInPool(small, 'tiny', { fishFrequency: 9 } as Record<string, number>)).toBe('—');
  });

  it('없는 유형은 rank 1/total 0(기존 폴백 유지)', () => {
    expect(rankInPool(pools, 'ghost', 90)).toEqual({ rank: 1, total: 0 });
  });
});
