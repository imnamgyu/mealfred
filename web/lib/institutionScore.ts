/**
 * lib/institutionScore.ts — 기관 월별 식단 → 영양 점수(랭킹용) + DeepSeek 한 줄 총평.
 *
 * 이사님 2026-06-19: daycare-eval '우리 기관 상위 몇 등'.
 *  - 점수: 결정론 computeDiversityScore(daycareMode). 기관은 메뉴를 통제하므로 가공/반복 패널티 적용
 *    (= 부모 화면의 70:30 집/기관 가중과 달리, 기관 단독 줄세우기는 패널티 ON으로 좋은/나쁜 식단을 가른다).
 *  - 총평: DeepSeek(llmText) 한 줄 정성 코멘트. LLM 미가용/실패 시 결정론 폴백.
 * 서버 전용(menuMap이 fs로 도감 풀 로드).
 */
import { computeDiversityScore, groupOf, isProcessed } from './nutrition';
import { inSeason, seasonMonths } from './season';
import { mapMenuLocal } from './menuMap';
import { getIngredientsLight } from './graphSource';
import { llmText, parseLLMJson, hasLLMBackend } from './llmText';

export type OcrMenuItem = { date?: string | null; day?: string | null; slot?: string | null; menu?: string | null };

export type InstitutionScore = {
  score: number; diversityBase: number; gateCap: number;
  processed: number; repeat: number; redGroups: string[];
  dayCount: number; itemCount: number;
};

export type MenuItemRow = {
  institution_menu_id: string;
  menu_date: string | null;
  slot: string;
  menus: string[];
  ingredients: string[];
};

// nm→cat 맵(빗대기 영양평가 catOf) — cron/coach·care와 동일 소스(ingredients-light). 1회 구축.
let _catMap: Record<string, string> | null = null;
function catOf(ing: string): string | undefined {
  if (!_catMap) {
    const ij = getIngredientsLight() as { ingredients?: { nm: string; cat: string }[] };
    _catMap = {};
    (ij.ingredients || []).forEach((x) => { _catMap![x.nm] = x.cat; });
  }
  return _catMap[ing];
}

// care/page.tsx OCR_SLOT와 동일 — 한글 끼니 → slot 코드. 미상/영문코드는 그대로 통과(기본 lunch).
const SLOT_MAP: Record<string, string> = { '오전간식': 'am_snack', '점심': 'lunch', '오후간식': 'pm_snack' };
export function normalizeSlot(slot?: string | null): string {
  const s = (slot || '').trim();
  if (SLOT_MAP[s]) return SLOT_MAP[s];
  if (s === 'am_snack' || s === 'lunch' || s === 'pm_snack') return s;
  return 'lunch';
}

