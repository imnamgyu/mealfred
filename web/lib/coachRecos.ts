/**
 * lib/coachRecos.ts — 코칭 음식·식재료 추천을 네트워크 테이블로 '근거화'(환각·괴식 차단).
 *
 *  ② 잘 먹는 식재료 → 사촌(food-graph bridge)  ②′ 궁합(food-graph pair)
 *  ① 그 식재료가 '가장 많이 쓰이는 실존 음식'(ingredient-recipes freq · kit-matrix 실측 count)
 *
 *  설계 원칙(이사님): 추상 '조리법'을 추천하면 LLM이 조합을 지어내다 괴식이 난다.
 *  → 우리는 **또래가 실제로 가장 자주 먹는 '음식 이름'**만 권한다(조합은 그 음식 안에 이미 들어 있음).
 *  조리법 상세(양념·불세기)는 주지 않는다(부모가 검색). 궁합도 그래프(실측)만, 지어낸 궁합 금지.
 *
 *  순수 함수 — fs/HTTP 불사용. freqMap(ingredient-recipes)은 호출자가 주입(없으면 kit-matrix 폴백).
 */
import { strongPairsOf, verifiedCousinsOf } from './foodGraph';
import { dishesForIngredient } from './kitGuide';
import { isSpicyDish } from './spicy';

export type FreqMap = Record<string, { name: string; freq: number }[]>;

// 부족 식품군 → 대표 식재료(도감 표준명). 과일은 간식 채널(lib/coach SNACK_CHANNEL)이라 제외.
// ⚠️ 정렬·내용 무변경(Letter A pickFoodReco seed%length 회전 보존) — coachMaterials가 빈도 순 사본(RANKED)을 별도로 만든다.
export const GROUP_INGREDIENTS: Record<string, string[]> = {
  '곡물': ['현미', '귀리', '잡곡', '고구마', '감자'],
  '콩류': ['두부', '검은콩', '콩', '콩나물'],
  '유제품': ['치즈', '요거트', '우유'],
  '고기·계란': ['달걀', '계란', '소고기', '닭고기', '메추리알'],
  '생선·해산물': ['고등어', '연어', '새우', '멸치'],
  '비타민A채소': ['단호박', '당근', '시금치', '근대'],
  '기타채소': ['브로콜리', '양배추', '애호박', '버섯', '토마토'],
};

// ⭐ 주식 곡물(이사님) — 밀·쌀은 '날것'으로 다른 식재료와 섞어/곁들여 먹지 않는다. 반드시 '먹는 형태'로만 추천: 밀→빵·면·떡, 쌀→밥·떡.
export const STAPLE_FORMS: Record<string, string[]> = {
  '밀': ['빵', '면', '떡'], '밀가루': ['빵', '면', '떡'],
  '쌀': ['밥', '떡'], '멥쌀': ['밥', '떡'], '백미': ['밥', '떡'], '찹쌀': ['찰밥', '떡'],
  '보리': ['보리밥'], '현미': ['현미밥'], '잡곡': ['잡곡밥'], '귀리': ['오트밀', '귀리죽'], '기장': ['잡곡밥'], '수수': ['잡곡밥'],
};
/** 주식 곡물이면 '먹는 형태'(밥·빵·면·떡)로 표시. 아니면 원래 이름. (궁합/사촌 목록에서 날 곡물명 노출 방지) */
export const stapleDisplay = (nm: string): string => (STAPLE_FORMS[nm] ? STAPLE_FORMS[nm][0] : nm);

