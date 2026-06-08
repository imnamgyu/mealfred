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
import { neighborsOf } from './foodGraph';
import { dishesForIngredient } from './kitGuide';
import { isSpicyDish } from './spicy';

export type FreqMap = Record<string, { name: string; freq: number }[]>;

// 부족 식품군 → 대표 식재료(도감 표준명). 과일은 간식 채널(lib/coach SNACK_CHANNEL)이라 제외.
const GROUP_INGREDIENTS: Record<string, string[]> = {
  '곡물': ['현미', '귀리', '잡곡', '고구마', '감자'],
  '콩류': ['두부', '검은콩', '콩', '콩나물'],
  '유제품': ['치즈', '요거트', '우유'],
  '고기·계란': ['달걀', '계란', '소고기', '닭고기', '메추리알'],
  '생선·해산물': ['고등어', '연어', '새우', '멸치'],
  '비타민A채소': ['단호박', '당근', '시금치', '근대'],
  '기타채소': ['브로콜리', '양배추', '애호박', '버섯', '토마토'],
};

// ⭐ 주식 곡물(이사님) — 밀·쌀은 '날것'으로 다른 식재료와 섞어/곁들여 먹지 않는다. 반드시 '먹는 형태'로만 추천: 밀→빵·면·떡, 쌀→밥·떡.
const STAPLE_FORMS: Record<string, string[]> = {
  '밀': ['빵', '면', '떡'], '밀가루': ['빵', '면', '떡'],
  '쌀': ['밥', '떡'], '멥쌀': ['밥', '떡'], '백미': ['밥', '떡'], '찹쌀': ['찰밥', '떡'],
  '보리': ['보리밥'], '현미': ['현미밥'], '잡곡': ['잡곡밥'], '귀리': ['오트밀', '귀리죽'], '기장': ['잡곡밥'], '수수': ['잡곡밥'],
};
/** 주식 곡물이면 '먹는 형태'(밥·빵·면·떡)로 표시. 아니면 원래 이름. (궁합/사촌 목록에서 날 곡물명 노출 방지) */
const stapleDisplay = (nm: string): string => (STAPLE_FORMS[nm] ? STAPLE_FORMS[nm][0] : nm);

/** 식재료가 '가장 많이 쓰이는 실존 음식' 최대 2개. 주식 곡물=먹는 형태 / freqMap(또래 급식 빈도) 우선 → kit-matrix(실측 count>0) 폴백. 매운 음식 제외. */
export function popularDishesFor(ing: string, freqMap?: FreqMap): string[] {
  if (STAPLE_FORMS[ing]) return STAPLE_FORMS[ing].slice(0, 2);   // 밀·쌀은 날것 아님 → 빵·면·떡·밥으로만
  const out: string[] = [];
  const fm = freqMap?.[ing];
  if (fm) for (const r of fm) { if (out.length >= 2) break; if (r.freq >= 4 && !isSpicyDish(r.name) && !out.includes(r.name)) out.push(r.name); }
  if (out.length < 2) for (const d of dishesForIngredient(ing, 2)) { if (out.length >= 2) break; if (d.count > 0 && !isSpicyDish(d.dish) && !out.includes(d.dish)) out.push(d.dish); }
  return out;
}

export type RecoFacts = { target: string | null; cousins: string[]; lines: string[]; text: string };

/**
 * 추천 사실 블록 — (a) 타깃(부족 식품군) 대표 식재료의 인기 음식 + 잘 먹는 식재료와의 궁합,
 * (b) 잘 먹는 식재료 → 사촌(+그 사촌의 인기 음식)·궁합. 전부 테이블 근거(편지는 이 목록 밖을 지어내지 않는다).
 */
export function buildRecoFacts(args: { likedIngredients: string[]; target?: string | null; freqMap?: FreqMap }): RecoFacts {
  const liked = (args.likedIngredients || []).slice(0, 8);
  const likedSet = new Set(liked);
  const lines: string[] = [];
  const cousins: string[] = [];

  // (a) 타깃(부족 식품군) — 대표 식재료의 인기 음식 + 잘 먹는 식재료와의 궁합(있으면)
  if (args.target && GROUP_INGREDIENTS[args.target]) {
    for (const ing of GROUP_INGREDIENTS[args.target]) {
      const dishes = popularDishesFor(ing, args.freqMap);
      if (!dishes.length) continue;
      const pairWithLiked = [...new Set(neighborsOf(ing).filter((n) => n.kind === 'pair' && likedSet.has(n.nm)).slice(0, 3).map((n) => stapleDisplay(n.nm)))].slice(0, 2);   // 주식은 먹는 형태(밥·빵)로
      lines.push(`[오늘 타깃 ${args.target}] ${ing} (또래 인기 음식: ${dishes.join('·')}${pairWithLiked.length ? ` · 잘 먹는 ${pairWithLiked.join('·')} 곁들이면 좋아요` : ''})`);
      break;   // 타깃은 대표 식재료 1개만
    }
  }

  // (b) 잘 먹는 식재료 → 사촌(+그 사촌의 인기 음식)·궁합
  for (const ing of liked) {
    if (lines.length >= 4) break;
    const nb = neighborsOf(ing);
    const cs = nb.filter((n) => n.kind === 'bridge' && !likedSet.has(n.nm) && !cousins.includes(n.nm)).slice(0, 1);
    const pr = [...new Set(nb.filter((n) => n.kind === 'pair' && !likedSet.has(n.nm)).slice(0, 3).map((n) => stapleDisplay(n.nm)))].slice(0, 2);   // 주식은 먹는 형태(밥·빵)로
    if (!cs.length && !pr.length) continue;
    const parts: string[] = [];
    for (const c of cs) {
      cousins.push(c.nm);
      if (STAPLE_FORMS[c.nm]) { parts.push(`사촌 ${stapleDisplay(c.nm)}`); continue; }   // 주식 곡물 사촌 = 먹는 형태(빵·떡·밥)로만
      const dishes = popularDishesFor(c.nm, args.freqMap);
      parts.push(dishes.length ? `사촌 ${c.nm}(또래 인기: ${dishes.join('·')})` : `사촌 ${c.nm}`);
    }
    if (pr.length) parts.push(`궁합 ${pr.join('·')}`);
    lines.push(`${stapleDisplay(ing)} → ${parts.join(' / ')}`);   // 앵커도 주식이면 먹는 형태(멥쌀→밥)로
  }

  return { target: args.target ?? null, cousins, lines, text: lines.join('\n') };
}
