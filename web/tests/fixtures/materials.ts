/**
 * tests/fixtures/materials.ts — 재료 엔진 회귀 fixture (WBS EPIC A · A-12)
 * 인계서 실증 박제: 아린 6통 '당근→미역국' 괴식 + '당근 반복' 수렴 사례.
 * selectDailyMaterials가 이 입력에서 괴식 0·재료 회전을 만들어냄을 회귀로 고정한다.
 */
import type { GroupSignal } from '../../lib/nutrition';
import type { MealRow } from '../../lib/coachMaterials';

// 아린 모양: 비타민A채소 red(만성 결핍)·기타채소 yellow·나머지 green.
export const arinSignals: GroupSignal[] = [
  { group: '곡물', level: 'green', weeklyEst: 7 },
  { group: '콩류', level: 'green', weeklyEst: 3 },
  { group: '유제품', level: 'green', weeklyEst: 5 },
  { group: '고기·계란', level: 'green', weeklyEst: 6 },
  { group: '생선·해산물', level: 'yellow', weeklyEst: 1 },
  { group: '비타민A채소', level: 'red', weeklyEst: 1 },
  { group: '기타채소', level: 'yellow', weeklyEst: 3 },
  { group: '과일', level: 'green', weeklyEst: 5 },
];

// 집에서 잘 먹는 것(2일+·거부없음) = 밥·달걀. 급식 당근은 liked 아님(P10). 가지는 거부.
export const arinMeals: MealRow[] = [
  { food: '밥', place: 'home', ateWell: true, daysAgo: 1 },
  { food: '밥', place: 'home', ateWell: true, daysAgo: 2 },
  { food: '달걀', place: 'home', ateWell: true, daysAgo: 1 },
  { food: '달걀', place: 'home', ateWell: true, daysAgo: 3 },
  { food: '당근', place: 'daycare', ateWell: true, daysAgo: 1 },   // 급식 = 차려진 것 → liked 아님
  { food: '당근', place: 'daycare', ateWell: true, daysAgo: 2 },
  { food: '가지', place: 'home', ateWell: false, daysAgo: 2 },     // 거부 → refused
];

// 잘 먹는 '음식'(메뉴) — 미역국 포함(괴식 차단 검증용: 미역국+당근=1 제외돼야).
export const arinFavoriteFoods = ['볶음밥', '미역국', '김밥', '계란찜'];

// 온보딩(기록 2일) — 분석 대신 입력 안내+팁.
export const onboardingArgs = {
  signals: arinSignals,
  meals: arinMeals.slice(0, 2),
  favoriteFoods: arinFavoriteFoods,
  recentRecos: [] as string[],
  recordedDays: 2,
  onboardingMeta: { hasHeight: false, hasWeight: false, hasConditions: false },
  tipSeed: 7,
};

// 정상 분석 입력(기록 6일).
export const analyzeArgs = {
  signals: arinSignals,
  meals: arinMeals,
  favoriteFoods: arinFavoriteFoods,
  recentRecos: [] as string[],
  recordedDays: 6,
  onboardingMeta: { hasHeight: true, hasWeight: true, hasConditions: true },
  tipSeed: 3,
};
