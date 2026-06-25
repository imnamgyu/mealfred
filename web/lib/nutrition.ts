/**
 * 영양 진단 로직 (M6) — care 식사 기록 → 신호등·진단
 *
 * 한계: 식재료 존재 여부 기반 (정량 g 아님).
 * "며칠 동안 이 영양소를 커버하는 식재료를 먹었나"로 신호등 산출.
 */

// 식재료 → 커버하는 영양소 (daycare-eval NUTRI_MAP 확장본 재사용)
export const NUTRI_MAP: Record<string, string[]> = {
  // 도감 신규 38종(R1 보강 — 영양 우수 발굴·검증)
  '퀴노아': ['단백질', '철', '마그네슘', '식이섬유', '엽산'],
  '아마란스': ['단백질', '칼슘', '철', '식이섬유', '마그네슘'],
  '메밀쌀': ['단백질', '식이섬유', '마그네슘', '철', '칼륨'],
  '호박씨': ['마그네슘', '아연', '철', '단백질', '엽산'],
  '치아씨드': ['오메가3', '식이섬유', '칼슘', '단백질', '철'],
  '피스타치오': ['단백질', '식이섬유', '비타민B6', '칼륨', '마그네슘'],
  '동부콩': ['단백질', '식이섬유', '철', '엽산', '칼륨'],
  '아스파라거스': ['엽산', '비타민K', '식이섬유', '비타민C', '칼륨'],
  '셀러리': ['비타민K', '칼륨', '식이섬유', '엽산', '비타민C'],
  '곤드레': ['식이섬유', '칼슘', '철', '베타카로틴', '단백질'],
  '두릅': ['단백질', '식이섬유', '비타민C', '엽산', '비타민A'],
  '비름나물': ['철', '칼슘', '비타민A', '식이섬유', '엽산'],
  '콜라비': ['비타민C', '식이섬유', '칼륨', '엽산', '비타민B6'],
  '파스닙': ['식이섬유', '엽산', '비타민C', '칼륨'],
  '방울양배추': ['비타민C', '비타민K', '엽산', '식이섬유', '칼륨'],
  '오크라': ['식이섬유', '엽산', '비타민C', '마그네슘', '칼륨'],
  '돼지감자': ['식이섬유', '칼륨', '철', '인'],
  '고구마순': ['식이섬유', '칼슘', '비타민C', '칼륨', '엽산'],
  '자두': ['식이섬유', '칼륨', '비타민C', '안토시아닌'],
  '살구': ['베타카로틴', '비타민A', '식이섬유', '칼륨', '비타민C'],
  '무화과': ['식이섬유', '칼륨', '칼슘', '마그네슘'],
  '망고': ['비타민C', '베타카로틴', '비타민A', '식이섬유', '엽산'],
  '체리': ['식이섬유', '비타민C', '칼륨', '안토시아닌'],
  '석류': ['비타민C', '엽산', '칼륨', '식이섬유', '폴리페놀'],
  '라즈베리': ['식이섬유', '비타민C', '망간', '엽산', '칼륨'],
  '목이버섯': ['식이섬유', '철', '칼륨', '칼슘', '마그네슘'],
  '만가닥버섯': ['식이섬유', '나이아신', '리보플라빈', '칼륨', '엽산'],
  '잎새버섯': ['식이섬유', '베타글루칸', '나이아신', '리보플라빈', '칼륨'],
  '모자반': ['식이섬유', '칼슘', '철', '요오드', '마그네슘'],
  '광어': ['단백질', '셀레늄', '비타민B12', '인', '칼륨'],
  '우럭': ['단백질', '셀레늄', '비타민D', '비타민B12', '인'],
  '숭어': ['단백질', '오메가3', '비타민D', '셀레늄', '비타민B12'],
  '농어': ['단백질', '비타민D', '셀레늄', '인', '칼륨'],
  '양고기': ['단백질', '철', '아연', '비타민B12', '인'],
  '두유': ['단백질', '칼슘', '이소플라본', '철'],
  '닭간': ['철', '엽산', '비타민B12', '비타민A', '단백질'],
  '칠면조고기': ['단백질', '셀레늄', '비타민B6', '아연', '철'],
  '당근': ['비타민A', '비타민K', '식이섬유'], '시금치': ['철', '엽산', '비타민K', '비타민A', '마그네슘'],
  '근대': ['철', '엽산', '비타민K'], '계란': ['콜린', '비타민D', '단백질', '비타민B12', '셀레늄'],
  '달걀': ['콜린', '비타민D', '단백질', '비타민B12', '셀레늄'],
  '연어': ['비타민D', '오메가3', '단백질', '셀레늄'], '고등어': ['오메가3', '비타민D', '셀레늄'],
  '두부': ['칼슘', '단백질', '철', '마그네슘'], '우유': ['칼슘', '비타민D', '단백질', '인', '비타민B2'],
  '치즈': ['칼슘', '단백질', '비타민A'], '소고기': ['철', '아연', '단백질', '비타민B12', '니아신'],
  '돼지고기': ['비타민B1', '단백질', '아연', '인'], '닭고기': ['단백질', '니아신', '비타민B6', '셀레늄'],
  '미역': ['요오드', '칼슘', '식이섬유'], '김': ['철', '요오드', '비타민A'], '다시마': ['요오드', '칼슘'],
  '브로콜리': ['비타민C', '비타민K', '엽산', '식이섬유'], '토마토': ['비타민C', '칼륨'],
  '고구마': ['비타민A', '비타민C', '식이섬유', '칼륨'], '감자': ['비타민C', '칼륨', '비타민B6'],
  '사과': ['비타민C', '식이섬유'], '바나나': ['칼륨', '마그네슘', '비타민B6'],
  '블루베리': ['비타민C', '식이섬유'], '호두': ['오메가3', '마그네슘', '비타민E'],
  '아몬드': ['비타민E', '마그네슘', '칼슘'], '양파': ['비타민C', '식이섬유'],
  '대파': ['비타민A', '비타민C'], '파': ['비타민A', '비타민C'], '마늘': ['셀레늄', '비타민B6'],
  '콩나물': ['비타민C', '엽산', '식이섬유'], '배추': ['비타민C', '엽산', '식이섬유'],
  '양배추': ['비타민C', '비타민K', '식이섬유'], '오이': ['비타민K', '칼륨'], '호박': ['비타민A', '비타민C'],
  '애호박': ['비타민A', '비타민C'], '멸치': ['칼슘', '단백질', '비타민D'], '갈치': ['단백질', '비타민D'],
  '새우': ['셀레늄', '단백질', '아연'], '귤': ['비타민C', '엽산'], '딸기': ['비타민C', '엽산', '식이섬유'],
  '키위': ['비타민C', '비타민K', '칼륨'], '현미': ['식이섬유', '마그네슘', '비타민B1'],
  '귀리': ['식이섬유', '철', '마그네슘'], '쌀': ['탄수화물', '비타민B1'], '잡곡': ['식이섬유', '마그네슘'],
  '된장': ['단백질', '철', '칼륨'], '요거트': ['칼슘', '단백질', '비타민B2'], '요구르트': ['칼슘', '단백질'],
  '파프리카': ['비타민C', '비타민A'], '피망': ['비타민C', '비타민A'], '가지': ['식이섬유', '칼륨'],
  '버섯': ['비타민D', '식이섬유'], '표고버섯': ['비타민D', '식이섬유'], '느타리': ['식이섬유', '단백질'],
  '메추리알': ['단백질', '비타민B12', '철'], '오징어': ['단백질', '셀레늄'], '바지락': ['철', '비타민B12'],
  '콩': ['단백질', '철', '식이섬유'], '검은콩': ['단백질', '철', '안토시아닌'], '땅콩': ['단백질', '비타민E'],
  '무': ['비타민C'], '김치': ['비타민C', '식이섬유'], '명태': ['단백질', '비타민D'],
  '어묵': ['단백질'], '소시지': ['단백질'], '만두': ['단백질'], '고추': ['비타민C'],
  '옥수수': ['식이섬유', '비타민B1'], '당면': [], '빵': ['탄수화물'],
  // ── /mealfred-food-mapping 커버리지 패스: 풀 식재료 정확 등재 (시드→검수) ──
  '가자미': ['단백질', '비타민D', '셀레늄'], '대구': ['단백질', '비타민B12', '셀레늄'],
  '삼치': ['오메가3', '단백질', '비타민D'], '낙지': ['단백질', '철', '셀레늄'],
  '굴': ['아연', '비타민B12', '철'], '게': ['단백질', '아연', '셀레늄'],
  '홍합': ['철', '비타민B12', '단백질'], '조개': ['철', '비타민B12', '단백질'],
  // 2026-06-13 도감 +6 (Part C 승인) — 농진청 v10.4 covers 기반
  '조기': ['단백질', '비타민D', '비타민B12'], '꽁치': ['오메가3', '단백질', '철'], '도미': ['단백질', '인', '비타민B2'], '민어': ['단백질', '인'], '관자': ['단백질', '아연', '비타민B12'], '낫토': ['단백질', '식이섬유', '칼슘', '철'],
  '오리고기': ['단백질', '철', '비타민B12'], '햄': ['단백질'], '베이컨': ['단백질'],
  '버터': ['비타민A'], '크림': ['칼슘', '비타민A'],
  '느타리버섯': ['식이섬유', '단백질', '비타민D'], '팽이버섯': ['식이섬유', '비타민B1'], '양송이버섯': ['식이섬유', '셀레늄', '비타민D'],
  '숙주나물': ['비타민C', '엽산', '식이섬유'],
  '부추': ['비타민A', '비타민C', '비타민K'], '미나리': ['비타민A', '비타민C', '식이섬유'], '청경채': ['비타민A', '비타민C', '칼슘'],
  '상추': ['비타민A', '비타민K', '엽산'], '양상추': ['비타민K', '엽산'],
  '연근': ['비타민C', '식이섬유', '칼륨'], '우엉': ['식이섬유', '칼륨'], '도라지': ['식이섬유', '칼슘'],
  '포도': ['비타민C', '칼륨'], '배': ['식이섬유', '비타민C'], '수박': ['비타민A', '비타민C', '칼륨'],
  '복숭아': ['비타민C', '식이섬유'], '오렌지': ['비타민C', '엽산', '칼륨'], '감': ['비타민A', '비타민C', '식이섬유'],
  '참외': ['비타민C', '칼륨'], '멜론': ['비타민C', '칼륨'],
  '보리': ['식이섬유', '마그네슘', '비타민B1'], '국수': ['탄수화물'], '찹쌀': ['탄수화물'], '시리얼': ['철', '식이섬유'],
  '매생이': ['철', '칼슘', '요오드'], '파래': ['철', '요오드', '비타민A'],
  '참깨': ['칼슘', '마그네슘', '철'], '들깨': ['오메가3', '마그네슘', '비타민E'], '해바라기씨': ['비타민E', '마그네슘'],
  // 유지류·견과 (비타민E·필수지방산 — 카테고리 미분류라 직접 등재)
  '올리브유': ['비타민E', '리놀레산'], '참기름': ['비타민E', '리놀레산'], '들기름': ['오메가3', '비타민E', 'α-리놀렌산'],
  '식용유': ['비타민E', '리놀레산'], '콩기름': ['비타민E', '리놀레산', 'α-리놀렌산'], '카놀라유': ['비타민E', '리놀레산', 'α-리놀렌산'], '포도씨유': ['비타민E', '리놀레산'],
  '아보카도': ['비타민E', '식이섬유', '칼륨'], '잣': ['비타민E', '마그네슘', '망간'], '캐슈넛': ['비타민E', '마그네슘', '구리'],
};

