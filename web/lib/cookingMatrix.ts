/**
 * lib/cookingMatrix.ts — 도감 '어떻게 줄까' 1회분 그램 + 영유아 안전 양념.
 * 1순위: 식재료별 × 조리방식별 실제 중앙값(lib/cooking-amounts.json · scripts/gen-cooking-amounts.py).
 *        → 당근 7g·상추 무침 37g처럼 식재료마다 다름(예전엔 카테고리 평균이라 잎채소가 다 같았음).
 * 폴백: 식재료별 표본(3개+)이 없을 때만 카테고리 평균(아래 COOKING_MATRIX).
 */
import COOKING_AMOUNTS from './cooking-amounts.json';
const PER_INGREDIENT = COOKING_AMOUNTS as Record<string, Record<string, { g: number; n: number }>>;

// 조리방식 → (매트릭스 카테고리 → 1회분 평균 g). 매운 절임·김치(잎채소 882g)는 영유아 부적합이라 제외.
export const COOKING_MATRIX: Record<string, Record<string, number>> = {
  '무침·나물': { 뿌리: 24.7, 잎채소: 46.4, 박과: 40.5, 콩가공: 41.2, 육류: 40.5, 해산물: 20.8, 해조류: 11.2, 곡물: 64.9, 버섯: 32.5 },
  '국·탕': { 뿌리: 23.8, 잎채소: 32.7, 박과: 18.9, 콩가공: 47.4, 육류: 38.8, 생선: 4.3, 해산물: 38.8, 알류: 22.4, 곡물: 21.3, 버섯: 22.5, 해조류: 2.8 },
  '볶음': { 뿌리: 22, 잎채소: 29.7, 박과: 26.6, 콩가공: 33.9, 육류: 50.4, 생선: 19.9, 해산물: 54.4, 해조류: 25.3, 알류: 54.6, 버섯: 23.7 },
  '전·부침': { 뿌리: 22.3, 잎채소: 22.9, 박과: 35.6, 콩가공: 57.5, 육류: 46.2, 생선: 35.8, 해산물: 42.5, 해조류: 21.9, 알류: 15.7, 버섯: 28 },
  '죽': { 뿌리: 15.4, 잎채소: 16.9, 박과: 38.5, 콩가공: 20.6, 육류: 31.9, 생선: 38.5, 해산물: 34.5, 알류: 44.3, 곡물: 38.6, 버섯: 26.4 },
  '찜': { 뿌리: 17.8, 잎채소: 15, 박과: 57.4, 콩가공: 27.9, 육류: 70.5, 생선: 48.1, 해산물: 63.6, 알류: 52 },
  '구이': { 뿌리: 36.8, 잎채소: 8.1, 박과: 24.6, 콩가공: 58.9, 육류: 58.5, 생선: 53.5, 알류: 12.6, 버섯: 8.2 },
  '조림': { 뿌리: 28.8, 잎채소: 19.3, 박과: 20.4, 콩가공: 70.9, 육류: 49.9, 생선: 51.9, 해산물: 32.5, 알류: 50.9, 버섯: 14.4 },
};

// 조리방식별 영유아 안전 양념(고춧가루·후추·생강 제외, 소량 원칙). 한국 양념 DNA = 마늘·파·간장·소금·참기름.
export const SEASONING_BY_METHOD: Record<string, string> = {
  '무침·나물': '참기름·통깨·소금 조금',
  '국·탕': '마늘·파로 국물 (된장·간장 소량)',
  '볶음': '마늘·간장·참기름 조금',
  '전·부침': '계란·밀가루 반죽 (소금 조금)',
  '죽': '소금 아주 조금',
  '찜': '간장·마늘 조금',
  '구이': '간장·참기름 조금',
  '조림': '간장·물엿 조금',
};

// 도감 식재료 cat → 매트릭스 카테고리. 과일·유제품·가공식품은 조리 매트릭스 대상 아님(생식·별도).
export const CAT_TO_MATRIX: Record<string, string> = {
  '곡물_탄수': '곡물', '곡류': '곡물', '콩_콩제품': '콩가공', '콩제품': '콩가공', '발효식품': '콩가공',
  '고기': '육류', '생선': '생선', '갑각_조개': '해산물', '계란': '알류',
  '잎채소': '잎채소', '뿌리채소': '뿌리', '십자화과': '잎채소', '열매채소': '박과', '기타채소': '박과',
  '해조류': '해조류', '버섯': '버섯',
};

/** 이 식재료를 어떤 조리방식으로 1회분 몇 g 줄까 — 식재료별 실측 우선, 없으면 카테고리 평균 폴백. */
export function cookingGuide(ingredient: string, cat: string, topN = 4): { method: string; g: number; season: string }[] {
  // ⚠️ 유제품·과일·가공식품·향신·유지·견과는 '한식 조리 매트릭스'(국·탕에 된장·간장 등) 대상이 아님 —
  // 생식·곁들임·양식이라 한식 양념을 붙이면 괴식이 된다(치즈 국·탕+된장 등). 실측(PER_INGREDIENT)에 잡혀도 제외.
  // (양식/중식/일식 조리 가이드는 별도 — 추후 cuisine 태깅으로 보강 예정)
  const NO_KOREAN_COOK = new Set(['유제품', '과일', '가공식품', '향신_허브', '유지류', '견과_씨앗']);
  if (NO_KOREAN_COOK.has(cat)) return [];

  // 1순위: 식재료별 × 조리방식별 실제 중앙값
  const per = PER_INGREDIENT[ingredient];
  if (per && Object.keys(per).length) {
    return Object.entries(per)
      .map(([method, v]) => ({ method, g: v.g, season: SEASONING_BY_METHOD[method] || '' }))
      .filter((x) => x.g > 0)
      .sort((a, b) => b.g - a.g)
      .slice(0, topN);
  }
  // 폴백: 카테고리 평균(식재료별 표본 부족)
  const mc = CAT_TO_MATRIX[cat];
  if (!mc) return [];
  return Object.entries(COOKING_MATRIX)
    .map(([method, m]) => ({ method, g: m[mc] ?? 0, season: SEASONING_BY_METHOD[method] }))
    .filter((x) => x.g > 0)
    .sort((a, b) => b.g - a.g)
    .slice(0, topN);
}
