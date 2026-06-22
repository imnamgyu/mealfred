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
      if (seasonMonths(ing)) { seasonDen++; if (monthNum && inSeason(ing, monthNum)) seasonNum++; }
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