// ── 빗대기(범주 근사) 영양 ────────────────────────────────────
// NUTRI_MAP에 없는 식재료는 풀 카테고리(ingredients-light.json의 cat)의 대표 영양 프로필로 근사.
// 예: 오리고기(고기)·곱창(고기) → 고기 프로필. 정확값은 아니지만 '모름'으로 비우지 않는다.
export const CATEGORY_NUTRI: Record<string, string[]> = {
  '고기': ['단백질', '철', '아연', '비타민B12', '판토텐산', '비오틴', '크롬', '에너지', '리놀레산'],
  '생선': ['단백질', '오메가3', '비타민D', '셀레늄', '구리', '에너지'],
  '갑각_조개': ['단백질', '아연', '비타민B12', '철', '구리', '셀레늄'],
  '계란': ['단백질', '비타민B12', '비타민D', '비타민E', '판토텐산', '비오틴', '콜린', '리놀레산'],
  '유제품': ['칼슘', '단백질', '비타민D', '판토텐산', '수분', '에너지'],
  '콩_콩제품': ['단백질', '철', '식이섬유', '칼슘', '구리', '망간', '몰리브덴', '판토텐산', 'α-리놀렌산', '리놀레산'],
  '발효식품': ['단백질', '식이섬유'],
  '곡물_탄수': ['식이섬유', '마그네슘', '망간', '크롬', '에너지', '리놀레산'],
  '잎채소': ['비타민A', '비타민C', '엽산', '비타민K', '비타민E', '망간', 'α-리놀렌산'],
  '뿌리채소': ['비타민A', '식이섬유', '칼륨'],
  '열매채소': ['비타민C', '비타민A'],
  '기타채소': ['비타민C', '식이섬유', '크롬'],
  '해조류': ['요오드', '칼슘', '식이섬유'],
  '버섯': ['비타민D', '식이섬유', '판토텐산', '셀레늄'],
  '과일': ['비타민C', '식이섬유', '칼륨', '수분'],
  '견과_씨앗': ['오메가3', '마그네슘', '단백질', '비타민E', '구리', '망간', '몰리브덴', '비오틴', '리놀레산', 'α-리놀렌산'],
  '가공식품': ['단백질', '에너지', '리놀레산'],
  '향신_허브': [],
  '유지류': ['비타민E', '리놀레산', '에너지'],
};
// 풀 카테고리 → 8식품군 (다양성 빗대기). 계란=고기에 합침 · 생선/해산물=별도 군(이사님 지시)
export const CATEGORY_GROUP: Record<string, string> = {
  '곡물_탄수': '곡물', '콩_콩제품': '콩류', '발효식품': '콩류', '유제품': '유제품',
  '고기': '고기·계란', '계란': '고기·계란', '가공식품': '고기·계란',
  '생선': '생선·해산물', '갑각_조개': '생선·해산물',
  '잎채소': '비타민A채소', '뿌리채소': '비타민A채소', '십자화과': '비타민A채소',
  '열매채소': '기타채소', '기타채소': '기타채소', '해조류': '기타채소', '버섯': '기타채소', '과일': '과일',
  '곡류': '곡물', '콩제품': '콩류',   // foods 도감 cat 보완(8 식품군 필터 정합)
};