// ⭐ 영유아 안전 조리 접두(이사님 2026-06-14: "단호박" 말고 "찐 단호박" — 생물로 오인 방지·조리법+식재료 푸드체이닝).
//   생채소·생선·말린콩·알류처럼 '익혀야 하는' 식재료에만 접두를 붙인다. 가공식품(두부·치즈·곡물 밥형태)은 접두 없음.
const COOK_ADJ: Record<string, string> = {
  // 찐 — 박과·전분뿌리(푹 쪄서 으깨기 좋음)
  단호박: '찐', 감자: '찐', 고구마: '찐', 토란: '찐', 밤: '찐', 돼지감자: '찐',
  // 데친 — 잎·줄기채소·콩나물·갑각(끓는 물에 살짝)
  시금치: '데친', 근대: '데친', 브로콜리: '데친', 양배추: '데친', 콩나물: '데친', 애호박: '데친', 아욱: '데친',
  청경채: '데친', 케일: '데친', 비름나물: '데친', 콜리플라워: '데친', 방울양배추: '데친', 숙주나물: '데친', 새우: '데친', 오징어: '데친',
  // 익힌 — 단단한 뿌리·열매(채 썰거나 볶아 부드럽게)
  당근: '익힌', 토마토: '익힌', 비트: '익힌', 무: '익힌', 우엉: '익힌', 연근: '익힌', 가지: '익힌', 피망: '익힌', 파프리카: '익힌', 오이: '익힌',
  // 삶은 — 말린 콩·알류(완전히 익혀)
  검은콩: '삶은', '콩(대두)': '삶은', 콩: '삶은', 완두: '삶은', 강낭콩: '삶은', 달걀: '삶은', 계란: '삶은', 메추리알: '삶은',
  // 구운/조린 — 생선(가시 발라)
  고등어: '구운', 연어: '구운', 삼치: '구운', 갈치: '구운', 명태: '조린', 대구: '조린', 가자미: '구운',
  // 볶은 — 버섯·잔멸치
  버섯: '볶은', 느타리버섯: '볶은', 표고버섯: '볶은', 양송이버섯: '볶은', 팽이버섯: '볶은', 멸치: '볶은',
  // 익힌 — 고기(완전히 익혀 잘게)
  소고기: '익힌', 돼지고기: '익힌', 닭고기: '삶은', 오리고기: '익힌',
};
/** 조리법+식재료 표기. 익혀야 하는 식재료면 "찐 단호박"처럼 접두를 붙이고, 주식 곡물은 먹는 형태(밥·떡), 그 외(두부·치즈·과일 등)는 원래 이름. */
export const cookedName = (nm: string): string => (STAPLE_FORMS[nm] ? stapleDisplay(nm) : (COOK_ADJ[nm] ? `${COOK_ADJ[nm]} ${nm}` : nm));

/** 식재료가 '가장 많이 쓰이는 실존 음식' 최대 2개. 주식 곡물=먹는 형태 / freqMap(또래 급식 빈도) 우선 → kit-matrix(실측 count>0) 폴백. 매운 음식 제외. */
export function popularDishesFor(ing: string, freqMap?: FreqMap): string[] {
  if (STAPLE_FORMS[ing]) return STAPLE_FORMS[ing].slice(0, 2);   // 밀·쌀은 날것 아님 → 빵·면·떡·밥으로만
  const out: string[] = [];
  const fm = freqMap?.[ing];
  if (fm) for (const r of fm) { if (out.length >= 2) break; if (r.freq >= 4 && !isSpicyDish(r.name) && !out.includes(r.name)) out.push(r.name); }
  if (out.length < 2) for (const d of dishesForIngredient(ing, 2)) { if (out.length >= 2) break; if (d.count > 0 && !isSpicyDish(d.dish) && !out.includes(d.dish)) out.push(d.dish); }
  return out;
}

/**
 * ⭐ 거울용 구체 추천(2026-06-13, 이사님: 그룹명 말고 구체 음식 — 잘먹는것·사촌·푸드체이닝 전략).
 * 전략 우선순위: ① liked(아이가 이미 잘 먹는 그 그룹 식재료를 한 번 더) → ② pair(잘 먹는 것에 곁들이기)
 *   → ③ chain(잘 먹는 것의 사촌이 결핍군에 있으면 푸드체이닝) → ④ dish(또래 인기 음식으로 도전) → ⑤ plain.
 * 전부 테이블 근거(괴식 0). likedIngredients=시계열 잘 먹는 식재료(호출자가 meal_logs에서).
 */