// 식단표 날짜 정규화: 'YYYY-MM-DD' 그대로 / 'DD'·'D'는 month+일로 보정 / 그 외 null.
function normalizeDate(dateRaw: string | null | undefined, month: string): string | null {
  const d = (dateRaw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{1,2}$/.test(d)) return `${month}-${d.padStart(2, '0')}`;
  const md = d.match(/(\d{1,2})[월./-]\s*(\d{1,2})/);   // 'M월 D일' / 'M/D' 형태
  if (md) return `${month.slice(0, 4)}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
  return null;
}

/** OCR items(날짜·끼니·메뉴) → 결정론 영양 점수(daycareMode·패널티 ON). */
export function scoreInstitutionMonth(items: OcrMenuItem[]): InstitutionScore {
  const byDate: Record<string, string[]> = {};
  const menusByMealMap: Record<string, string[]> = {};   // key = date|slot
  let itemCount = 0;
  for (const it of items) {
    const menu = (it.menu || '').trim();
    if (!menu) continue;
    itemCount++;
    const dateKey = (it.date || '').trim() || 'nodate';
    (menusByMealMap[`${dateKey}|${normalizeSlot(it.slot)}`] ||= []).push(menu);
    const mapped = mapMenuLocal(menu);
    const ings = mapped?.ingredients || [];
    if (ings.length) (byDate[dateKey] ||= []).push(...ings);
  }
  const ingredientsByDay = Object.values(byDate).filter((a) => a.length);
  const menusByMeal = Object.values(menusByMealMap).filter((a) => a.length);
  const r = computeDiversityScore({ ingredientsByDay, menusByMeal, catOf, applyMealPenalty: true, daycareMode: true });
  return {
    score: r.score, diversityBase: r.diversityBase, gateCap: r.gateCap,
    processed: r.processed, repeat: r.repeat, redGroups: r.redGroups,
    dayCount: ingredientsByDay.length, itemCount,
  };
}

/** OCR items → institution_menu_items 행(날짜+끼니로 묶고 식재료 매핑). 저장용. */
export function buildMenuItemRows(items: OcrMenuItem[], month: string, institutionMenuId: string): MenuItemRow[] {
  const grouped: Record<string, MenuItemRow> = {};
  for (const it of items) {
    const menu = (it.menu || '').trim();
    if (!menu) continue;
    const slot = normalizeSlot(it.slot);
    const menuDate = normalizeDate(it.date, month);
    const key = `${menuDate || 'nodate'}|${slot}`;
    if (!grouped[key]) grouped[key] = { institution_menu_id: institutionMenuId, menu_date: menuDate, slot, menus: [], ingredients: [] };
    if (!grouped[key].menus.includes(menu)) grouped[key].menus.push(menu);
    const mapped = mapMenuLocal(menu);
    for (const ing of mapped?.ingredients || []) if (!grouped[key].ingredients.includes(ing)) grouped[key].ingredients.push(ing);
  }
  return Object.values(grouped);
}

// ── ⭐ 강점지표(코호트 비교용) — '우리 원이 다른 원보다 특별히 뛰어난 점' (이사님 2026-06-22) ──
// 전부 결정론. 점수와 별개로, 같은 유형 코호트 percentile에서 가장 높은 1개만 긍정 노출(약점 절대 미노출).
export type StandoutDims = {
  seasonalFreshness: number; fishFrequency: number; legumeFrequency: number; lowProcessed: number;
  vegVariety: number; soupVariety: number; wholeGrain: number; proteinRotation: number;
};
export type StandoutKey = keyof StandoutDims;

// 노출 우선순위·라벨·문구(동률 타이브레이크 = 영유아 결핍 흔하고 집에서 바꾸기 어려운 군 순).
export const STANDOUT_META: { key: StandoutKey; label: string; phrase: string; low: string; priority: number }[] = [
  { key: 'fishFrequency',     label: '생선·해산물',   phrase: '오메가3가 풍부한 생선을 다른 원보다 자주 올려요',          low: '생선을 잘 챙기는 편이에요',           priority: 1 },
  { key: 'seasonalFreshness', label: '제철 식재료',   phrase: '이번 달 제철 식재료를 다른 원보다 자주 챙겨요',            low: '제철 식재료가 돋보이는 편이에요',     priority: 2 },
  { key: 'legumeFrequency',   label: '콩류',          phrase: '두부·콩 같은 식물성 단백질을 다른 원보다 자주 챙겨요',     low: '두부·콩을 잘 챙기는 편이에요',         priority: 3 },
  { key: 'wholeGrain',        label: '통곡물·잡곡',   phrase: '흰쌀밥 대신 잡곡·통곡물을 다른 원보다 자주 섞어요',        low: '잡곡·통곡물이 돋보이는 편이에요',     priority: 4 },
  { key: 'proteinRotation',   label: '단백질 다양성', phrase: '단백질을 고기·생선·콩·계란으로 골고루 돌려요',            low: '단백질 급원이 다양한 편이에요',       priority: 5 },
  { key: 'vegVariety',        label: '채소 다양성',   phrase: '다양한 종류의 채소를 다른 원보다 폭넓게 써요',            low: '채소 종류가 다양한 편이에요',         priority: 6 },
  { key: 'soupVariety',       label: '국·탕 다양성',  phrase: '국·탕 종류를 다양하게 돌려 다른 원보다 폭이 넓어요',      low: '국·탕이 다양한 편이에요',             priority: 7 },
  { key: 'lowProcessed',      label: '저가공',        phrase: '가공식품 대신 자연 식재료로 차린 끼니가 다른 원보다 많아요', low: '자연 식재료 비중이 높은 편이에요',     priority: 8 },
];

const WHOLE_GRAIN_RE = /현미|잡곡|보리|흑미|기장|수수|차조|귀리|메밀|오곡|혼합곡|콩밥|통곡/;
const WHOLE_GRAIN_ING = new Set(['현미', '잡곡', '보리', '귀리', '흑미', '기장', '수수', '메밀', '보리(겉보리)']);
const SOUP_RE = /(국|탕|찌개|전골|국밥)$/;

/** OCR items + month(YYYY-MM) → 8개 강점 raw 지표(결정론). 코호트 percentile은 rank에서 산출. */
export function computeStandoutDims(items: OcrMenuItem[], month: string): StandoutDims {
  const monthNum = parseInt(month.slice(5, 7), 10) || 0;
  const daySet = new Set<string>();
  const dayGroups: Record<string, Set<string>> = {};
  const mealMenus: Record<string, string[]> = {};               // date|slot → menus
  const vegSet = new Set<string>(), proteinSet = new Set<string>(), soupSet = new Set<string>();
  let seasonNum = 0, seasonDen = 0, riceMeals = 0, wholeRiceMeals = 0;

  for (const it of items) {
    const menu = (it.menu || '').trim(); if (!menu) continue;
    const date = (it.date || '').trim() || 'nodate';
    daySet.add(date);
    const mealKey = `${date}|${normalizeSlot(it.slot)}`;
    (mealMenus[mealKey] ||= []).push(menu);
    const flat = menu.replace(/\s/g, '');
    const ings = mapMenuLocal(menu)?.ingredients || [];
    for (const ing of ings) {
      const g = groupOf(ing, catOf);
      if (g) (dayGroups[date] ||= new Set()).add(g);
      if (g === '비타민A채소' || g === '기타채소') vegSet.add(ing);
      if (g === '고기·계란' || g === '생선·해산물' || g === '콩류' || g === '유제품') proteinSet.add(ing);
      if (flat.includes(ing) && seasonMonths(ing)) { seasonDen++; if (monthNum && inSeason(ing, monthNum)) seasonNum++; }   // ⭐ 제철=메뉴명에 이름이 직접 든 식재료만(분해 숨은재료 제외, 이사님 2026-06-23)
    }
    if (SOUP_RE.test(flat) && !isProcessed(menu).hit) soupSet.add(flat);
    if (/밥$/.test(flat)) { riceMeals++; if (WHOLE_GRAIN_RE.test(flat) || ings.some((i) => WHOLE_GRAIN_ING.has(i))) wholeRiceMeals++; }
  }

  const dayCount = Math.max(1, daySet.size);
  let fishDays = 0, legumeDays = 0;
  for (const d of Object.keys(dayGroups)) {
    if (dayGroups[d].has('생선·해산물')) fishDays++;
    if (dayGroups[d].has('콩류')) legumeDays++;
  }
  const meals = Object.values(mealMenus);
  let pw = 0;
  for (const ms of meals) { let w = 0; for (const m of ms) { const p = isProcessed(m); if (p.hit) w = Math.max(w, p.kind === 'ultra' ? 1 : 0.7); } pw += w; }

  return {
    seasonalFreshness: seasonDen ? +(seasonNum / seasonDen).toFixed(3) : 0,
    fishFrequency: +((fishDays / dayCount) * 7).toFixed(2),
    legumeFrequency: +((legumeDays / dayCount) * 7).toFixed(2),
    lowProcessed: meals.length ? +(1 - pw / meals.length).toFixed(3) : 1,
    vegVariety: vegSet.size,
    soupVariety: soupSet.size,
    wholeGrain: riceMeals ? +(wholeRiceMeals / riceMeals).toFixed(3) : 0,
    proteinRotation: proteinSet.size,
  };
}

// ── ⭐ 7축 점수(부모 daycare-eval evaluate()와 동일 개념·임계값을 서버에서 — 어드민 리스트용, 이사님 2026-06-22) ──
// 다양성=groupOf·가공=isProcessed 재사용. KDRI·알레르겐·조리·제철 상수만 클라에서 복제(7축 단일 기준 유지).
export type SevenAxes = { diversity: number; kdri: number; repeat: number; allergen: number; nova: number; season: number; cuisine: number };
const SVN_NUTRI: Record<string, string[]> = {
  '당근': ['비타민A', '비타민K', '식이섬유'], '시금치': ['철', '엽산', '비타민K', '비타민A', '마그네슘'], '근대': ['철', '엽산', '비타민K'],
  '계란': ['콜린', '비타민D', '단백질', '비타민B12', '셀레늄'], '달걀': ['콜린', '비타민D', '단백질', '비타민B12', '셀레늄'],
  '연어': ['비타민D', 'EPA-DHA', '단백질', '셀레늄'], '고등어': ['EPA-DHA', '비타민D', '셀레늄'],
  '두부': ['칼슘', '단백질', '철', '마그네슘'], '우유': ['칼슘', '비타민D', '단백질', '인', '비타민B2'], '치즈': ['칼슘', '단백질', '비타민A'],
  '소고기': ['철', '아연', '단백질', '비타민B12', '니아신'], '돼지고기': ['비타민B1', '단백질', '아연', '인'], '닭고기': ['단백질', '니아신', '비타민B6', '셀레늄'],
  '미역': ['요오드', '칼슘', '식이섬유'], '김': ['철', '요오드', '비타민A'], '다시마': ['요오드', '칼슘'],
  '브로콜리': ['비타민C', '비타민K', '엽산', '식이섬유'], '토마토': ['리코펜', '비타민C', '칼륨'],
  '고구마': ['비타민A', '비타민C', '식이섬유', '칼륨'], '감자': ['비타민C', '칼륨', '비타민B6'],
  '사과': ['비타민C', '식이섬유'], '바나나': ['칼륨', '마그네슘', '비타민B6'], '블루베리': ['안토시아닌', '비타민C', '식이섬유'],
  '호두': ['오메가3', '마그네슘', '비타민E'], '아몬드': ['비타민E', '마그네슘', '칼슘'],
  '양파': ['비타민C', '식이섬유'], '대파': ['비타민A', '비타민C'], '마늘': ['셀레늄', '비타민B6'],
  '콩나물': ['비타민C', '엽산', '식이섬유'], '배추': ['비타민C', '엽산', '식이섬유'],
  '양배추': ['비타민C', '비타민K', '식이섬유'], '오이': ['비타민K', '칼륨'], '호박': ['비타민A', '비타민C'],
  '멸치': ['칼슘', '단백질', '비타민D'], '갈치': ['단백질', '비타민D'], '새우': ['셀레늄', '단백질', '아연'],
  '귤': ['비타민C', '엽산'], '딸기': ['비타민C', '엽산', '식이섬유'], '키위': ['비타민C', '비타민K', '칼륨'],
  '현미': ['식이섬유', '마그네슘', '비타민B1'], '귀리': ['식이섬유', '철', '마그네슘'], '잡곡': ['식이섬유', '마그네슘'],
  '된장': ['단백질', '철', '칼륨'], '요거트': ['칼슘', '단백질', '비타민B2'], '요구르트': ['칼슘', '단백질'],
};
const SVN_ALLERGEN = ['우유', '계란', '달걀', '메밀', '땅콩', '대두', '콩', '밀', '새우', '게', '고등어', '조개', '복숭아', '토마토', '호두', '잣', '아황산'];
const SVN_CUISINE: Record<string, string[]> = {
  korean: ['김치', '된장', '미역', '나물', '조림', '무침', '쌈', '국밥', '비빔', '갈비', '불고기', '잡채', '떡', '죽', '전', '튀김', '찜', '국', '찌개', '구이', '볶음'],
  western: ['스파게티', '파스타', '오믈렛', '샐러드', '샌드위치', '햄버거', '피자', '스튜', '리조또', '크림', '수프'],
  japanese: ['우동', '돈부리', '소바', '오니기리', '낫토', '미소', '돈가스', '계란찜', '초밥', '롤', '데리야끼', '규동'],
  chinese: ['짜장', '짬뽕', '탕수육', '깐풍기', '마파두부', '볶음밥', '꽃빵', '만두', '잡채'],
  asian: ['카레', '쌀국수', '월남쌈', '반미', '팟타이', '나시고렝'],
};
const SVN_SEASON: Record<number, string[]> = {
  1: ['배추', '무', '시금치', '고구마', '귤', '굴', '대구', '미역'], 2: ['시금치', '봄동', '딸기', '미역', '꼬막', '대구'],
  3: ['딸기', '냉이', '쑥', '미나리', '시금치', '봄동', '바지락'], 4: ['딸기', '달래', '쑥', '미나리', '봄동', '도다리', '꽃게'],
  5: ['딸기', '참외', '완두콩', '양배추', '오이', '토마토', '다시마'], 6: ['감자', '마늘', '애호박', '오이', '토마토', '매실', '오징어'],
  7: ['수박', '복숭아', '옥수수', '오이', '가지', '토마토', '고등어', '오징어'], 8: ['수박', '복숭아', '포도', '옥수수', '가지', '오징어', '갈치'],
  9: ['배', '포도', '단감', '고구마', '단호박', '고등어', '전어', '새송이버섯'], 10: ['고구마', '단호박', '무', '사과', '단감', '배', '고등어'],
  11: ['배', '사과', '단감', '귤', '무', '배추', '대구', '새우'], 12: ['귤', '배추', '무', '시금치', '고구마', '딸기', '대구', '고등어'],
};
const SVN_STAPLE = ['우유', '김치', '깍두기', '단무지', '보리차', '둥글레차', '메밀차', '옥수수차', '생수', '요구르트', '요거트', '백미밥', '잡곡밥', '흰밥', '기장밥', '수수밥', '쌀밥', '현미밥', '찹쌀밥'];

/** OCR items + month → 7축 점수(부모 화면과 동일 임계값). 어드민 리스트 표시용. */
export function computeSevenAxes(items: OcrMenuItem[], month: string): SevenAxes {
  const monthNum = parseInt(month.slice(5, 7), 10) || 0;
  const lines: string[] = []; const allIngs = new Set<string>(); const cats = new Set<string>(); const groups = new Set<string>(); const nutri = new Set<string>();
  const namedSeasonal = new Set<string>(); const seasonList = SVN_SEASON[monthNum] || [];   // ⭐ 제철=메뉴명에 이름이 직접 든 식재료만
  let scan = '';
  for (const it of items) {
    const menu = (it.menu || '').trim(); if (!menu) continue;
    lines.push(menu);
    const flat = menu.replace(/\s/g, '');
    const ings = mapMenuLocal(menu)?.ingredients || [];
    scan += menu + ' ' + ings.join(' ') + '\n';
    for (const ing of ings) {
      allIngs.add(ing);
      const c = catOf(ing); if (c) cats.add(c);
      const g = groupOf(ing, catOf); if (g) groups.add(g);
      const ns = SVN_NUTRI[ing]; if (ns) ns.forEach((n) => nutri.add(n));
      if (seasonList.includes(ing) && flat.includes(ing)) namedSeasonal.add(ing);   // ⭐ 제철=메뉴명에 이름이 직접 든 식재료만(분해 숨은재료 제외)
    }
  }
  // 1. 식품군 다양성
  const mdd = groups.size, sub = cats.size;
  const diversity = mdd <= 4 ? 40 + mdd * 8 : mdd <= 6 ? 55 + mdd * 5 : mdd === 7 ? 78 : sub >= 10 ? 95 : sub >= 7 ? 90 : sub >= 5 ? 85 : 80;
  // 2. KDRI 31
  const np = nutri.size / 31;
  const kdri = np >= 0.8 ? 95 : np >= 0.6 ? 90 : np >= 0.45 ? 85 : np >= 0.35 ? 80 : np >= 0.22 ? 70 : 50 + Math.round(np * 100);
  // 3. 메뉴 반복도
  const freq: Record<string, number> = {};
  for (const line of lines) { if (SVN_STAPLE.some((k) => line.includes(k))) continue; const key = line.replace(/[\s,]/g, '').slice(0, 8); if (key) freq[key] = (freq[key] || 0) + 1; }
  const maxRep = Math.max(1, ...Object.values(freq));
  const repeat = maxRep <= 2 ? 95 : maxRep <= 4 ? 80 : maxRep <= 6 ? 60 : 40;
  // 4. 알레르겐
  const am = SVN_ALLERGEN.filter((k) => scan.includes(k)).length;
  const allergen = am >= 3 ? 100 : 80;
  // 5. 가공식품(NOVA) — isProcessed 재사용
  let ultra = 0, proc = 0;
  for (const m of lines) { const p = isProcessed(m); if (p.hit) { if (p.kind === 'ultra') ultra++; else proc++; } }
  const novaPct = lines.length ? (ultra + proc * 0.3) / lines.length : 0;
  const nova = novaPct < 0.08 ? 95 : novaPct < 0.18 ? 88 : novaPct < 0.3 ? 78 : 65;
  // 6. 제철(식단 월 · 메뉴명에 이름이 직접 든 제철 식재료만 — '돼지고기볶음'의 숨은 양파 등 제외)
  const sm = namedSeasonal.size;
  const season = sm >= 3 ? 95 : sm >= 2 ? 90 : sm >= 1 ? 85 : 75;
  // 7. 조리 스타일
  const cu = new Set<string>();
  for (const [k, kws] of Object.entries(SVN_CUISINE)) if (kws.some((kw) => scan.includes(kw))) cu.add(k);
  const cuisine = cu.size >= 4 ? 95 : cu.size >= 3 ? 85 : cu.size >= 2 ? 70 : 60;
  return { diversity, kdri, repeat, allergen, nova, season, cuisine };
}

// ── ⭐ 공식 종합점수 = 7축 가중 평균(이사님 2026-06-24 확정) ──────────────────────────
// 단일 진실: 실시간 업로드·대량적재·재집계·백필·학부모 화면이 모두 이 가중치를 쓴다(산식 split-brain 종결).
// 7축 전부 '높을수록 우수'(반복적음·저가공 포함). 변별력 약한 알레르겐(80/100 2값)은 최소 가중.
//   ※ daycare-eval.html(클라)·_fix-institution-scores.mjs(백필)에도 같은 숫자를 복제 — 바꾸면 3곳 동기화.
export const AXIS_WEIGHTS: Record<keyof SevenAxes, number> = {
  diversity: 24, kdri: 22, nova: 16, repeat: 14, season: 10, cuisine: 8, allergen: 6,
};
/** 7축 → 공식 종합점수(가중 평균·0~100 정수). 가중치 단일 소스 = AXIS_WEIGHTS. */
export function sevenAxisScore(axes: SevenAxes, weights: Record<keyof SevenAxes, number> = AXIS_WEIGHTS): number {
  let num = 0, den = 0;
  for (const k of Object.keys(weights) as (keyof SevenAxes)[]) {
    const w = weights[k]; const v = Number(axes[k]);
    if (!w || !Number.isFinite(v)) continue;
    num += v * w; den += w;
  }
  return den ? Math.round(num / den) : 0;
}

/** DeepSeek 한 줄 정성 총평(랭킹 카드용). 점수·등급·순위 언급 금지. 실패 시 결정론 폴백. */
// ⭐ 긍정 칭찬 전용(이사님 2026-06-22). 약점·부족·점수·순위 언급 금지 — 기관은 모두 훌륭하다는 전략과 정합.
//   (extra 필드는 호출 호환을 위해 optional로 받되 약점 노출에 쓰지 않는다.)
export async function summarizeInstitutionMenu(input: {
  institutionName: string; score?: number; redGroups?: string[]; processed?: number; repeat?: number;
}): Promise<string> {
  const fallback = '영양사 선생님과 어린이급식관리지원센터 지원으로 식품군이 고르게 짜인 든든한 식단이에요.';
  if (!hasLLMBackend()) return fallback;
  try {
    const text = await llmText({
      role: 'flash', maxTokens: 160, json: true, temperature: 0.6,
      system: '너는 영유아 급식 영양 코치다. 어린이집/유치원 한 달 식단을 부모에게 한 줄로 따뜻하고 긍정적으로 칭찬한다. 약점·부족·아쉬움·점수·등급·순위·숫자 언급 절대 금지. 특정 기관 비난 금지. 35자 이내 존댓말. 영양사·어린이급식관리지원센터의 노고를 인정하는 톤.',
      user: `기관명: ${input.institutionName}\n부모에게 보여줄 따뜻한 '한 줄 칭찬'을 JSON으로: {"summary":"…"}`,
    });
    const s = (parseLLMJson<{ summary?: string }>(text)?.summary || '').trim();
    return s || fallback;
  } catch { return fallback; }
}
