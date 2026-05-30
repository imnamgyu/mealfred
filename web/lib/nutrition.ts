/**
 * 영양 진단 로직 (M6) — care 식사 기록 → 신호등·진단
 *
 * 한계: 식재료 존재 여부 기반 (정량 g 아님).
 * "며칠 동안 이 영양소를 커버하는 식재료를 먹었나"로 신호등 산출.
 */

// 식재료 → 커버하는 영양소 (daycare-eval NUTRI_MAP 확장본 재사용)
export const NUTRI_MAP: Record<string, string[]> = {
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
// 풀 카테고리 → WHO 8식품군 (다양성 빗대기)
export const CATEGORY_GROUP: Record<string, string> = {
  '곡물_탄수': '곡물', '콩_콩제품': '콩류', '발효식품': '콩류', '유제품': '유제품',
  '고기': '고기생선', '생선': '고기생선', '갑각_조개': '고기생선', '가공식품': '고기생선',
  '계란': '계란', '잎채소': '비타민A채소', '뿌리채소': '비타민A채소',
  '열매채소': '기타채소', '기타채소': '기타채소', '해조류': '기타채소', '버섯': '기타채소', '과일': '과일',
};

type CatOf = (ing: string) => string | undefined;

// 농진청 10.4 정밀맵(gen-nutrient-map.py 생성) — 1일 KDRI 15%↑ 공급 영양소. 빗대기를 대체하는 1차 출처.
import GEN_RAW from './nutrient-map.generated.json';
const GEN_NUTRI = GEN_RAW as Record<string, { nong: string; conf: string; n: string[] }>;
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
//   로테이션군: 고기생선 충분=주5+ / 계란 주3+ / 콩류 주2+ — 부족=0회, 그 사이=조금부족
export type GroupLevel = 'green' | 'yellow' | 'red';
export type GroupSignal = { group: string; level: GroupLevel; weeklyEst: number };
const GROUP_TARGET: Record<string, { green: number; type: 'daily' | 'rotation' }> = {
  '곡물': { green: 5, type: 'daily' }, '비타민A채소': { green: 5, type: 'daily' }, '기타채소': { green: 5, type: 'daily' },
  '과일': { green: 5, type: 'daily' }, '유제품': { green: 5, type: 'daily' },
  '고기생선': { green: 5, type: 'rotation' }, '계란': { green: 3, type: 'rotation' }, '콩류': { green: 2, type: 'rotation' },
};
function groupOf(ing: string, catOf?: CatOf): string | undefined {
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
    if (set.has('고기생선') || set.has('계란') || set.has('콩류')) proteinDays++;
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
  const proteinOk = (proteinDays / totalDays) * 7 >= 5;  // 단백질 총괄: 고기생선·계란·콩 중 매일 ≥1군
  return { signals, proteinOk };
}

export type NutrientSignal = { nutrient: string; daysCovered: number; level: 'green' | 'yellow' | 'red' };

/**
 * 기록 묶음(여러 날·끼니)의 식재료 → 영양소 신호등
 * @param ingredientsByDay  날짜별 먹은 식재료 목록 (중복 제거 전)
 */
export function computeSignals(ingredientsByDay: string[][], catOf?: CatOf): NutrientSignal[] {
  const totalDays = ingredientsByDay.length || 1;
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
    const ratio = d / totalDays;
    let level: 'green' | 'yellow' | 'red';
    // 3일 이상 OR 절반 이상 커버 = 충분 (생선·미역 주2회도 인정)
    if (d >= 3 || ratio >= 0.5) level = 'green';
    else if (d > 0) level = 'yellow';        // 가끔 (1~2일)
    else level = 'red';                       // 한 번도 X
    return { nutrient: n, daysCovered: d, level };
  });
}

