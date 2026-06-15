// 클라이언트 정적 JSON 모듈 캐시 (P0-5)
// ── /public 의 정적 JSON을 탭 생존 동안 1회만 네트워크 fetch + 파싱.
//    HTTP Cache-Control(next.config)은 이미 있으나, SPA 탭 이동·자녀 전환 시 발생하던
//    중복 요청·재파싱 자체를 제거한다(홈·care·report 공용).
// ⚠️ 클라이언트 전용. 서버측 food-graph 등은 lib/graphSource.ts 만 경유(여기로 옮기지 말 것).

// 홈 pool 타입과 동일(care Ingredient={nm,cat,grade}는 이 구조의 부분집합이라 둘 다 호환).
type LightIng = { nm: string; cat: string; grade: string; em: string; must_eat?: boolean; must_eat_tier?: 'core' | 'good'; must_eat_nutrient?: string };

let _ingPromise: Promise<LightIng[]> | null = null;
let _catMap: Record<string, string> | null = null;

/** ingredients-light.json 의 ingredients 배열 — 탭 생존 중 1회만 fetch. */
export function loadIngredientsLight(): Promise<LightIng[]> {
  if (!_ingPromise) {
    _ingPromise = fetch('/ingredients-light.json')
      .then((r) => r.json())
      .then((d) => (d.ingredients || []) as LightIng[])
      .catch(() => {
        _ingPromise = null;   // 실패 시 캐시 비워 다음 호출에서 재시도
        return [] as LightIng[];
      });
  }
  return _ingPromise;
}

/** 식재료명→카테고리 맵 (빗대기 영양평가용 catOf). 1회 구축 후 재사용. */
export async function loadCatMap(): Promise<Record<string, string>> {
  if (_catMap) return _catMap;
  const ings = await loadIngredientsLight();
  if (!ings.length) return {};   // 실패분은 캐시하지 않음
  _catMap = Object.fromEntries(ings.map((x) => [x.nm, x.cat]));
  return _catMap;
}