export type FoodReco = { group: string; food: string; via: 'liked' | 'pair' | 'chain' | 'dish' | 'plain'; pairLiked?: string; dish?: string };
export function pickFoodReco(args: { target: string; likedIngredients: string[]; freqMap?: FreqMap; seed?: number }): FoodReco | null {
  const reps0 = GROUP_INGREDIENTS[args.target];
  if (!reps0 || !reps0.length) return null;
  // ⭐ 식재료 다양화(이사님 06-13 '유제품 계속 우유'·'당근 반복') — '잘 먹는 것' 고착 대신 대표 식재료를 날짜로 회전하고,
  //   그 식재료의 관계(잘먹음/궁합/푸드체이닝/도전)로 프레이밍. → 우유→요거트→치즈, 당근→단호박→시금치.
  const off = (((args.seed || 0) % reps0.length) + reps0.length) % reps0.length;
  const rep = reps0[off];   // 오늘의 추천 식재료(회전)
  const liked = new Set((args.likedIngredients || []).filter(Boolean));
  if (liked.has(rep)) return { group: args.target, food: stapleDisplay(rep), via: 'liked' };
  const pl = strongPairsOf(rep).find((n) => liked.has(n.nm));   // 궁합 — 잘 먹는 것에 곁들이기(강한 pair만·약신호 곁들임 차단)
  if (pl) return { group: args.target, food: rep, via: 'pair', pairLiked: stapleDisplay(pl.nm) };
  for (const lk of liked) {   // 푸드체이닝 — 잘 먹는 것의 검증된 사촌이 이 rep이면
    if (verifiedCousinsOf(lk).some((n) => n.nm === rep)) return { group: args.target, food: rep, via: 'chain', pairLiked: stapleDisplay(lk) };
  }
  const d = popularDishesFor(rep, args.freqMap);   // 또래 인기 음식으로 도전
  if (d.length) return { group: args.target, food: rep, via: 'dish', dish: d[0] };
  return { group: args.target, food: stapleDisplay(rep), via: 'plain' };
}

/**
 * ⭐ 주간 노출 타깃(이사님 Task#11): 본문(exposure)이 노출할 '실제 결핍 도전 음식'을 영양 신호에서 산출.
 *   기존 mission_target(콩류)이 실제로 green이면 거울(채소·과일 결핍)과 모순 → 끼니 채널 결핍군의 도전 음식으로 정렬.
 *   끼니 채널만(과일·유제품=간식 제외), 채소 우선, '아직 안 먹는 것(도전)' 우선. 주간 1개 고정(푸드체이닝 일관성).
 */
const MEAL_GROUPS = ['비타민A채소', '기타채소', '콩류', '생선·해산물', '곡물', '고기·계란'];
export function weeklyExposureTarget(signals: { group: string; level: string; weeklyEst: number }[], liked: string[], seed = 0): string | null {
  const cand = (signals || []).filter((s) => MEAL_GROUPS.includes(s.group) && s.level !== 'green');
  if (!cand.length) return null;
  const vegBonus = (g: string) => (g === '비타민A채소' || g === '기타채소' ? -5 : 0);   // 편식 핵심 = 채소 우선
  cand.sort((a, b) => ((a.level === 'red' ? 0 : 10) + vegBonus(a.group) + a.weeklyEst) - ((b.level === 'red' ? 0 : 10) + vegBonus(b.group) + b.weeklyEst));
  const reps = GROUP_INGREDIENTS[cand[0].group] || [];
  if (!reps.length) return null;
  const likedSet = new Set(liked || []);
  const challenge = reps.filter((r) => !likedSet.has(r));   // 도전 = 아직 잘 안 먹는 것
  const pool = challenge.length ? challenge : reps;
  const pick = pool[(((seed % pool.length) + pool.length) % pool.length)];
  return stapleDisplay(pick);
}

/** 식재료 → 소속 식품군(역색인). 풀이 여러 군에 걸칠 때 라벨용. */
const ING_GROUP: Record<string, string> = (() => { const m: Record<string, string> = {}; for (const [g, list] of Object.entries(GROUP_INGREDIENTS)) for (const i of list) if (!m[i]) m[i] = g; return m; })();
export const groupOfIngredient = (ing: string): string | null => ING_GROUP[ing] || null;