type CatOf = (ing: string) => string | undefined;

// 농진청 10.4 정밀맵(gen-nutrient-map.py 생성) — 1일 KDRI 15%↑ 공급 영양소. 빗대기를 대체하는 1차 출처.
import { getNutrientMap } from './graphSource';   // ⭐ JSON 직접 import 격리(handoff §4)
import { isoWeekKey } from './progress';
const GEN_NUTRI = getNutrientMap() as Record<string, { nong: string; conf: string; n: string[] }>;
export function generatedNutrientMap(): Record<string, { nong: string; conf: string; n: string[] }> { return GEN_NUTRI; }

/** 식재료 → 커버 영양소.
 *  ① 농진청 정밀맵 ∪ NUTRI_MAP(둘 다 정확 출처) 우선. ② 둘 다 없으면 카테고리 빗대기(CATEGORY_NUTRI) 폴백.
 *  → 데이터 있는 식재료는 농진청 근거로 정확, 미수록만 빗대기 안전망. (영양 누락 최소화) */
export function nutrientsOf(ing: string, catOf?: CatOf): string[] {
  const gen = GEN_NUTRI[ing]?.n || [];
  const direct = NUTRI_MAP[ing] || [];
  if (gen.length || direct.length) return [...new Set([...gen, ...direct])];
  const cat = catOf?.(ing);
  const byCat = (cat && CATEGORY_NUTRI[cat]) || [];
  return byCat.length ? [...new Set(byCat)] : [];
}

// 핵심 추적 영양소 (신호등 표시 — 영유아 결핍 흔한 순)
// 비타민E 제외: 호두·아몬드만 커버라 거의 항상 빨강 = 노이즈
export const KEY_NUTRIENTS = [
  '단백질', '칼슘', '철', '비타민A', '비타민C', '비타민D', '오메가3', '식이섬유',
  '아연', '엽산', '비타민B12', '요오드', '칼륨', '마그네슘', '비타민K',
];

// 카테고리별 필수·권장 식재료 (부족 시 추천)
export const NUTRIENT_FOODS: Record<string, string[]> = {
  '단백질': ['소고기', '닭고기', '두부', '달걀', '생선'],
  '칼슘': ['우유', '치즈', '멸치', '두부', '요거트'],
  '철': ['소고기', '시금치', '검은콩', '달걀'],
  '비타민A': ['당근', '고구마', '시금치', '호박'],
  '비타민C': ['파프리카', '브로콜리', '딸기', '귤', '토마토'],
  '비타민D': ['연어', '달걀', '표고버섯', '고등어'],
  '오메가3': ['연어', '고등어', '호두'],
  '식이섬유': ['고구마', '현미', '브로콜리', '귀리', '사과'],
  '아연': ['소고기', '새우', '닭고기'],
  '엽산': ['시금치', '브로콜리', '딸기'],
  '비타민B12': ['소고기', '달걀', '생선'],
  '요오드': ['미역', '김', '다시마'],
  '칼륨': ['바나나', '감자', '토마토'],
  '마그네슘': ['시금치', '현미', '호두', '바나나'],
  '비타민K': ['시금치', '브로콜리', '양배추'],
  '비타민E': ['아몬드', '호두', '시금치'],
};

// ── 식품군 다양성 신호등 (충분/조금부족/부족) ──────────────────────────────
// 기준: "기록일 중 그 식품군이 며칠 등장했나" → 주간 추정 빈도(weeklyEst). 정량 측정 불가 → 빈도 평가(36종·care.html과 동일 철학).
// 군별 목표(식약처 영유아 식생활지침 "매끼 곡류·단백질·채소, 매일 우유·과일" + WHO 8군):
//   매일군(곡물·채소2·과일·유제품): 충분=주5+, 조금부족=주2~4, 부족=주<2
//   로테이션군: 고기·계란 충분=주5+ / 생선·해산물 주2+(오메가3, 수은 주의로 1~2회) / 콩류 주2+ — 부족=0회, 그 사이=조금부족
export type GroupLevel = 'green' | 'yellow' | 'red';
export type GroupSignal = { group: string; level: GroupLevel; weeklyEst: number };
export const GROUP_TARGET: Record<string, { green: number; type: 'daily' | 'rotation' }> = {
  '곡물': { green: 5, type: 'daily' }, '비타민A채소': { green: 5, type: 'daily' }, '기타채소': { green: 5, type: 'daily' },
  '과일': { green: 5, type: 'daily' }, '유제품': { green: 5, type: 'daily' },
  '고기·계란': { green: 5, type: 'rotation' }, '생선·해산물': { green: 2, type: 'rotation' }, '콩류': { green: 2, type: 'rotation' },
};
// ⭐ K-01 — 식재료→식품군 정본 매핑(FOOD_GROUP 직접 → catOf 카테고리 빗대기). computeFoodGroups(308)와 동일 공간.
//   refExposable(거부 결핍군 필터)이 catOf(카테고리 18종)를 _deficientGroups(식품군 8종)와 직접 비교하던 네임스페이스 버그 수정용으로 export.
export function groupOf(ing: string, catOf?: CatOf): string | undefined {
  return FOOD_GROUP[ing] || (catOf && CATEGORY_GROUP[catOf(ing) || '']);
}
export function computeGroupSignals(ingredientsByDay: string[][], catOf?: CatOf): { signals: GroupSignal[]; proteinOk: boolean } {
  const totalDays = ingredientsByDay.length || 1;
  const cover: Record<string, number> = {};
  let proteinDays = 0;
  ingredientsByDay.forEach((day) => {
    const set = new Set<string>();
    day.forEach((ing) => { const g = groupOf(ing, catOf); if (g) set.add(g); });
    set.forEach((g) => { cover[g] = (cover[g] || 0) + 1; });
    if (set.has('고기·계란') || set.has('생선·해산물') || set.has('콩류')) proteinDays++;
  });
  const signals = ALL_GROUPS.map((g): GroupSignal => {
    const d = cover[g] || 0;
    const weeklyEst = Math.round((d / totalDays) * 7 * 10) / 10;
    const t = GROUP_TARGET[g];
    let level: GroupLevel;
    if (t.type === 'daily') level = weeklyEst >= t.green ? 'green' : weeklyEst >= 2 ? 'yellow' : 'red';
    else level = d === 0 ? 'red' : weeklyEst >= t.green ? 'green' : 'yellow';
    return { group: g, level, weeklyEst };
  });
  const proteinOk = (proteinDays / totalDays) * 7 >= 5;  // 단백질 총괄: 고기·계란·생선·콩 중 매일 ≥1군
  return { signals, proteinOk };
}

