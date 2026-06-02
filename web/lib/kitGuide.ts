/**
 * lib/kitGuide.ts — 골고루 키트 식재료를 '어떤 음식에 넣을까' 조회.
 * 데이터: lib/kit-dish-matrix.json (scripts/gen-kit-matrix.py + LLM 정성채점 워크플로).
 *   scores[음식][식재료] = LLM 적합도 0~3(3=아주 자연스러움). cells = 레시피 동시출현(증거).
 * SSG(server)에서 import — 도감 상세 빌드타임에 식재료별 추천 음식 추출(클라 번들 X).
 */
import kit from './kit-dish-matrix.json';

type KitData = {
  dishes: { key: string; em: string; n: number }[];
  scores?: Record<string, Record<string, number>>;
  cells: Record<string, Record<string, number>>;
};
const K = kit as KitData;
const EM: Record<string, string> = Object.fromEntries(K.dishes.map((d) => [d.key, d.em]));

export type DishFit = { dish: string; em: string; score: number; count: number };
let IDX: Map<string, DishFit[]> | null = null;

function build(): Map<string, DishFit[]> {
  const m = new Map<string, DishFit[]>();
  const scores = K.scores || {};
  for (const [dish, ings] of Object.entries(scores)) {
    for (const [nm, score] of Object.entries(ings)) {
      const count = K.cells[dish]?.[nm] || 0;
      const arr = m.get(nm);
      const fit = { dish, em: EM[dish] || '🍽', score, count };
      if (arr) arr.push(fit); else m.set(nm, [fit]);
    }
  }
  for (const arr of m.values()) arr.sort((a, b) => b.score - a.score || b.count - a.count);
  return m;
}

/** 이 식재료를 넣기 좋은 음식 (LLM 점수 minScore 이상, 점수순). */
export function dishesForIngredient(nm: string, minScore = 2): DishFit[] {
  if (!IDX) IDX = build();
  return (IDX.get(nm) || []).filter((d) => d.score >= minScore);
}
