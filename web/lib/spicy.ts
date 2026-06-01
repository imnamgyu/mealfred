/**
 * lib/spicy.ts — 매운 음식/식재료 판정 (순수·client-safe, fs 없음).
 * (lib/ingredients.ts는 fs를 써서 클라 번들에 못 들어가므로 분리. ingredients.ts가 이걸 re-export.)
 */

/** 영유아 부적합 매운 음식인가 — 레시피/메뉴 추천에서 제외. (백김치·물김치 등 안 매운 류는 허용) */
export function isSpicyDish(name: string): boolean {
  const n = name || '';
  if (/백김치|물김치|나박김치|동치미/.test(n)) return false;
  return /매운|매콤|얼큰|칼칼|고추장|고춧가루|고추기름|청양|땡초|불닭|마라|짬뽕|떡볶이|낙지볶음|오징어볶음|제육|김치|와사비|겨자|페페론|핫소스|타바스코/.test(n);
}

/** 영유아 부적합 매운 '식재료'인가 — 골고루 키트·시도식재료 추천에서 제외. 단고추류(파프리카·피망)는 허용. */
export function isSpicyIngredient(name: string): boolean {
  const n = (name || '').replace(/\s/g, '');
  if (/파프리카|피망|단고추/.test(n)) return false;   // 안 매운 단고추류 허용
  if (/고추/.test(n)) return true;                    // 생·풋·홍·청양고추 등 (isSpicyDish가 못 잡던 생'고추')
  return isSpicyDish(n);                               // 김치·고추장·고춧가루·와사비·겨자 등 위임(백김치·물김치는 허용)
}
