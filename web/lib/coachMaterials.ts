/**
 * lib/coachMaterials.ts — Letter B 재료 엔진 (WBS v2-하이브리드 EPIC A)
 *
 * 사상(인계서 B): '무엇을 추천할지'(식재료·조합·근거)는 코드가 결정론으로 못 박고,
 *   '어떻게 쓸지'(문장·도입·톤)만 LLM에 푼다. 데이터+재료를 다 LLM에 맡기면 6통이
 *   '당근→미역국'으로 수렴(LLM이 매일 독립 최적화→같은 최적해)했다 → 재료는 코드가 회전.
 *
 * selectDailyMaterials(args)가 이 파일의 단일 산출물 — Letter B 작문가가 받을 사실·재료 묶음.
 * 전부 순수 함수(fs/HTTP·시계·LLM 불사용). Letter A(planFor/composeLetter)는 이 파일을 호출하지 않는다(대조군 보존).
 *
 * 원자: A-01 빈도 정비 · A-02 liked 판정 · A-04 4기준 랭킹 · A-05 회전 · A-06 결핍 수치 ·
 *       A-07 조합 검증 후보 · A-08 근거문구 · A-09 온보딩 가드 · A-10 오케스트레이터 · A-11 freqMap 어댑터.
 */
import { GROUP_INGREDIENTS, STAPLE_FORMS, stapleDisplay, safeGarnishOf, youaRankOf, type FreqMap } from './coachRecos';
import { strongPairsOf, verifiedCousinsOf } from './foodGraph';
import { scoreCombo } from './comboMatrix';
import { GROUP_TARGET, type GroupSignal, type GroupLevel } from './nutrition';
import COACH_TIPS from './coach-tips.json';
import LIVE_ING_FREQ from './ingredient-freq.json';

// ── A-01 — 실측 급식빈도 정비(I) ────────────────────────────────────────────────
// learned_menus 1000개 집계(인계서 실측표). 빈도 가중(A-04)에 쓰여 단호박(0회)이 가라앉게 한다.
export const GIO_FREQ: Record<string, { freq: number; pct: number }> = {
  '당근': { freq: 184, pct: 2 }, '토마토': { freq: 42, pct: 12 }, '브로콜리': { freq: 25, pct: 18 },
  '양배추': { freq: 20, pct: 24 }, '치즈': { freq: 18, pct: 27 }, '시금치': { freq: 13, pct: 33 },
  '근대': { freq: 11, pct: 39 }, '단호박': { freq: 0, pct: 100 }, '요거트': { freq: 0, pct: 100 },
};
// ⭐ 라이브 관측 빈도(이사님 2026-06-19 OCR 리밸런싱) — scripts/build-ingredient-freq.py가 OCR로 쌓인 meal_logs/learned_menus를
//   재집계해 lib/ingredient-freq.json을 갱신한다. 이 파일만 매일(크론) 다시 만들면 **코드 변경 0으로** 빈도 가중이 자동 리밸런싱된다.
//   GIO_FREQ(인계서 실측 스냅샷)는 라이브가 침묵하는 키의 폴백으로만 유지 — 겹치는 키 값이 동일해 골든은 그대로 그린.
const LIVE_FREQ = LIVE_ING_FREQ as Record<string, { freq: number; rank?: number; topPct: number }>;
/** 식재료의 급식빈도 메타. 라이브 관측(ingredient-freq.json) 우선 → GIO_FREQ 스냅샷 폴백 → 미상이면 {freq:0,pct:100}(빈도 가중 최하). */
export function ingredientGioFreq(nm: string): { freq: number; pct: number } {
  const live = LIVE_FREQ[nm];
  if (live && live.freq > 0) return { freq: live.freq, pct: live.topPct };   // 라이브 우선(매일 재집계 반영·pct=상위%)
  return GIO_FREQ[nm] || { freq: 0, pct: 100 };
}
/**
 * GROUP_INGREDIENTS를 식품군별로 급식빈도 내림차순 정렬한 사본(빈도 미상=0=끝).
 * ⚠️ 원본 GROUP_INGREDIENTS(coachRecos)는 무변경 — Letter A의 pickFoodReco(seed%length 회전) 결과 보존.
 * Array.sort는 안정 정렬(동률은 원본 순서 유지).
 */