export type IngredientPool = { pool: string[]; mode: 'supply' | 'challenge' | 'mixed'; reason: string };
/**
 * ⭐ 주간 추천 식재료 풀(이사님 2026-06-14): 주간 계획 시 '먹으면 좋을 식재료 5개'를 영양 거울 기반으로 선정 →
 *   일일은 이 풀을 '돌아가며' 추천(같은 식재료 연속 금지·6/2·6/3 콩 반복 방지).
 *   선정 규칙: ① 영양이 많이 무너질수록(red 2+) '보급 위주' — 결핍군 대표 식재료(채소·심각도 우선).
 *   ② 영양 균형 OK면 '도전' — 잘 먹는 것의 검증된 사촌(푸드체이닝) + 아직 안 먹는 인기 식재료.
 *   ③ 그 사이면 혼합. 전부 사촌(food-graph bridge) 고려. 과일·유제품(간식채널) 제외. 순수 함수.
 */
export function buildIngredientPool(args: { signals: { group: string; level: string; weeklyEst: number }[]; likedIngredients: string[]; freqMap?: FreqMap; max?: number }): IngredientPool {
  const max = args.max ?? 5;
  const likedSet = new Set((args.likedIngredients || []).filter(Boolean));
  const meal = (args.signals || []).filter((s) => MEAL_GROUPS.includes(s.group));
  const red = meal.filter((s) => s.level === 'red');
  const nonGreen = meal.filter((s) => s.level !== 'green');
  const vegBonus = (g: string) => (g === '비타민A채소' || g === '기타채소' ? -5 : 0);
  nonGreen.sort((a, b) => ((a.level === 'red' ? 0 : 10) + vegBonus(a.group) + a.weeklyEst) - ((b.level === 'red' ? 0 : 10) + vegBonus(b.group) + b.weeklyEst));
  const pool: string[] = [];
  const add = (x?: string | null) => { if (x && !pool.includes(x) && pool.length < max) pool.push(x); };
  const cousinsOfLiked = () => { const out: string[] = []; for (const lk of (args.likedIngredients || []).slice(0, 8)) for (const c of verifiedCousinsOf(lk)) if (!likedSet.has(c.nm) && groupOfIngredient(c.nm) && MEAL_GROUPS.includes(groupOfIngredient(c.nm)!)) out.push(c.nm); return out; };

  let mode: IngredientPool['mode'];
  if (red.length >= 2) {
    mode = 'supply';   // 많이 무너짐 → 결핍군 대표 보급(심각도순 라운드로빈)
    const reps = nonGreen.map((s) => (GROUP_INGREDIENTS[s.group] || []).filter(Boolean));
    for (let i = 0; pool.length < max && reps.some((r) => r[i]); i++) for (const r of reps) add(r[i]);
  } else if (red.length === 0 && nonGreen.length <= 1) {
    mode = 'challenge';   // 균형 OK → 사촌(푸드체이닝) + 아직 안 먹는 도전
    for (const c of cousinsOfLiked()) add(c);
    for (const s of nonGreen) for (const r of (GROUP_INGREDIENTS[s.group] || [])) if (!likedSet.has(r)) add(r);
  } else {
    mode = 'mixed';   // 1 red 또는 yellow 多 → 보급 + 사촌 도전 섞기
    for (const s of nonGreen) { const r = (GROUP_INGREDIENTS[s.group] || []).find((x) => !likedSet.has(x)) || (GROUP_INGREDIENTS[s.group] || [])[0]; add(r); }
    for (const c of cousinsOfLiked()) add(c);
  }
  if (!pool.length) for (const s of nonGreen) for (const r of (GROUP_INGREDIENTS[s.group] || [])) add(r);   // 폴백
  return { pool: pool.slice(0, max), mode, reason: `${mode}(red ${red.length}·결핍군 ${nonGreen.length})` };
}

