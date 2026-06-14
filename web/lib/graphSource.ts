/**
 * lib/graphSource.ts — 추천 네트워크 데이터의 *단일 읽기 경로* (서버 전용).
 *
 * 왜 있나(coaching-db-migration-handoff §4):
 *   사촌·궁합·음식×식재료·영양 데이터가 머지않아 정적 JSON → SQL로 전환된다.
 *   "추천 로직은 그대로" 두고 "데이터를 *어디서* 읽는가"만 이 한 겹으로 격리해 무중단 전환을 대비한다.
 *   소비 함수(strongPairsOf·scoreCombo·rankIngredients·neighborsOf·nutrientsOf…)는 *byte 무변경* —
 *   여기 내부만 JSON → (야간 스냅샷 JSON ↔ SQL L1 ↔ 캐시) 로 바뀐다.
 *
 * 지금(격리 준비 단계): 그 안에서 기존 JSON을 그대로 import 한다. 반환 shape = 현 JSON shape(= 두 세션의 접점 계약).
 * 규칙(handoff): 이 5개 데이터는 *여기서만* 읽는다 — 엔진 모듈은 직접 import 하지 말 것(전환 시 누락 방지).
 *   (클라 fetch·SSG 동기 import는 /public 스냅샷을 그대로 읽으므로 무변경 — 격리 대상 아님.)
 */
import foodGraphJson from './food-graph.json';
import dishMatrixJson from './kit-dish-matrix.json';
import nutrientMapJson from './nutrient-map.generated.json';
import ingredientsLightJson from '../public/ingredients-light.json';
import recipeFreqJson from '../public/ingredient-recipes.json';

// 반환은 의도적으로 `unknown` — 각 소비 모듈이 자기 도메인 타입으로 cast(현행 그대로).
// SQL 전환 시 내부 구현만 바뀌고 이 함수 시그니처(= 접점 계약)는 고정한다.

/** food-graph.json 의 edges 배열(궁합 pair·사촌 bridge·식판 tray). foodGraph.ts 가 RawEdge[]로 cast. */
export function getEdges(): unknown {
  return (foodGraphJson as { edges: unknown[] }).edges;
}

/** kit-dish-matrix.json (음식×식재료 정성채점 scores·동시출현 cells·dishes). comboMatrix/kitGuide 가 KitData로 cast. */
export function getDishMatrix(): unknown {
  return dishMatrixJson;
}

/** nutrient-map.generated.json (농진청 정밀 영양맵). nutrition.ts 가 Record로 cast. */
export function getNutrientMap(): unknown {
  return nutrientMapJson;
}

/** ingredients-light.json (도감 경량본: nm·cat…). affinity VOCAB / 크론 catMap 이 cast. */
export function getIngredientsLight(): unknown {
  return ingredientsLightJson;
}

/** ingredient-recipes.json (또래 급식 빈도: 식재료 → 실존 음식). 크론 freqMap 이 cast. */
export function getRecipeFreq(): unknown {
  return recipeFreqJson;
}
