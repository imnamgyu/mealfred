/**
 * lib/foodGraph.ts — 음식↔식재료 궁합 네트워크(무방향) 조회.
 * 데이터: lib/food-graph.json (scripts/gen-food-graph.py 생성)
 *   - pair(궁합/곁들임): 우리 레시피 코퍼스 동시출현 근거. basis="같이 쓰는 레시피 N개"
 *   - bridge(닮음/사촌): 맛·식감 닮은 대체 사촌(고신뢰 큐레이션). basis="맛·식감이 닮은 사촌"
 * SSG(server)에서만 import — 빌드타임에 식재료별 이웃을 뽑아 클라(PersonalBridge)로 prop 전달.
 * (51KB 그래프를 클라 번들에 싣지 않으려는 의도)
 */
import graph from './food-graph.json';

export type EdgeKind = 'pair' | 'bridge';
type RawEdge = { a: string; b: string; kind: EdgeKind; strength: number; basis: string; count?: number };
export type Neighbor = { nm: string; kind: EdgeKind; strength: number; basis: string; count?: number };

const EDGES = (graph as { edges: RawEdge[] }).edges;
let ADJ: Map<string, Neighbor[]> | null = null;

function build(): Map<string, Neighbor[]> {
  const m = new Map<string, Neighbor[]>();
  const push = (k: string, n: Neighbor) => { const arr = m.get(k); if (arr) arr.push(n); else m.set(k, [n]); };
  for (const e of EDGES) {
    push(e.a, { nm: e.b, kind: e.kind, strength: e.strength, basis: e.basis, count: e.count });
    push(e.b, { nm: e.a, kind: e.kind, strength: e.strength, basis: e.basis, count: e.count });
  }
  return m;
}

/** 한 식재료의 이웃(궁합·사촌). bridge(닮음) 먼저 → strength↓ → count↓ */
export function neighborsOf(nm: string): Neighbor[] {
  if (!ADJ) ADJ = build();
  const list = ADJ.get(nm) || [];
  return [...list].sort((a, b) =>
    a.kind === b.kind
      ? (b.strength - a.strength) || ((b.count || 0) - (a.count || 0))
      : (a.kind === 'bridge' ? -1 : 1),
  );
}