/** 8개 WHO 식품군 커버 (다양성) */
const FOOD_GROUP: Record<string, string> = {
  '쌀': '곡물', '현미': '곡물', '귀리': '곡물', '잡곡': '곡물', '빵': '곡물', '감자': '곡물', '고구마': '곡물',
  '두부': '콩류', '콩': '콩류', '된장': '콩류', '콩나물': '콩류', '검은콩': '콩류',
  '우유': '유제품', '치즈': '유제품', '요거트': '유제품', '요구르트': '유제품',
  '소고기': '고기생선', '돼지고기': '고기생선', '닭고기': '고기생선', '연어': '고기생선', '고등어': '고기생선', '멸치': '고기생선', '갈치': '고기생선', '새우': '고기생선', '오징어': '고기생선',
  '달걀': '계란', '계란': '계란', '메추리알': '계란',
  '당근': '비타민A채소', '시금치': '비타민A채소', '고구마2': '비타민A채소', '호박': '비타민A채소', '근대': '비타민A채소',
  '양파': '기타채소', '오이': '기타채소', '양배추': '기타채소', '브로콜리': '기타채소', '토마토': '기타채소', '버섯': '기타채소', '미역': '기타채소', '가지': '기타채소', '파프리카': '기타채소',
  '사과': '과일', '바나나': '과일', '딸기': '과일', '귤': '과일', '블루베리': '과일', '키위': '과일',
};
const ALL_GROUPS = ['곡물', '콩류', '유제품', '고기생선', '계란', '비타민A채소', '기타채소', '과일'];

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
  // 물·국 등은 반복 의미 없어 제외. 흰쌀밥은 주식이라 '편식 반복'으로 지적하지 않고 잡곡·콩 섞기 제안으로 전환.
  const SKIP_REPEAT = new Set(['물', '국', '김', '우유', '생수', '보리차', '숭늉']);
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
export const KDRI_NUTRIENTS: KdriNutrient[] = [
  // 다량영양소 5
  { nm: '에너지', val: '900 kcal', group: '다량영양소', mapped: '에너지', sample: 'green', samplePct: 92 },
  { nm: '단백질', val: '20 g', group: '다량영양소', mapped: '단백질', sample: 'green', samplePct: 95 },
  { nm: '탄수화물', val: '130 g', group: '다량영양소', mapped: '탄수화물', sample: 'green', samplePct: 88 },
  { nm: '식이섬유', val: '10 g', group: '다량영양소', mapped: '식이섬유', sample: 'green', samplePct: 85 },
  { nm: '수분', val: '1,000 mL', group: '다량영양소', mapped: '수분', sample: 'yellow', samplePct: 72 },
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
  // 다량 무기질 5
  { nm: '칼슘', val: '500 mg', group: '다량무기질', mapped: '칼슘', sample: 'green', samplePct: 85 },
  { nm: '인', val: '450 mg', group: '다량무기질', mapped: '인', sample: 'green', samplePct: 90 },
  { nm: '나트륨', val: '≤1,000 mg', group: '다량무기질', sample: 'yellow', samplePct: 55 },
  { nm: '칼륨', val: '1,500 mg', group: '다량무기질', mapped: '칼륨', sample: 'yellow', samplePct: 68 },
  { nm: '마그네슘', val: '70 mg', group: '다량무기질', mapped: '마그네슘', sample: 'green', samplePct: 82 },
  // 미량 무기질 9
  { nm: '철', val: '6 mg', group: '미량무기질', mapped: '철', sample: 'red', samplePct: 38 },
  { nm: '아연', val: '3 mg', group: '미량무기질', mapped: '아연', sample: 'yellow', samplePct: 70 },
  { nm: '구리', val: '290 μg', group: '미량무기질', mapped: '구리', sample: 'green', samplePct: 85 },
  { nm: '불소', val: '0.6 mg', group: '미량무기질', sample: 'green', samplePct: 88 },
  { nm: '망간', val: '1.5 mg', group: '미량무기질', mapped: '망간', sample: 'green', samplePct: 90 },
  { nm: '요오드', val: '70 μg', group: '미량무기질', mapped: '요오드', sample: 'green', samplePct: 92 },
  { nm: '셀레늄', val: '23 μg', group: '미량무기질', mapped: '셀레늄', sample: 'green', samplePct: 85 },
  { nm: '몰리브덴', val: '10 μg', group: '미량무기질', mapped: '몰리브덴', sample: 'green', samplePct: 88 },
  { nm: '크롬', val: '9 μg', group: '미량무기질', mapped: '크롬', sample: 'red', samplePct: 45 },
];

export type KdriSignal = { nm: string; val: string; group: string; status: 'green' | 'yellow' | 'red' | 'reference'; pct: number };

/**
 * 36종 KDRI 신호등 — 실데이터(식단표에서 얼마나 자주 만났나=빈도)로 평가.
 * mapped 영양소만 개인 신호 계산, 미매핑은 'reference'(KDRI 기준만, 오탐 방지).
 */
export function computeKdriSignals(ingredientsByDay: string[][], catOf?: CatOf): KdriSignal[] {
  const totalDays = ingredientsByDay.length || 1;
  const cover: Record<string, number> = {};
  ingredientsByDay.forEach((day) => {
    const set = new Set<string>();
    day.forEach((ing) => nutrientsOf(ing, catOf).forEach((n) => set.add(n)));
    set.forEach((n) => { cover[n] = (cover[n] || 0) + 1; });
  });
  return KDRI_NUTRIENTS.map((k): KdriSignal => {
    if (!k.mapped) return { nm: k.nm, val: k.val, group: k.group, status: 'reference', pct: 0 };
    const d = cover[k.mapped] || 0;
    const ratio = d / totalDays;
    const status = d >= 3 || ratio >= 0.5 ? 'green' : d > 0 ? 'yellow' : 'red';
    return { nm: k.nm, val: k.val, group: k.group, status, pct: Math.min(100, Math.round(ratio * 100)) };
  });
}