export const GROUP_INGREDIENTS_RANKED: Record<string, string[]> = Object.fromEntries(
  Object.entries(GROUP_INGREDIENTS).map(([g, list]) => [
    g, [...list].sort((a, b) => ingredientGioFreq(b).freq - ingredientGioFreq(a).freq),
  ]),
);

// ── A-02 — liked 판정(D·P10) ───────────────────────────────────────────────────
export type MealRow = { food: string; place: string | null; ateWell: boolean | null; refused?: boolean; daysAgo: number; slot?: string | null };
/**
 * 진짜 '잘 먹는' 식재료 = 집(place≠daycare) + 서로 다른 2일 이상 + 거부 이력 없음.
 * 급식·간식(차려진 것)은 선호 신호 아님(제외). 거부(refused/ateWell=false)는 refused로 분리, liked와 충돌 시 refused 우선.
 */
export function deriveLikedIngredients(meals: MealRow[]): { liked: string[]; refused: string[] } {
  const refusedSet = new Set<string>();
  const homeDays: Record<string, Set<number>> = {};   // food → 거부 아닌 집 끼니가 등장한 '날(daysAgo)' 집합
  for (const m of meals || []) {
    if (!m.food) continue;
    if (m.refused === true || m.ateWell === false) { refusedSet.add(m.food); continue; }   // 거부
    const served = m.place === 'daycare' || m.place === 'snack' || (m.slot ? String(m.slot).includes('snack') : false);   // 차려진 것 = 선호 아님
    if (!served) (homeDays[m.food] ||= new Set()).add(m.daysAgo);   // place null/home = 집 통제
  }
  const liked = Object.entries(homeDays)
    .filter(([food, days]) => days.size >= 2 && !refusedSet.has(food))
    .map(([food]) => food);
  return { liked, refused: [...refusedSet] };
}

// ── A-04 — 4기준 가중 랭킹(C) ────────────────────────────────────────────────────
export const RANK_W = { urgency: 1, freq: 2, pair: 1.5, bridge: 1.5 } as const;
export type RankedIng = { ing: string; score: number; parts: { urgency: number; freq: number; pair: number; bridge: number } };
const pctToScore = (pct: number): number => (pct <= 5 ? 3 : pct <= 20 ? 2 : pct <= 40 ? 1 : 0);
/** 결핍 식품군 대표 식재료를 ①시급도 ②급식빈도% ③잘먹는음식 궁합 ④잘먹는채소 사촌 가중합으로 정렬. seed 블라인드 회전(pickFoodReco) 폐기. */
export function rankIngredients(args: { targetGroup: string; groupLevel: GroupLevel; liked: string[]; freqMap?: FreqMap }): RankedIng[] {
  const list = GROUP_INGREDIENTS_RANKED[args.targetGroup] || [];
  const likedSet = new Set((args.liked || []).filter(Boolean));
  const urgency = args.groupLevel === 'red' ? 3 : args.groupLevel === 'yellow' ? 1 : 0;
  const rows: RankedIng[] = list.map((ing) => {
    const pair = Math.min(2, strongPairsOf(ing).filter((n) => likedSet.has(n.nm)).length);   // 강한 궁합만(약신호 가점 차단)
    const bridge = [...likedSet].some((lk) => verifiedCousinsOf(lk).some((n) => n.nm === ing)) ? 2 : 0;   // 검증된 사촌만
    const freq = pctToScore(ingredientGioFreq(ing).pct);
    const parts = { urgency, freq, pair, bridge };
    const score = parts.urgency * RANK_W.urgency + parts.freq * RANK_W.freq + parts.pair * RANK_W.pair + parts.bridge * RANK_W.bridge;
    return { ing, score, parts };
  });
  // ⭐ 안전가산(이사님 2026-06-19): 점수 동률이면 '급식에 더 자주 나오는'(youa 등장률) 식재료를 먼저 — 골든 점수/parts는 무변경, 동률만 결정.
  const youaPct = (ing: string): number => youaRankOf(ing)?.pct ?? 0;
  rows.sort((a, b) => b.score - a.score
    || (youaPct(b.ing) - youaPct(a.ing))                                    // 급식 흔함 우선(동률 결정)
    || (ingredientGioFreq(b.ing).freq - ingredientGioFreq(a.ing).freq)
    || a.ing.localeCompare(b.ing));   // 결정론 타이브레이크
  return rows;
}

