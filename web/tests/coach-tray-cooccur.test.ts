/**
 * tests/coach-tray-cooccur.test.ts — NEIS 식판 단위 공통출현 축(축 C) 회귀.
 *
 * 음식 추천을 '실제 같은 끼니에 차려지는가'(식판 공통출현)로도 판단(이사님: "음식 추천은 식단으로 보고 판단").
 *   생성: scripts/pull-neis-tray.py → gen-neis-tray-cooccur.py → gen-food-graph.py가 upgrade-only 병합.
 *   - tray strong 쌍 = 기존 레시피 edge 승급(강등 금지) + 레시피엔 없으면 새 pair edge(src='tray').
 *   - 떡+달걀(멥쌀떡|계란)은 레시피·식판 어디서도 strong 아님 → 추천에서 계속 차단(2차 사고 회귀).
 */
import { describe, it, expect } from 'vitest';
import graph from '../lib/food-graph.json';
import { strongPairsOf, neighborsOf } from '../lib/foodGraph';

const G = graph as { edges: { a: string; b: string; kind: string; grade?: string; tray?: string; src?: string; count?: number }[]; meta: Record<string, number> };
const pairEdge = (a: string, b: string) => G.edges.find((e) => e.kind === 'pair' && ((e.a === a && e.b === b) || (e.a === b && e.b === a)));

describe('TR-01 식판 축 병합 무결성', () => {
  it('TR-01-1 meta에 식판 통계 존재(trays>0·신규/승급 집계)', () => {
    expect(G.meta.tray_trays).toBeGreaterThan(0);
    expect((G.meta.tray_new ?? 0) + (G.meta.tray_up ?? 0)).toBeGreaterThan(0);
  });
  it('TR-01-2 src=tray 신규 edge는 전부 pair·grade strong(식판 근거만으로 추가된 강한 쌍)', () => {
    const ts = G.edges.filter((e) => e.src === 'tray');
    expect(ts.length).toBeGreaterThan(0);
    for (const e of ts) {
      expect(e.kind).toBe('pair');
      expect(e.grade).toBe('strong');
      expect(e.tray).toBe('strong');
    }
  });
});

describe('TR-02 실제 식단 구성 쌍이 추천에 들어옴', () => {
  // 전국 초등 급식 1,600식판에서 같은 끼니에 자주 차려진 쌍(제육+김치, 콩나물국+고기, 미역국+소고기 …)
  it('TR-02-1 돼지고기↔콩나물(콩나물국+제육 식판) strong', () => {
    expect(strongPairsOf('돼지고기').some((n) => n.nm === '콩나물')).toBe(true);
  });
  it('TR-02-2 미역↔소고기(소고기미역국+고기반찬) strong', () => {
    expect(strongPairsOf('미역').some((n) => n.nm === '소고기')).toBe(true);
  });
  it('TR-02-3 감자↔소고기(감자국/조림+고기) strong', () => {
    expect(strongPairsOf('감자').some((n) => n.nm === '소고기')).toBe(true);
  });
  it('TR-02-4 김치↔콩나물 strong', () => {
    expect(strongPairsOf('김치').some((n) => n.nm === '콩나물')).toBe(true);
  });
});

describe('TR-03 upgrade-only: 강등 없음·괴식 재유입 없음', () => {
  it('TR-03-1 떡+달걀(멥쌀떡|계란)은 strong 아님 — 추천 계속 차단(2차 사고 회귀)', () => {
    expect(strongPairsOf('멥쌀떡').some((n) => n.nm === '계란')).toBe(false);
    expect(strongPairsOf('계란').some((n) => n.nm === '멥쌀떡')).toBe(false);
  });
  it('TR-03-2 미역+당근 재유입 없음(메뉴명에 안 나오는 숨은 채소는 식판 strong 안 됨)', () => {
    expect(strongPairsOf('미역').some((n) => n.nm === '당근')).toBe(false);
  });
  it('TR-03-3 레시피+식판 둘 다 strong이면 이중 확증(달걀+두부 strong 유지)', () => {
    const e = pairEdge('달걀', '두부');
    expect(e?.grade).toBe('strong');
    expect(strongPairsOf('두부').some((n) => n.nm === '달걀')).toBe(true);
  });
  it('TR-03-4 식판 weak는 레시피 strong을 강등하지 않음(달걀+우유: tray weak이나 grade strong 유지)', () => {
    const e = pairEdge('달걀', '우유');
    if (e?.tray === 'weak') expect(e?.grade).toBe('strong');   // upgrade-only 보장
  });
});
