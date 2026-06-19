/**
 * lib/institutionScore.ts — 기관 월별 식단 → 영양 점수(랭킹용) + DeepSeek 한 줄 총평.
 *
 * 이사님 2026-06-19: daycare-eval '우리 기관 상위 몇 등'.
 *  - 점수: 결정론 computeDiversityScore(daycareMode). 기관은 메뉴를 통제하므로 가공/반복 패널티 적용
 *    (= 부모 화면의 70:30 집/기관 가중과 달리, 기관 단독 줄세우기는 패널티 ON으로 좋은/나쁜 식단을 가른다).
 *  - 총평: DeepSeek(llmText) 한 줄 정성 코멘트. LLM 미가용/실패 시 결정론 폴백.
 * 서버 전용(menuMap이 fs로 도감 풀 로드).
 */
import { computeDiversityScore } from './nutrition';
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

/** DeepSeek 한 줄 정성 총평(랭킹 카드용). 점수·등급·순위 언급 금지. 실패 시 결정론 폴백. */
export async function summarizeInstitutionMenu(input: {
  institutionName: string; score: number; redGroups: string[]; processed: number; repeat: number;
}): Promise<string> {
  const { institutionName, score, redGroups, processed, repeat } = input;
  const fallback = redGroups.length
    ? `${redGroups.slice(0, 2).join('·')}이(가) 다소 적은 편이에요. 가정에서 가볍게 채워주면 좋아요.`
    : (processed > 8 ? '가공식품 비중이 조금 있지만 전반적으로 식품군이 다양해요.' : '식품군이 고르게 짜인 식단이에요.');
  if (!hasLLMBackend()) return fallback;
  try {
    const text = await llmText({
      role: 'flash', maxTokens: 200, json: true, temperature: 0.5,
      system: '너는 영유아 급식 영양 코치다. 어린이집/유치원 한 달 식단의 영양 다양성을 부모에게 한 줄로 따뜻하게 요약한다. 점수·등급·순위·숫자 언급 금지, 특정 기관 비난 금지, 40자 이내 존댓말.',
      user: `기관: ${institutionName}\n부족 식품군: ${redGroups.join('·') || '없음'}\n가공식품 패널티: ${processed}\n반복 패널티: ${repeat}\n\n부모에게 보여줄 '한 줄 총평'을 JSON으로: {"summary":"…"}`,
    });
    const s = (parseLLMJson<{ summary?: string }>(text)?.summary || '').trim();
    return s || fallback;
  } catch { return fallback; }
}