export type GroupWeekly = { weeks: string[]; series: { group: string; counts: number[] }[]; unit: 'day' | 'week' };
/** 8식품군 노출 시계열 — 홈 식품군 다양성 추이 선차트용. 식재료는 종이 많아 식품군 8개로 묶음.
 *  기록 기간이 30일 미만이면 '일 단위'(최근 14일, 그날 먹은 끼니 수), 아니면 '주 단위'(최근 10주, 주당 먹은 일수). */
export function computeGroupWeekly(rows: { log_date: string; ingredients: string[] | null }[], catOf?: CatOf, numWeeks = 10): GroupWeekly {
  const groupsOfRow = (r: { ingredients: string[] | null }) => {
    const gs = new Set<string>();
    (r.ingredients || []).forEach((ing) => { const g = groupOf(ing, catOf); if (g) gs.add(g); });
    return gs;
  };
  const todayMs = Date.now();
  const dates = rows.map((r) => r.log_date).filter(Boolean).sort();
  const spanDays = dates.length ? (todayMs - Date.parse(dates[0])) / 86400000 : 0;

  if (spanDays < 30) {
    // 일 단위 — 최근 14일, 그날 그 식품군을 먹은 끼니 수
    const numDays = 14;
    const byDay: Record<string, Record<string, number>> = {};
    for (const r of rows) { if (!r.log_date) continue; (byDay[r.log_date] ||= {}); groupsOfRow(r).forEach((g) => { byDay[r.log_date][g] = (byDay[r.log_date][g] || 0) + 1; }); }
    const weeks = Array.from({ length: numDays }, (_, i) => new Date(todayMs - (numDays - 1 - i) * 86400000).toISOString().slice(0, 10));
    const series = ALL_GROUPS.map((g) => ({ group: g, counts: weeks.map((d) => byDay[d]?.[g] || 0) }));
    return { weeks, series, unit: 'day' };
  }
  // 주 단위 — 최근 numWeeks 주, 주당 그 식품군을 먹은 일수(데이터 없는 주도 0으로 채워 선 끊김 방지)
  const byWeek: Record<string, Record<string, Set<string>>> = {};
  for (const r of rows) { if (!r.log_date) continue; const wk = isoWeekKey(r.log_date); (byWeek[wk] ||= {}); groupsOfRow(r).forEach((g) => { (byWeek[wk][g] ||= new Set<string>()).add(r.log_date); }); }
  const weeks = [...new Set(Array.from({ length: numWeeks }, (_, i) =>
    isoWeekKey(new Date(todayMs - (numWeeks - 1 - i) * 7 * 86400000).toISOString().slice(0, 10))))];
  const series = ALL_GROUPS.map((g) => ({ group: g, counts: weeks.map((wk) => byWeek[wk]?.[g]?.size || 0) }));
  return { weeks, series, unit: 'week' };
}

export type NutrientSignal = { nutrient: string; daysCovered: number; level: 'green' | 'yellow' | 'red' };

/**
 * 기록 묶음(여러 날·끼니)의 식재료 → 영양소 신호등
 * @param ingredientsByDay  날짜별 먹은 식재료 목록 (중복 제거 전)
 */
// KEY 15종 밴드(KDRI_BAND와 동일 기준 — KEY의 '오메가3'=KDRI의 EPA+DHA)
const KEY_BAND: Record<string, 'daily' | 'frequent' | 'occasional'> = {
  '단백질': 'daily', '칼슘': 'daily', '비타민C': 'daily', '식이섬유': 'daily', '칼륨': 'daily', '마그네슘': 'daily',
  '비타민A': 'frequent', '아연': 'frequent', '엽산': 'frequent', '비타민K': 'frequent',
  '철': 'occasional', '비타민D': 'occasional', '오메가3': 'occasional', '비타민B12': 'occasional', '요오드': 'occasional',
};
export function computeSignals(ingredientsByDay: string[][], catOf?: CatOf): NutrientSignal[] {
  const recordedDays = ingredientsByDay.length;   // 데이터 가드용 실제 기록일 수
  // 영양소별 — 며칠 동안 커버됐는지
  const coverDays: Record<string, number> = {};
  KEY_NUTRIENTS.forEach((n) => { coverDays[n] = 0; });

  ingredientsByDay.forEach((dayIngredients) => {
    const covered = new Set<string>();
    dayIngredients.forEach((ing) => {
      nutrientsOf(ing, catOf).forEach((n) => covered.add(n));   // 정확→범주 빗대기
    });
    covered.forEach((n) => { if (n in coverDays) coverDays[n]++; });
  });

  return KEY_NUTRIENTS.map((n) => {
    const d = coverDays[n];
    const need = KDRI_BAND_NEED[KEY_BAND[n] || 'frequent'];   // 매일5/자주4/가끔2 (근거 보고서)
    let level: 'green' | 'yellow' | 'red';
    if (recordedDays < 3) level = 'yellow';                   // 데이터 가드(NutrientSignal엔 reference가 없어 yellow로 보류)
    else if (d >= need) level = 'green';
    else if (d > 0) level = 'yellow';
    else level = (n === '비타민D' || recordedDays < 5) ? 'yellow' : 'red';   // D는 빈도 red 비활성, 기록 5일 미만이면 red 보류
    return { nutrient: n, daysCovered: d, level };
  });
}

/** 8개 WHO 식품군 커버 (다양성) */
const FOOD_GROUP: Record<string, string> = {
  '쌀': '곡물', '현미': '곡물', '귀리': '곡물', '잡곡': '곡물', '빵': '곡물', '감자': '곡물', '고구마': '곡물',
  '두부': '콩류', '콩': '콩류', '된장': '콩류', '콩나물': '콩류', '검은콩': '콩류', '낫토': '콩류',
  '우유': '유제품', '치즈': '유제품', '요거트': '유제품', '요구르트': '유제품',
  '소고기': '고기·계란', '돼지고기': '고기·계란', '닭고기': '고기·계란',
  '달걀': '고기·계란', '계란': '고기·계란', '메추리알': '고기·계란',
  '연어': '생선·해산물', '고등어': '생선·해산물', '멸치': '생선·해산물', '갈치': '생선·해산물', '새우': '생선·해산물', '오징어': '생선·해산물',
  '조기': '생선·해산물', '꽁치': '생선·해산물', '도미': '생선·해산물', '민어': '생선·해산물', '관자': '생선·해산물',
  '당근': '비타민A채소', '시금치': '비타민A채소', '고구마2': '비타민A채소', '호박': '비타민A채소', '근대': '비타민A채소',
  '양파': '기타채소', '오이': '기타채소', '양배추': '기타채소', '브로콜리': '기타채소', '토마토': '기타채소', '버섯': '기타채소', '미역': '기타채소', '가지': '기타채소', '파프리카': '기타채소',
  '사과': '과일', '바나나': '과일', '딸기': '과일', '귤': '과일', '블루베리': '과일', '키위': '과일',
};
const ALL_GROUPS = ['곡물', '콩류', '유제품', '고기·계란', '생선·해산물', '비타민A채소', '기타채소', '과일'];