// ── A-05 — 3일 무재사용 회전(B) ──────────────────────────────────────────────────
/** 랭킹 최상위 중 최근 추천(recentRecos·기본 3일창)에 없는 것. 전부 쿨다운이면 랭킹 1위 폴백(null 금지). 결정론. */
export function rotateRecommendation(args: { ranked: { ing: string; score: number }[]; recentRecos: string[]; cooldownDays?: number }): string | null {
  const ranked = args.ranked || [];
  if (!ranked.length) return null;
  const recent = new Set(args.recentRecos || []);
  const fresh = ranked.find((r) => !recent.has(r.ing));   // ranked는 이미 score순 → 첫 fresh = 최상위 fresh
  return fresh ? fresh.ing : ranked[0].ing;
}

// ── A-06 — 결핍 기간 수치화(F) ────────────────────────────────────────────────────
const MEAL_GROUPS = ['비타민A채소', '기타채소', '콩류', '생선·해산물', '곡물', '고기·계란'];   // 간식 채널(과일·유제품) 제외
export type DeficiencyWindow = { group: string; daysOf7: number; threshold: number; level: GroupLevel };
/** 가장 시급한 끼니채널 결핍의 수치 사실. weeklyEst(7일 환산)→daysOf7·threshold=GROUP_TARGET.green. 전부 green이면 null(환각 방지). */
export function deficiencyWindow(signals: GroupSignal[], windowDays = 7): DeficiencyWindow | null {
  void windowDays;
  const cand = (signals || []).filter((s) => MEAL_GROUPS.includes(s.group) && s.level !== 'green');
  if (!cand.length) return null;
  const vegBonus = (g: string) => (g === '비타민A채소' || g === '기타채소' ? -5 : 0);   // 편식 핵심 = 채소 우선
  cand.sort((a, b) => ((a.level === 'red' ? 0 : 10) + vegBonus(a.group) + a.weeklyEst) - ((b.level === 'red' ? 0 : 10) + vegBonus(b.group) + b.weeklyEst));
  const top = cand[0];
  return { group: top.group, daysOf7: Math.round(top.weeklyEst), threshold: GROUP_TARGET[top.group]?.green ?? 5, level: top.level };
}