export type RecoFacts = { target: string | null; cousins: string[]; lines: string[]; text: string };

/**
 * 추천 사실 블록 — (a) 타깃(부족 식품군) 대표 식재료의 인기 음식 + 잘 먹는 식재료와의 궁합,
 * (b) 잘 먹는 식재료 → 사촌(+그 사촌의 인기 음식)·궁합. 전부 테이블 근거(편지는 이 목록 밖을 지어내지 않는다).
 */
export function buildRecoFacts(args: { likedIngredients: string[]; target?: string | null; targetIngredient?: string | null; freqMap?: FreqMap }): RecoFacts {
  const liked = (args.likedIngredients || []).slice(0, 8);
  const likedSet = new Set(liked);
  const lines: string[] = [];
  const cousins: string[] = [];

  // (a) 타깃 — 오늘의 추천 식재료의 인기 음식 + 잘 먹는 식재료와의 궁합.
  //   ⭐ targetIngredient(주간 풀에서 일일 회전된 식재료)가 오면 그것을 쓴다(매일 그룹 첫 대표=두부 반복 방지·6/2·6/3 콩 사고).
  //   없으면 기존대로 target 그룹의 첫 대표(하위호환).
  const headCandidates = args.targetIngredient
    ? [args.targetIngredient]
    : (args.target && GROUP_INGREDIENTS[args.target] ? GROUP_INGREDIENTS[args.target] : []);
  for (const ing of headCandidates) {
    const dishes = popularDishesFor(ing, args.freqMap);
    if (!dishes.length && !STAPLE_FORMS[ing]) continue;
    const grp = args.target || groupOfIngredient(ing) || '오늘';
    const pairWithLiked = [...new Set(strongPairsOf(ing).filter((n) => likedSet.has(n.nm)).slice(0, 3).map((n) => stapleDisplay(n.nm)))].slice(0, 2);   // 강한 궁합만(약신호 곁들임 차단)·주식은 먹는 형태
    const dishStr = (dishes.length ? dishes : (STAPLE_FORMS[ing] || [])).join('·');
    lines.push(`[오늘 타깃 ${grp}] ${cookedName(ing)} (또래 인기 음식: ${dishStr}${pairWithLiked.length ? ` · 잘 먹는 ${pairWithLiked.join('·')} 곁들이면 좋아요` : ''})`);   // ⭐ 조리법+식재료(찐 단호박) — 생물 오인 방지
    break;   // 오늘 추천 식재료 1개만
  }

  // (b) 잘 먹는 식재료 → 사촌(+그 사촌의 인기 음식)·궁합
  for (const ing of liked) {
    if (lines.length >= 4) break;
    const cs = verifiedCousinsOf(ing).filter((n) => !likedSet.has(n.nm) && !cousins.includes(n.nm)).slice(0, 1);   // 검증된 사촌만
    const pr = [...new Set(strongPairsOf(ing).filter((n) => !likedSet.has(n.nm)).slice(0, 3).map((n) => stapleDisplay(n.nm)))].slice(0, 2);   // 강한 궁합만·주식은 먹는 형태
    if (!cs.length && !pr.length) continue;
    const parts: string[] = [];
    for (const c of cs) {
      cousins.push(c.nm);
      if (STAPLE_FORMS[c.nm]) { parts.push(`사촌 ${stapleDisplay(c.nm)}`); continue; }   // 주식 곡물 사촌 = 먹는 형태(빵·떡·밥)로만
      const dishes = popularDishesFor(c.nm, args.freqMap);
      parts.push(dishes.length ? `사촌 ${cookedName(c.nm)}(또래 인기: ${dishes.join('·')})` : `사촌 ${cookedName(c.nm)}`);   // ⭐ 조리법+식재료(찐 단호박)
    }
    if (pr.length) parts.push(`궁합 ${pr.join('·')}`);
    lines.push(`${stapleDisplay(ing)} → ${parts.join(' / ')}`);   // 앵커도 주식이면 먹는 형태(멥쌀→밥)로
  }

  return { target: args.target ?? null, cousins, lines, text: lines.join('\n') };
}