export function computeFoodGroups(allIngredients: string[], catOf?: CatOf): { covered: string[]; missing: string[] } {
  const covered = new Set<string>();
  allIngredients.forEach((ing) => {
    const g = FOOD_GROUP[ing] || (catOf && CATEGORY_GROUP[catOf(ing) || '']);   // 정확→범주 빗대기
    if (g) covered.add(g);
  });
  return {
    covered: [...covered],
    missing: ALL_GROUPS.filter((g) => !covered.has(g)),
  };
}

// 채소 계열 카테고리 (풀 catOf 기준) — 시계열 채소 판정 보조
const VEG_CATS = ['잎채소', '열매채소', '뿌리채소', '기타채소', '십자화과', '버섯', '해조류'];
/** 식재료가 채소인가 — NUTRI_MAP(비타민A채소) 정확 매핑 우선, 없으면 풀 카테고리로 근사. */
function isVeg(ing: string, catOf?: CatOf): boolean {
  const g = FOOD_GROUP[ing];
  if (g === '비타민A채소' || g === '기타채소') return true;
  if (nutrientsOf(ing, catOf).includes('비타민A')) return true;
  const cat = catOf?.(ing);
  return !!cat && VEG_CATS.includes(cat);
}

/**
 * 시계열(추세) 사실 문장 — 코칭엔진 스펙 §4. 크론·홈이 공유(DRY)해 경로별 편차를 없앤다.
 * LLM이 날짜를 추정하지 않도록 분석이 계산한 사실만 반환한다.
 * @param assertNoVeg  채소 판정이 신뢰 가능할 때만(catOf 신뢰) '채소 없음'을 단정 (P4 환각 차단)
 */
export function computeTimeseries(
  byDate: Record<string, string[]>,
  menuFreq: Record<string, number>,
  catOf: CatOf | undefined,
  today: string,
  opts?: { assertNoVeg?: boolean },
): string[] {
  const ts: string[] = [];
  const todayMs = Date.parse(today);
  const vegDates: string[] = [];
  for (const [d, ings] of Object.entries(byDate)) {
    if (ings.some((i) => isVeg(i, catOf))) vegDates.push(d);
  }
  if (vegDates.length) {
    const last = vegDates.sort().slice(-1)[0];
    const days = Math.round((todayMs - Date.parse(last)) / 86400000);
    if (days >= 2) ts.push(`채소 기록이 ${days}일째 없음`);
  } else if (opts?.assertNoVeg) {
    ts.push('최근 기록에 채소가 없음');
  }
  // 물·국 등은 반복 의미 없어 제외. 밥·김치는 한국 주식이라 반복 너그럽게(김치류 제외). 흰쌀밥은 잡곡·콩 섞기 제안으로 전환.
  const SKIP_REPEAT = new Set(['물', '국', '김', '우유', '생수', '보리차', '숭늉', '김치', '배추김치', '깍두기', '총각김치', '백김치', '열무김치', '나박김치', '물김치', '갓김치', '파김치', '오이소박이']);
  const WHITE_RICE = new Set(['밥', '쌀밥', '흰밥', '흰쌀밥', '백미밥', '진밥', '쌀', '맨밥']);
  const top = Object.entries(menuFreq).filter(([k]) => !SKIP_REPEAT.has(k)).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) {
    if (WHITE_RICE.has(top[0])) ts.push('흰쌀밥이 잦음(주식) — 흰쌀에 잡곡·콩 섞기로 다양성 제안 가능');
    else ts.push(`'${top[0]}'를 ${top[1]}회 반복`);
  }
  return ts;
}

