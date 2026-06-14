/**
 * lib/comboMatrix.ts — 괴식 조합 검증기 (WBS v2-하이브리드 EPIC A · A-03)
 *
 * '잘 먹는 음식 + 결핍 식재료' 조합을 점수화해 괴식을 막는다(인계서 A·최우선·6/8 괴식 교훈).
 *   · scores[음식][식재료] = LLM 정성채점 0~3(3=아주 자연스러움) — 1순위 근거
 *   · 없으면 food-graph pair strength(1~3·레시피 동시출현 증거)로 폴백
 *   · 그래도 없으면 cells(동시출현 count>0)는 '약신호'라 score=1(임계 미만 → 보수적 금지)
 *   · 어디에도 없으면 0 — 미수록 조합은 '통과'가 아니라 '금지'(보수적 기본값·risk #1 완화)
 *
 * 실증: scores['미역국']['당근']=1(괴식·차단), scores['볶음밥']['당근']=3·국=2(통과).
 * 전부 순수 함수 — fs/HTTP 불사용(정적 JSON import). LLM이 조합을 지어내게 두지 않는다.
 */
import { getDishMatrix } from './graphSource';   // ⭐ JSON 직접 import 격리(handoff §4)
import { strongPairsOf } from './foodGraph';

type KitData = {
  scores?: Record<string, Record<string, number>>;   // 음식→식재료 정성채점 0~3
  cells: Record<string, Record<string, number>>;       // 음식→식재료 레시피 동시출현 count
};
const K = (): KitData => getDishMatrix() as KitData;   // ⭐ 호출 시점에 읽어 SQL warm 반영(모듈 로드 캡처 X)

export type ComboSource = 'matrix' | 'cells' | 'pair' | 'none';
export type ComboScore = { score: number; source: ComboSource };

// ⭐ borderline LLM 점수(2) 실증 게이트 — 정성채점 2는 실제 레시피 동시출현(cells)이 받쳐줄 때만 인정.
//   떡+달걀(score 2·cells 4)처럼 LLM은 '괜찮다' 했지만 실데이터상 거의 안 쓰이는 조합 차단(이사님: 실제 식단 공통출현으로 판단).
//   score 3(LLM 확신)은 그대로 신뢰·score 1은 어차피 차단. 국+당근(2·cells49)·볶음밥+당근(3)은 유지.
const CELLS_MIN = 8;

/** 음식×식재료 조합의 정합도(0~3). matrix(정성채점·cells 실증 게이트) → pair(강한 궁합) → cells(약신호) → none. */
export function scoreCombo(dish: string, ing: string): ComboScore {
  const k = K();
  const m = k.scores?.[dish]?.[ing];
  if (typeof m === 'number') {
    const cells = k.cells?.[dish]?.[ing] || 0;
    if (m === 2 && cells < CELLS_MIN) return { score: 1, source: 'matrix' };   // borderline + 실동시출현 약함 → 강등(차단)
    return { score: m, source: 'matrix' };                                      // score 3(확신)·실증된 2는 그대로
  }
  const pair = strongPairsOf(ing).find((n) => n.nm === dish);   // 강한 궁합만(약신호 s=1 차단)
  if (pair) return { score: Math.max(0, Math.min(3, pair.strength)), source: 'pair' };
  const c = k.cells?.[dish]?.[ing];
  if (typeof c === 'number' && c > 0) return { score: 1, source: 'cells' };  // 약신호 = 임계 미만(보수적 금지)
  return { score: 0, source: 'none' };                                       // 미수록 = 금지
}

/** 조합이 임계(기본 2) 이상이면 OK. threshold=2 → score 1(미역국+당근) 차단·score 2,3 통과. */
export function isComboOk(dish: string, ing: string, threshold = 2): boolean {
  return scoreCombo(dish, ing).score >= threshold;
}
