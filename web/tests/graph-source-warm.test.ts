/**
 * graphSource SQL warm(handoff #2) — id→name resolve · 고아 엣지 드롭 · 안전 게이트 · 무효화 반영.
 * 별도 파일(모듈 캐시 격리) — warm이 캐시를 바꾸므로 graph-source.test.ts(JSON 검증)와 분리.
 */
import { describe, it, expect } from 'vitest';
import { warmGraphFromSql, getEdges, getDishMatrix, isGraphWarmed } from '../lib/graphSource';
import { neighborsOf } from '../lib/foodGraph';

type Row = Record<string, unknown>;
function mockDb(ings: Row[], edges: Row[], dishes: Row[]) {
  return {
    from: (t: string) => ({
      select: () => Promise.resolve({
        data: t === 'ingredients' ? ings : t === 'ingredient_edges' ? edges : t === 'dish_ingredient_stats' ? dishes : [],
        error: null,
      }),
    }),
  };
}

const ings = Array.from({ length: 30 }, (_, i) => ({ id: 'u' + (i + 1), name: 'n' + (i + 1) }));
const edges: Row[] = Array.from({ length: 120 }, (_, i) => ({
  a_id: 'u' + ((i % 28) + 1), b_id: 'u' + ((i % 28) + 2),
  kind: i % 3 === 0 ? 'bridge' : 'pair', count: 5, lift: 2.0, grade: 'strong', strength: 3, src: 'recipe', basis: '테스트', verified: true, tray: null,
}));
edges.push({ a_id: 'u1', b_id: 'uZZZ', kind: 'pair', count: 9, strength: 3, basis: '고아', verified: true });   // 고아(b_id 미존재) → 드롭돼야
const dishes: Row[] = [];
for (let d = 0; d < 12; d++) for (let k = 0; k < 3; k++) dishes.push({ dish: '요리' + d, ingredient_id: 'u' + (k + 1), count: 9, score: 3 });

describe('warmGraphFromSql — 성공 경로', () => {
  it('ok·edges·cells 반환, id→name resolve', async () => {
    const r = await warmGraphFromSql(mockDb(ings, edges, dishes));
    expect(r.ok).toBe(true);
    expect(r.edges).toBeGreaterThanOrEqual(120);
    expect(r.cells).toBe(12);
    expect(isGraphWarmed()).toBe(true);
  });
  it('getEdges가 이름 shape(a/b=이름)로 반환 — u1/u2 → n1/n2', () => {
    const es = getEdges() as Array<{ a: string; b: string }>;
    expect(es.some((e) => e.a === 'n1' && e.b === 'n2')).toBe(true);
    expect(es.every((e) => typeof e.a === 'string' && typeof e.b === 'string')).toBe(true);
  });
  it('고아 엣지(b_id 미존재)는 드롭', () => {
    const es = getEdges() as Array<{ a: string; b: string }>;
    expect(es.some((e) => e.b === undefined || e.b === 'uZZZ')).toBe(false);
  });
  it('getDishMatrix cells/scores=SQL(이름), dishes(이모지 메타)=JSON 유지', () => {
    const k = getDishMatrix() as { cells: Record<string, Record<string, number>>; scores: Record<string, Record<string, number>>; dishes: unknown[] };
    expect(k.cells['요리0']['n1']).toBe(9);
    expect(k.scores['요리0']['n1']).toBe(3);
    expect(Array.isArray(k.dishes)).toBe(true);   // JSON dishes 보존
  });
  it('무효화 반영 — neighborsOf(n1)에 n2 포함(ADJ가 SQL로 재구성)', () => {
    expect(neighborsOf('n1').some((nb) => nb.nm === 'n2')).toBe(true);
  });
});

describe('warmGraphFromSql — 안전 게이트(빈약하면 JSON 유지)', () => {
  it('엣지 100 미만이면 ok=false·reason sparse', async () => {
    const r = await warmGraphFromSql(mockDb(ings, edges.slice(0, 5), dishes));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/sparse/);
  });
  it('ingredients 비면 ok=false', async () => {
    const r = await warmGraphFromSql(mockDb([], edges, dishes));
    expect(r.ok).toBe(false);
  });
});