// ── 36종 KDRI 영양 신호등 (보건복지부 한국인 영양소 섭취기준 2025 · 만 1-2세) ──────
// 출처: care.html (mealfred.com/care.html)의 KDRI_NUTRIENTS. 단일 소스로 코드 상수화.
// mapped = 우리 NUTRI_MAP/CATEGORY_NUTRI가 내보내는 내부 영양소 라벨(있으면 실데이터로 개인화).
//   mapped 없으면 'reference' — 아직 식품→영양소 매핑이 없어 KDRI 기준만 표시(가짜 빨강 방지).
//   (미매핑 ~12종은 농진청 성분 → DB/매핑 크론으로 점진 보강 — 백로그)
// sample/samplePct = 비로그인·기록 3일 미만 목업 표시용(care.html과 동일한 예시 아이).
export type KdriNutrient = { nm: string; val: string; group: string; mapped?: string; sample: 'green' | 'yellow' | 'red'; samplePct: number };
// 신호등에서 제외하는 영양소 + 이유 (36종 중 5종 제외 = 31종). 홈 모달 하단 안내로 노출.
export const KDRI_EXCLUDED: { nm: string; reason: string }[] = [
  { nm: '나트륨', reason: '한국인 식단 특성상 충분히(오히려 넘치게) 섭취해 결핍 걱정이 없어요' },
  { nm: '에너지', reason: '총 칼로리보다 영양 다양성이 중요해 따로 집계하지 않아요' },
  { nm: '수분', reason: '국·물·과일로 자연히 채워져 따로 집계하지 않아요' },
  { nm: '불소', reason: '음식보다 양치·물로 관리하는 영양소라 집계하지 않아요' },
  { nm: '크롬', reason: '결핍이 드물고 식품 데이터가 부족해 집계하지 않아요' },
];
export const KDRI_NUTRIENTS: KdriNutrient[] = [
  // 다량영양소 3 (에너지·수분 제외 → KDRI_EXCLUDED)
  { nm: '단백질', val: '20 g', group: '다량영양소', mapped: '단백질', sample: 'green', samplePct: 95 },
  { nm: '탄수화물', val: '130 g', group: '다량영양소', mapped: '탄수화물', sample: 'green', samplePct: 88 },
  { nm: '식이섬유', val: '10 g', group: '다량영양소', mapped: '식이섬유', sample: 'green', samplePct: 85 },
  // 필수지방산 3
  { nm: '리놀레산', val: '6 g', group: '필수지방산', mapped: '리놀레산', sample: 'green', samplePct: 90 },
  { nm: 'α-리놀렌산', val: '0.6 g', group: '필수지방산', mapped: 'α-리놀렌산', sample: 'yellow', samplePct: 60 },
  { nm: 'EPA+DHA', val: '150 mg', group: '필수지방산', mapped: '오메가3', sample: 'red', samplePct: 30 },
  // 지용성 비타민 4
  { nm: '비타민A', val: '250 μg RAE', group: '지용성비타민', mapped: '비타민A', sample: 'green', samplePct: 88 },
  { nm: '비타민D', val: '5 μg', group: '지용성비타민', mapped: '비타민D', sample: 'red', samplePct: 35 },
  { nm: '비타민E', val: '5 mg', group: '지용성비타민', mapped: '비타민E', sample: 'green', samplePct: 85 },
  { nm: '비타민K', val: '25 μg', group: '지용성비타민', mapped: '비타민K', sample: 'green', samplePct: 92 },
  // 수용성 비타민 9
  { nm: '비타민C', val: '40 mg', group: '수용성비타민', mapped: '비타민C', sample: 'yellow', samplePct: 72 },
  { nm: '티아민(B1)', val: '0.5 mg', group: '수용성비타민', mapped: '비타민B1', sample: 'green', samplePct: 90 },
  { nm: '리보플라빈(B2)', val: '0.5 mg', group: '수용성비타민', mapped: '비타민B2', sample: 'green', samplePct: 88 },
  { nm: '니아신', val: '6 mg NE', group: '수용성비타민', mapped: '니아신', sample: 'green', samplePct: 85 },
  { nm: '비타민B6', val: '0.6 mg', group: '수용성비타민', mapped: '비타민B6', sample: 'green', samplePct: 82 },
  { nm: '엽산', val: '150 μg DFE', group: '수용성비타민', mapped: '엽산', sample: 'yellow', samplePct: 65 },
  { nm: '비타민B12', val: '0.9 μg', group: '수용성비타민', mapped: '비타민B12', sample: 'green', samplePct: 90 },
  { nm: '판토텐산', val: '2 mg', group: '수용성비타민', mapped: '판토텐산', sample: 'green', samplePct: 88 },
  { nm: '비오틴', val: '9 μg', group: '수용성비타민', mapped: '비오틴', sample: 'green', samplePct: 90 },
  // 비타민 유사 1 (2025 신규)
  { nm: '콜린', val: '160 mg', group: '비타민유사', mapped: '콜린', sample: 'red', samplePct: 42 },
  // 다량 무기질 4 (나트륨 제외)
  { nm: '칼슘', val: '450 mg', group: '다량무기질', mapped: '칼슘', sample: 'green', samplePct: 85 },
  { nm: '인', val: '450 mg', group: '다량무기질', mapped: '인', sample: 'green', samplePct: 90 },
  { nm: '칼륨', val: '1,500 mg', group: '다량무기질', mapped: '칼륨', sample: 'yellow', samplePct: 68 },
  { nm: '마그네슘', val: '70 mg', group: '다량무기질', mapped: '마그네슘', sample: 'green', samplePct: 82 },
  // 미량 무기질 7 (불소·크롬 제외)
  { nm: '철', val: '6 mg', group: '미량무기질', mapped: '철', sample: 'red', samplePct: 38 },
  { nm: '아연', val: '3 mg', group: '미량무기질', mapped: '아연', sample: 'yellow', samplePct: 70 },
  { nm: '구리', val: '290 μg', group: '미량무기질', mapped: '구리', sample: 'green', samplePct: 85 },
  { nm: '망간', val: '1.5 mg', group: '미량무기질', mapped: '망간', sample: 'green', samplePct: 90 },
  { nm: '요오드', val: '70 μg', group: '미량무기질', mapped: '요오드', sample: 'green', samplePct: 92 },
  { nm: '셀레늄', val: '23 μg', group: '미량무기질', mapped: '셀레늄', sample: 'green', samplePct: 85 },
  { nm: '몰리브덴', val: '10 μg', group: '미량무기질', mapped: '몰리브덴', sample: 'green', samplePct: 88 },
];

export type KdriSignal = { nm: string; val: string; group: string; status: 'green' | 'yellow' | 'red' | 'reference'; pct: number };

/**
 * 36종 KDRI 신호등 — 실데이터(식단표에서 얼마나 자주 만났나=빈도)로 평가.
 * mapped 영양소만 개인 신호 계산, 미매핑은 'reference'(KDRI 기준만, 오탐 방지).
 */
// 영양소 밴드(근거 보고서 nutrient-signal-report.html) — 체내 저장·식품 분포·결핍 위험 3축.
// 매일군 green 5일+ / 자주군 4일+ / 가끔군 2일+. (없으면 frequent 기본)
const KDRI_BAND: Record<string, 'daily' | 'frequent' | 'occasional'> = {
  '단백질': 'daily', '탄수화물': 'daily', '식이섬유': 'daily', '칼슘': 'daily', '인': 'daily', '칼륨': 'daily', '마그네슘': 'daily', '비타민C': 'daily', '티아민(B1)': 'daily', '리보플라빈(B2)': 'daily', '니아신': 'daily', '판토텐산': 'daily', '비오틴': 'daily',
  '비타민A': 'frequent', '비타민K': 'frequent', '엽산': 'frequent', '비타민B6': 'frequent', '아연': 'frequent', '구리': 'frequent', '망간': 'frequent', '콜린': 'frequent',
  '철': 'occasional', '비타민D': 'occasional', '비타민E': 'occasional', '비타민B12': 'occasional', '셀레늄': 'occasional', '요오드': 'occasional', 'EPA+DHA': 'occasional', 'α-리놀렌산': 'occasional', '리놀레산': 'occasional', '몰리브덴': 'occasional',
};
const KDRI_BAND_NEED = { daily: 5, frequent: 4, occasional: 2 } as const;

