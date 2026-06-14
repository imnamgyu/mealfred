/**
 * graphSource 계약 박제 (coaching-db-migration-handoff §4) — 반환 shape = 현 JSON shape.
 * 데이터 세션이 내부를 JSON→SQL로 바꿔도 *이 shape는 고정*이어야 엔진(byte 무변경)이 그대로 돈다.
 */
import { describe, it, expect } from 'vitest';
import { getEdges, getDishMatrix, getNutrientMap, getIngredientsLight, getRecipeFreq } from '../lib/graphSource';

describe('graphSource — SQL 전환 계약(반환 shape 고정)', () => {
  it('getEdges(): RawEdge[] — a·b·kind 있는 엣지 배열(궁합/사촌/식판)', () => {
    const edges = getEdges() as { a: string; b: string; kind: string }[];
    expect(Array.isArray(edges)).toBe(true);
    expect(edges.length).toBeGreaterThan(100);
    expect(edges[0]).toHaveProperty('a');
    expect(edges[0]).toHaveProperty('b');
    expect(edges[0]).toHaveProperty('kind');
  });
  it('getDishMatrix(): cells(동시출현)·dishes 보유', () => {
    const k = getDishMatrix() as { cells: Record<string, unknown>; dishes: unknown[] };
    expect(k.cells).toBeTruthy();
    expect(Array.isArray(k.dishes)).toBe(true);
    expect(Object.keys(k.cells).length).toBeGreaterThan(10);
  });
  it('getNutrientMap(): 식재료→{nong,conf,n[]} 맵', () => {
    const m = getNutrientMap() as Record<string, { nong: string; conf: string; n: string[] }>;
    expect(m['당근']).toBeTruthy();
    expect(Array.isArray(m['당근'].n)).toBe(true);
  });
  it('getIngredientsLight(): {ingredients:[{nm,cat}]} — 크론 catMap 소스', () => {
    const l = getIngredientsLight() as { ingredients: { nm: string; cat: string }[] };
    expect(Array.isArray(l.ingredients)).toBe(true);
    expect(l.ingredients.length).toBeGreaterThan(100);
    expect(l.ingredients[0]).toHaveProperty('nm');
    expect(l.ingredients[0]).toHaveProperty('cat');
  });
  it('getRecipeFreq(): 식재료→[{name,freq}] — 크론 freqMap 소스(당근 존재)', () => {
    const r = getRecipeFreq() as Record<string, { name: string; freq: number }[]>;
    expect(r['당근']).toBeDefined();
    expect(Array.isArray(r['당근'])).toBe(true);
  });
});
