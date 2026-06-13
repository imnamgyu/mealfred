/**
 * lib/comboGuard.ts — 괴식 조합 점검·차단 게이트 (WBS EPIC I · I-04).
 *
 * 인계서 A(최우선·괴식): '잘 먹는 음식 + 결핍 식재료' 조합을 점수화해 낮으면 금지.
 *   실증 괴식 = '미역국에 당근'(kit-dish-matrix scores['미역국']['당근']=1 · cells=2).
 *   LLM이 조합을 지어내게 두지 않도록, **검증 통과 조합만 LLM 후보로 넘기는 순수 게이트**.
 *
 * 두 경로(시그니처로 경계 강제):
 *   · dish × ingredient  → kit-dish-matrix scores(0~3)만(food-graph 노드는 식재료라 dish는 없음).
 *   · ingredient × ingredient → food-graph pair만(지어낸 궁합 금지·테이블 근거만).
 *
 * 임계 = 2. score>=2 통과(볶음밥3·카레3·국2), score<2·미수록(undefined)은 **금지**(보수적 기본값).
 * 전부 순수 함수 — fs/HTTP·LLM 불사용(정적 JSON import). kit-dish-matrix·food-graph는 read만(무변경).
 */
import { dishesForIngredient } from './kitGuide';
import { neighborsOf } from './foodGraph';

export const COMBO_THRESHOLD = 2;

export type DishFit = { score: number; count: number; ok: boolean };

/**
 * 음식×식재료 정합도 — kit-dish-matrix scores[dish][ing] 조회.
 * ok = score>=2(OK: 볶음밥/카레/비빔밥/덮밥+당근=3, 국+당근=2). 미수록·score<2(미역국=1)는 ok=false.
 * dish/ing 경계: 여기는 '음식'+'식재료'만(식재료×식재료는 ingredientPairFit).
 */
export function dishIngredientFit(dish: string, ing: string): DishFit {
  if (!dish || !ing || !dish.trim() || !ing.trim()) return { score: 0, count: 0, ok: false };
  // kit-dish-matrix는 kitGuide.dishesForIngredient(minScore=0)로 접근 — 식재료의 전 음식 점수.
  const hit = dishesForIngredient(ing, 0).find((d) => d.dish === dish);
  if (!hit) return { score: 0, count: 0, ok: false };   // 미수록 = 금지(통과로 위장 금지)
  return { score: hit.score, count: hit.count, ok: hit.score >= COMBO_THRESHOLD };
}

export type PairFit = { ok: boolean; basis?: string };

/**
 * 식재료×식재료 궁합 — food-graph pair(레시피 동시출현 근거)에만 의존. 지어낸 궁합 금지.
 * 무방향(food-graph) → a,b 순서 무관. dish를 넣으면 food-graph 노드가 아니라 ok=false(경계 강제).
 */
export function ingredientPairFit(a: string, b: string): PairFit {
  if (!a || !b || !a.trim() || !b.trim()) return { ok: false };
  const edge = neighborsOf(a).find((n) => n.kind === 'pair' && n.nm === b);
  return edge ? { ok: true, basis: edge.basis } : { ok: false };
}

/**
 * LLM 후보 화이트리스트 — dishIngredientFit ok(score>=2)인 (음식,식재료) 조합만 반환.
 * 괴식(미역국+당근=1)은 제외. 빈 결과 허용(조합 강요 금지).
 */
export function validCombos(dishes: string[], ings: string[]): { dish: string; ing: string }[] {
  const out: { dish: string; ing: string }[] = [];
  for (const dish of dishes || []) {
    for (const ing of ings || []) {
      if (dishIngredientFit(dish, ing).ok) out.push({ dish, ing });
    }
  }
  return out;
}