// ── KDRI 2025 연령대별 기준값 (만 1-2 / 3-5 / 6-8세) ──────────────────
// 신호등 색은 '빈도'로 판정하므로 이 값은 모달에 보여주는 '참고 기준치'다(판정 로직엔 직접 안 쓰임).
// 핵심: 아이 연령에 맞는 기준을 보여주는 것 — 예전엔 만 5세 아이에게도 만 1-2세 값을 보여줬다(연령 불일치 버그).
// 출처: 보건복지부 「2025 한국인 영양소 섭취기준」 요약표(워크플로 조사 + 적대적 검증).
//   - 망간 AI는 UL 오인 교정해 2.0/2.5, 칼슘 1-2세는 2025 개정값 450(2020=500).
//   - 칼슘↔인 3-5세는 스왑 아님: 2025 개정으로 칼슘 550·인 600이 맞음(2020은 600·550).
export type AgeBandKey = '1-2' | '3-5' | '6-8';
export const KDRI_AGE_LABEL: Record<AgeBandKey, string> = { '1-2': '만 1-2세', '3-5': '만 3-5세', '6-8': '만 6-8세' };
// children.age_band → KDRI 연령대. younger(만3미만)→1-2, 3-4y·5y→3-5, 6-7y→6-8.
export function kdriAgeBandOf(ageBand: string | null | undefined): AgeBandKey {
  if (ageBand === '6-7y') return '6-8';
  if (ageBand === '3-4y' || ageBand === '5y') return '3-5';
  return '1-2';
}
export const KDRI_VAL_BY_AGE: Record<string, Record<AgeBandKey, string>> = {
  '단백질': { '1-2': '20 g', '3-5': '25 g', '6-8': '35 g' },
  '탄수화물': { '1-2': '130 g', '3-5': '130 g', '6-8': '130 g' },
  '식이섬유': { '1-2': '10 g', '3-5': '15 g', '6-8': '20 g' },
  '리놀레산': { '1-2': '6 g', '3-5': '6 g', '6-8': '7 g' },
  'α-리놀렌산': { '1-2': '0.6 g', '3-5': '0.6 g', '6-8': '0.8 g' },
  'EPA+DHA': { '1-2': '150 mg', '3-5': '200 mg', '6-8': '200 mg' },
  '비타민A': { '1-2': '250 μg RAE', '3-5': '300 μg RAE', '6-8': '450 μg RAE' },
  '비타민D': { '1-2': '5 μg', '3-5': '5 μg', '6-8': '5 μg' },
  '비타민E': { '1-2': '5 mg', '3-5': '6 mg', '6-8': '7 mg' },
  '비타민K': { '1-2': '25 μg', '3-5': '30 μg', '6-8': '40 μg' },
  '비타민C': { '1-2': '40 mg', '3-5': '45 mg', '6-8': '50 mg' },
  '티아민(B1)': { '1-2': '0.5 mg', '3-5': '0.5 mg', '6-8': '0.7 mg' },
  '리보플라빈(B2)': { '1-2': '0.5 mg', '3-5': '0.6 mg', '6-8': '0.9 mg' },
  '니아신': { '1-2': '6 mg NE', '3-5': '6 mg NE', '6-8': '8 mg NE' },
  '비타민B6': { '1-2': '0.6 mg', '3-5': '0.7 mg', '6-8': '0.9 mg' },
  '엽산': { '1-2': '150 μg DFE', '3-5': '180 μg DFE', '6-8': '220 μg DFE' },
  '비타민B12': { '1-2': '0.9 μg', '3-5': '1.1 μg', '6-8': '1.3 μg' },
  '판토텐산': { '1-2': '2 mg', '3-5': '2.5 mg', '6-8': '3.0 mg' },
  '비오틴': { '1-2': '9 μg', '3-5': '12 μg', '6-8': '15 μg' },
  '콜린': { '1-2': '160 mg', '3-5': '190 mg', '6-8': '260 mg' },
  '칼슘': { '1-2': '450 mg', '3-5': '550 mg', '6-8': '700 mg' },
  '인': { '1-2': '450 mg', '3-5': '600 mg', '6-8': '600 mg' },
  '칼륨': { '1-2': '1,500 mg', '3-5': '2,300 mg', '6-8': '2,600 mg' },
  '마그네슘': { '1-2': '70 mg', '3-5': '110 mg', '6-8': '150 mg' },
  '철': { '1-2': '6 mg', '3-5': '6 mg', '6-8': '7 mg' },
  '아연': { '1-2': '3 mg', '3-5': '4 mg', '6-8': '5 mg' },
  '구리': { '1-2': '290 μg', '3-5': '350 μg', '6-8': '460 μg' },
  '망간': { '1-2': '1.5 mg', '3-5': '2.0 mg', '6-8': '2.5 mg' },
  '요오드': { '1-2': '70 μg', '3-5': '90 μg', '6-8': '100 μg' },
  '셀레늄': { '1-2': '23 μg', '3-5': '25 μg', '6-8': '35 μg' },
  '몰리브덴': { '1-2': '10 μg', '3-5': '13 μg', '6-8': '20 μg' },
};

export function computeKdriSignals(ingredientsByDay: string[][], catOf?: CatOf, ageBand: AgeBandKey = '1-2'): KdriSignal[] {
  const recordedDays = ingredientsByDay.length;   // 실제 기록된 날 수(데이터 가드용)
  const denom = 7;                                 // 분모는 '달력 7일' 고정 — 며칠만 기록해도 비율이 부풀려지던 누수 교정
  const valOf = (nm: string, fallback: string) => KDRI_VAL_BY_AGE[nm]?.[ageBand] ?? fallback;   // 아이 연령대 기준치(없으면 1-2세 fallback)
  const cover: Record<string, number> = {};
  ingredientsByDay.forEach((day) => {
    const set = new Set<string>();
    day.forEach((ing) => nutrientsOf(ing, catOf).forEach((n) => set.add(n)));
    set.forEach((n) => { cover[n] = (cover[n] || 0) + 1; });
  });
  return KDRI_NUTRIENTS.map((k): KdriSignal => {
    const v = valOf(k.nm, k.val);
    if (!k.mapped) return { nm: k.nm, val: v, group: k.group, status: 'reference', pct: 0 };
    // 데이터 가드: 기록 3일 미만이면 섣불리 판정하지 않고 보류(reference)
    if (recordedDays < 3) return { nm: k.nm, val: v, group: k.group, status: 'reference', pct: 0 };
    const d = cover[k.mapped] || 0;
    const need = KDRI_BAND_NEED[KDRI_BAND[k.nm] || 'frequent'];   // 밴드별 green 문턱(5/4/2일)
    const pct = Math.min(100, Math.round((d / denom) * 100));
    let status: 'green' | 'yellow' | 'red';
    if (d >= need) status = 'green';
    else if (d > 0) status = 'yellow';
    // d===0(한 번도 안 닿음): 비타민D는 빈도 red 비활성(보충제로 관리하는 영양소), 기록 5일 미만이면 red 보류(yellow 클램프)
    else status = (k.nm === '비타민D' || recordedDays < 5) ? 'yellow' : 'red';
    return { nm: k.nm, val: v, group: k.group, status, pct };
  });
}