// ── A-07 — 검증 통과 조합 후보(A+D) ──────────────────────────────────────────────
export type ValidatedCombo = { liked: string; deficient: string; score: number; source: string };
/** 잘 먹는 음식 × 추천 결핍 식재료 중 isComboOk(임계) 통과분만. 미통과(미역국+당근)는 제외. 빈 결과 허용(조합 강요 금지). */
export function buildValidatedCombos(args: { recommendedIng: string; likedDishes: string[]; likedIngredients?: string[]; threshold?: number; max?: number }): ValidatedCombo[] {
  const th = args.threshold ?? 2;
  const max = args.max ?? 4;
  const ing = args.recommendedIng;
  const display = STAPLE_FORMS[ing] ? stapleDisplay(ing) : ing;   // 주식 곡물은 먹는 형태(밥·빵·면)로 표시
  const seen = new Set<string>();
  const out: ValidatedCombo[] = [];
  for (const dish of args.likedDishes || []) {
    const sc = scoreCombo(dish, ing);   // 점수는 원재료명(당근) 기준 — matrix가 식재료명 키
    if (sc.score < th) continue;
    const key = `${dish}|${display}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ liked: dish, deficient: display, score: sc.score, source: sc.source });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, max);
}

// ── A-08 — 근거 문구(C) ──────────────────────────────────────────────────────────
// 식재료별 영양 역할 짧은 라벨(LLM이 인용할 사실). 모호 기간어 없이 수치·역할만.
const NUTRI_ROLE: Record<string, string> = {
  '당근': '베타카로틴이 눈·면역에', '시금치': '철·엽산이', '근대': '철·비타민K가', '단호박': '베타카로틴·식이섬유가',
  '토마토': '리코펜·비타민C가', '브로콜리': '비타민C·엽산이', '양배추': '비타민U·식이섬유가', '애호박': '수분·식이섬유가',
  '치즈': '칼슘·단백질이', '요거트': '칼슘·유산균이', '우유': '칼슘·단백질이',
  '두부': '식물성 단백질·칼슘이', '검은콩': '단백질·안토시아닌이', '콩': '식물성 단백질이', '콩나물': '비타민C·아스파라긴산이',
  '고등어': '오메가3 DHA가', '연어': '오메가3·단백질이', '새우': '단백질·칼슘이', '멸치': '칼슘이',
  '달걀': '단백질·콜린이', '계란': '단백질·콜린이', '소고기': '철·단백질이', '닭고기': '단백질이',
  '현미': '식이섬유·비타민B가', '귀리': '식이섬유·베타글루칸이', '고구마': '식이섬유·베타카로틴이', '감자': '비타민C·탄수화물이',
};
/** 추천 식재료의 근거 사실 문구(LLM 재료). 급식빈도·결핍 수치·궁합·사촌·영양역할 — 전부 수치/사실, 모호 기간어 없음. */
export function buildReasonPhrases(args: {
  ing: string; parts?: { urgency: number; freq: number; pair: number; bridge: number };
  window?: DeficiencyWindow | null; pairLiked?: string | null; cousinOf?: string | null;
}): string[] {
  const out: string[] = [];
  const f = ingredientGioFreq(args.ing);
  if (f.pct <= 20) out.push(`${args.ing}은 급식에 자주 나오는 편이에요(상위 ${f.pct}%)`);
  if (args.window) out.push(`${args.window.group}가 최근 7일 중 ${args.window.daysOf7}일 등장했어요(권장 주 ${args.window.threshold}일)`);
  if (args.pairLiked) out.push(`잘 먹는 ${args.pairLiked}에 곁들이면 자연스러워요`);
  if (args.cousinOf) out.push(`${args.cousinOf}을 잘 먹으니 닮은 ${args.ing}도 도전해볼 만해요`);
  const role = NUTRI_ROLE[args.ing];
  if (role) out.push(`${args.ing}은 ${role} 좋아요`);
  return out;
}

// ── A-09 — 온보딩 가드(E) ────────────────────────────────────────────────────────
const TIPS = (COACH_TIPS as { pool: { id: string; body: string }[] }).pool || [];
const pickTipLocal = (seed: number): string => (TIPS.length ? TIPS[((Math.floor(seed) % TIPS.length) + TIPS.length) % TIPS.length].body : '');
export type LowDataResult =
  | { mode: 'onboarding'; missingInputs: string[]; tip: string }
  | { mode: 'analyze' };
/** 기록<3일이면 결핍 분석(환각 위험) 끄고 입력 안내+배경 없는 즉효 팁. ≥3일이면 분석 모드. */
export function materialsForLowData(args: { recordedDays: number; hasHeight?: boolean; hasWeight?: boolean; hasConditions?: boolean; mealCount: number; tipSeed: number }): LowDataResult {
  if (args.recordedDays >= 3) return { mode: 'analyze' };
  const missingInputs: string[] = [];
  if (!args.hasHeight) missingInputs.push('키');
  if (!args.hasWeight) missingInputs.push('몸무게');
  if (!args.hasConditions) missingInputs.push('알레르기·만성질환');
  if (args.mealCount < 3) missingInputs.push('끼니 기록');
  return { mode: 'onboarding', missingInputs, tip: pickTipLocal(args.tipSeed) };
}

// ── A-11 — freqMap 어댑터(C 죽은 코드 부활) ──────────────────────────────────────
/** route가 로드한 ingredient-recipes JSON을 FreqMap으로 안전 정규화(freq 내림차순). 형식 불량이면 {}(graceful). */
export function normalizeFreqMap(raw: unknown): FreqMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: FreqMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const arr = v
      .filter((x): x is { name: string; freq: number } => !!x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string' && typeof (x as { freq?: unknown }).freq === 'number')
      .map((x) => ({ name: x.name, freq: x.freq }))
      .sort((a, b) => b.freq - a.freq);
    if (arr.length) out[k] = arr;
  }
  return out;
}

// ── A-10 — 오케스트레이터 selectDailyMaterials ────────────────────────────────────
export type DailyMaterials = {
  mode: 'onboarding' | 'analyze';
  targetGroup: string | null;
  recommendedIng: string | null;
  validatedCombos: ValidatedCombo[];
  reasonPhrases: string[];
  deficiencyWindow: DeficiencyWindow | null;
  liked: string[];
  refused: string[];
  missingInputs?: string[];
  tip?: string;
};
/**
 * Letter B 재료 엔진 단일 진실. 온보딩 분기 → 결핍 수치 → liked 판정 → 4기준 랭킹 →
 * 3일 무재사용 회전 → 검증 통과 조합 → 근거 문구. 전부 결정론·순수(회전은 recentRecos 이력으로).
 * ⚠️ Letter B 전용 — Letter A(대조군)는 호출하지 않는다.
 */
export function selectDailyMaterials(args: {
  signals: GroupSignal[];
  meals: MealRow[];
  favoriteFoods: string[];
  recentRecos: string[];
  freqMap?: FreqMap;
  recordedDays: number;
  onboardingMeta?: { hasHeight?: boolean; hasWeight?: boolean; hasConditions?: boolean };
  tipSeed: number;
}): DailyMaterials {
  const om = args.onboardingMeta || {};
  const low = materialsForLowData({
    recordedDays: args.recordedDays, hasHeight: om.hasHeight, hasWeight: om.hasWeight,
    hasConditions: om.hasConditions, mealCount: (args.meals || []).length, tipSeed: args.tipSeed,
  });
  if (low.mode === 'onboarding') {
    return { mode: 'onboarding', targetGroup: null, recommendedIng: null, validatedCombos: [], reasonPhrases: [], deficiencyWindow: null, liked: [], refused: [], missingInputs: low.missingInputs, tip: low.tip };
  }
  const { liked, refused } = deriveLikedIngredients(args.meals);
  const win = deficiencyWindow(args.signals);
  if (!win) return { mode: 'analyze', targetGroup: null, recommendedIng: null, validatedCombos: [], reasonPhrases: [], deficiencyWindow: null, liked, refused };

  const ranked = rankIngredients({ targetGroup: win.group, groupLevel: win.level, liked, freqMap: args.freqMap });
  const recommendedIng = rotateRecommendation({ ranked, recentRecos: args.recentRecos });
  let pairLiked: string | null = null;
  let cousinOf: string | null = null;
  if (recommendedIng) {
    pairLiked = safeGarnishOf(recommendedIng).find((n) => liked.includes(n.nm))?.nm ?? null;   // 곁들임 안전(tray/매운/교차괴식 제외)
    cousinOf = liked.find((lk) => verifiedCousinsOf(lk).some((n) => n.nm === recommendedIng)) ?? null;   // 검증된 사촌만
  }
  const validatedCombos = recommendedIng
    ? buildValidatedCombos({ recommendedIng, likedDishes: args.favoriteFoods, likedIngredients: liked })
    : [];
  const parts = ranked.find((r) => r.ing === recommendedIng)?.parts;
  const reasonPhrases = recommendedIng ? buildReasonPhrases({ ing: recommendedIng, parts, window: win, pairLiked, cousinOf }) : [];

  return { mode: 'analyze', targetGroup: win.group, recommendedIng, validatedCombos, reasonPhrases, deficiencyWindow: win, liked, refused };
}
