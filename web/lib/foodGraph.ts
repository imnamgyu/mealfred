/**
 * lib/foodGraph.ts — 음식↔식재료 궁합 네트워크(무방향) 조회.
 * 데이터: lib/food-graph.json (scripts/gen-food-graph.py 생성)
 *   - pair(궁합/곁들임): 우리 레시피 코퍼스 동시출현 근거. basis="같이 쓰는 레시피 N개"
 *   - bridge(닮음/사촌): 맛·식감 닮은 대체 사촌(고신뢰 큐레이션). basis="맛·식감이 닮은 사촌"
 * SSG(server)에서만 import — 빌드타임에 식재료별 이웃을 뽑아 클라(PersonalBridge)로 prop 전달.
 * (51KB 그래프를 클라 번들에 싣지 않으려는 의도)
 */
import { getEdges, registerGraphInvalidator } from './graphSource';   // ⭐ 데이터 출처는 graphSource 한 곳(handoff §4·#2)

export type EdgeKind = 'pair' | 'bridge';
export type PairGrade = 'strong' | 'medium' | 'weak';
// lift/grade/verified는 lift 재설계(gen-food-graph.py)가 영속하는 신규 필드 — 현 JSON엔 없을 수 있어 전부 optional(하위호환).
// tray/src = NEIS 식판 단위 공통출현(같은 끼니에 함께 차려짐) 축. tray=식판 등급, src='tray'면 레시피엔 없고 식판 근거로만 추가된 edge.
type RawEdge = { a: string; b: string; kind: EdgeKind; strength: number; basis: string; count?: number; lift?: number; grade?: PairGrade; verified?: boolean; tray?: PairGrade; src?: string };
export type Neighbor = { nm: string; kind: EdgeKind; strength: number; basis: string; count?: number; lift?: number; grade?: PairGrade; verified?: boolean; tray?: PairGrade; src?: string };

// ⭐ 약신호 곁들임 차단 임계(떡+달걀 괴식 사고) — pair는 이 강도 이상만 추천에 사용. comboMatrix dish×식재료 임계(2)와 통일.
export const PAIR_MIN_STRENGTH = 2;

let ADJ: Map<string, Neighbor[]> | null = null;
registerGraphInvalidator(() => { ADJ = null; });   // ⭐ SQL warm 시 인접맵 무효화 → 다음 호출이 SQL 엣지로 재구성

function build(): Map<string, Neighbor[]> {
  const EDGES = getEdges() as RawEdge[];   // ⭐ 빌드 시점에 읽어 warm 반영(모듈 로드 캡처 X). warm 전엔 JSON 스냅샷.
  const m = new Map<string, Neighbor[]>();
  const push = (k: string, n: Neighbor) => { const arr = m.get(k); if (arr) arr.push(n); else m.set(k, [n]); };
  for (const e of EDGES) {
    push(e.a, { nm: e.b, kind: e.kind, strength: e.strength, basis: e.basis, count: e.count, lift: e.lift, grade: e.grade, verified: e.verified, tray: e.tray, src: e.src });
    push(e.b, { nm: e.a, kind: e.kind, strength: e.strength, basis: e.basis, count: e.count, lift: e.lift, grade: e.grade, verified: e.verified, tray: e.tray, src: e.src });
  }
  return m;
}

/** 한 식재료의 이웃(궁합·사촌). bridge(닮음) 먼저 → grade(strong>medium>weak) → strength↓ → count↓ */
export function neighborsOf(nm: string): Neighbor[] {
  if (!ADJ) ADJ = build();
  const list = ADJ.get(nm) || [];
  const gradeRank = (g?: PairGrade) => (g === 'strong' ? 3 : g === 'medium' ? 2 : g === 'weak' ? 1 : 0);
  return [...list].sort((a, b) =>
    a.kind === b.kind
      ? (gradeRank(b.grade) - gradeRank(a.grade)) || (b.strength - a.strength) || ((b.count || 0) - (a.count || 0))
      : (a.kind === 'bridge' ? -1 : 1),
  );
}

/** ⭐ 강한 궁합(곁들임 추천에 쓸 pair만) — grade가 있으면 'strong'만, 없으면(lift 재생성 전) strength≥임계 폴백.
 *  약신호 s=1(떡+달걀 lift 0.72 등)을 추천 경로에서 일괄 차단. 모든 소비자(coachRecos·coachMaterials·comboMatrix·comboGuard)가 이 헬퍼로 일원화. */
export function strongPairsOf(nm: string): Neighbor[] {
  return neighborsOf(nm).filter((n) => n.kind === 'pair' && (n.grade ? n.grade === 'strong' : n.strength >= PAIR_MIN_STRENGTH));
}

/** ⭐ 검증된 사촌(푸드체이닝 chain 추천에 쓸 bridge만) — verified 필드가 있으면 true만, 없으면(재생성 전) 전부(수기 시드 고신뢰). */
export function verifiedCousinsOf(nm: string): Neighbor[] {
  return neighborsOf(nm).filter((n) => n.kind === 'bridge' && (n.verified === undefined || n.verified === true));
}