// ── 가공식품/반복 패널티 + 다양성 점수 (영양 점수 개편) ──────────────────
// 점수 중심을 '결핍 없음(신호등)'에서 '다양성 + 집 끼니 질'로 이동. menus[] 원문 기반:
// 짜파게티·떡갈비·la갈비는 ingredients[]로 안 풀려 메뉴명 매칭이 핵심. ultra=초가공/즉석, cured=가공육.
// 좁게 매칭해 김치찌개·미역국 등 안전메뉴 오탐 방지.
const ULTRA_RE = /짜파게티|짜파구리|짜장범벅|컵라면|봉지면|라면|핫도그|핫바|치킨너겟|너겟|너깃|돈가스|돈까스|까스|피자|군만두|탕수육|양념치킨|프라이드|감자튀김|프렌치프라이|즉석|인스턴트|시리얼|콘푸로스트|핫케이크|와플|도넛|도너츠|과자|스낵|젤리|사탕|초콜릿|초코바/;
const CURED_RE = /소시지|비엔나|후랑크|프랑크|햄(?!버그스테이크)|베이컨|어묵|오뎅|맛살|게맛살|크래미|떡갈비|la\s*갈비|엘에이\s*갈비|미트볼|함박|함바그|동그랑땡|스팸|런천|훈제/i;
export function isProcessed(name: string): { hit: boolean; kind: 'ultra' | 'cured' | null } {
  const n = (name || '').replace(/\s/g, '');
  if (ULTRA_RE.test(n)) return { hit: true, kind: 'ultra' };
  if (CURED_RE.test(name || '')) return { hit: true, kind: 'cured' };
  return { hit: false, kind: null };
}
// 끼니별 menus → 가공 비중·감점. ultra 가중 1.0, cured 0.7. 상한 22(가공식품도 단백질 공급 → 과잉처벌 금지).
export function processedPenalty(menusByMeal: string[][]): { ratio: number; penalty: number; sampleNames: string[] } {
  const meals = menusByMeal.filter((m) => m.length);
  if (!meals.length) return { ratio: 0, penalty: 0, sampleNames: [] };
  let weighted = 0; const names = new Set<string>();
  for (const meal of meals) {
    let w = 0;
    for (const mn of meal) { const p = isProcessed(mn); if (p.hit) { w = Math.max(w, p.kind === 'ultra' ? 1 : 0.7); names.add((mn || '').trim()); } }
    weighted += w;
  }
  const ratio = weighted / meals.length;
  return { ratio, penalty: Math.round(ratio * 22), sampleNames: [...names].slice(0, 3) };
}
// ── 매일 반복되는 '주식·음료·고정 밑반찬'은 메뉴 단조로움이 아님 → 반복 집계에서 제외(단일 소스) ──
// 과거엔 곳곳의 문자열 화이트리스트(SVN_STAPLE·REPEAT_SKIP)가 산양유·차조밥·결명자차 등을 놓쳐
// 멀쩡한 식단이 '반복도 최악'으로 깎였다. 음료엔 식품군이 없어(두유=콩류·보리차=곡물) 형태소로,
// 주식밥은 '밥으로 끝 + 곡물/콩류로만 구성(요리밥 제외)'으로 식품군 분류한다. (이사님 2026-06-25)
const BEVERAGE_RE = /(우유|두유|산양유|연유|미숫|유$|차$|주스|에이드|스무디|라떼|식혜|수정과|요거트|요구르트|요플레|생수|음료)/;
const FIXTURE_RE = /(김치|깍두기|단무지|장아찌|짠지|소박이|겉절이|총각무)/;   // 밑반찬은 부분일치(과거 화이트리스트 동등·안전쪽)
const RICE_DISH_RE = /(볶음밥|비빔밥|김밥|주먹밥|덮밥|회덮|카레|커리|짜장|자장|국밥|무른밥|섞음밥|마요|묵밥)/;   // '밥'이지만 요리 → 반복 집계 대상
/** 메뉴가 매일 반복되는 주식·음료·고정 밑반찬인가(반복도 집계 제외 대상). ings 주면 밥류 판정 정밀(곡물·콩류만). */
export function isStapleMenu(name: string, ings?: string[], catOf?: CatOf): boolean {
  const flat = (name || '').replace(/\s/g, '');
  if (!flat) return false;
  if (BEVERAGE_RE.test(flat)) return true;            // 음료(우유·산양유·두유·각종 차·요거트)
  if (FIXTURE_RE.test(flat)) return true;             // 고정 밑반찬(김치·깍두기·단무지류)
  const core = flat.replace(/[(（\[【/].*$/, '');     // 'A(B)'·'A/B' 등 꼬리표 제거 → 본체로 밥 판정('백미밥(잡곡밥)')
  if (/밥$/.test(core) && !RICE_DISH_RE.test(flat)) { // 주식 밥(맨밥·잡곡밥·차조밥…) — 곡물/콩류로만 구성
    const groups = (ings || []).map((i) => groupOf(i, catOf)).filter(Boolean) as string[];
    if (groups.every((g) => g === '곡물' || g === '콩류')) return true;
  }
  return false;
}

// 반복 패널티 — 주식·음료·고정 밑반찬(isStapleMenu) 제외. 같은 메인 4회+ 감점, 상한 12.
export function repeatPenalty(menusByMeal: string[][]): { topMenu: string | null; count: number; penalty: number } {
  const freq: Record<string, number> = {};
  menusByMeal.forEach((meal) => meal.forEach((mn) => { const k = (mn || '').replace(/\s/g, ''); if (k && !isStapleMenu(mn)) freq[k] = (freq[k] || 0) + 1; }));
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 4) return { topMenu: top?.[0] ?? null, count: top?.[1] ?? 0, penalty: 0 };
  return { topMenu: top[0], count: top[1], penalty: Math.min(12, (top[1] - 3) * 4) };
}
// 점심 급식엔 과일·유제품을 매일 기대할 수 없음(집에서 보충 = 집 점수에만 반영). 기관 평가에선 제외.
const DAYCARE_EXCLUDE = new Set(['과일', '유제품']);
// 새 점수 산식의 단일 진입점. 다양성 base + 식품군 게이트 캡 − 가공 − 반복.
// applyMealPenalty=false면 가공/반복 미적용(기관 급식: 부모 통제 밖). 끼니 3건 미만이면 변동성 큼 → 미적용(위험가드).
// daycareMode=true면 과일·유제품을 군 평가에서 제외(점심만 평가하는 기관이 부당하게 깎이지 않게).
export function computeDiversityScore(args: { ingredientsByDay: string[][]; menusByMeal: string[][]; catOf?: CatOf; applyMealPenalty?: boolean; daycareMode?: boolean }): { score: number; diversityBase: number; gateCap: number; processed: number; repeat: number; redGroups: string[]; processedSample: string[]; repeatMenu: string | null } {
  const { signals: allSignals } = computeGroupSignals(args.ingredientsByDay, args.catOf);
  const signals = args.daycareMode ? allSignals.filter((s) => !DAYCARE_EXCLUDE.has(s.group)) : allSignals;
  const base = signals.length ? Math.round(signals.reduce((a, s) => a + (s.level === 'green' ? 100 : s.level === 'yellow' ? 65 : 0), 0) / signals.length) : 0;   // yellow 65(완화): 정상 다양식 95+, 편식만 경고
  const redGroups = signals.filter((s) => s.level === 'red').map((s) => s.group);
  const gateCap = redGroups.length ? Math.max(66, 90 - (redGroups.length - 1) * 8) : 100;
  const mealCount = args.menusByMeal.filter((m) => m.length).length;
  const apply = args.applyMealPenalty !== false && mealCount >= 3;   // 끼니 3건 미만이면 패널티 노이즈 → 미적용
  const pp = apply ? processedPenalty(args.menusByMeal) : { ratio: 0, penalty: 0, sampleNames: [] as string[] };
  const rp = apply ? repeatPenalty(args.menusByMeal) : { topMenu: null as string | null, count: 0, penalty: 0 };
  const score = Math.max(0, Math.min(100, Math.min(base, gateCap) - pp.penalty - rp.penalty));
  return { score, diversityBase: base, gateCap, processed: pp.penalty, repeat: rp.penalty, redGroups, processedSample: pp.sampleNames, repeatMenu: rp.penalty ? rp.topMenu : null };
}
