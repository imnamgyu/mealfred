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

/** 식재료가 '가장 많이 쓰이는 실존 음식' 최대 2개. freqMap(또래 급식 빈도) 우선 → kit-matrix(실측 count>0) 폴백. 매운 음식 제외. */
export function popularDishesFor(ing: string, freqMap?: FreqMap): string[] {
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
      const pairWithLiked = neighborsOf(ing).filter((n) => n.kind === 'pair' && likedSet.has(n.nm)).slice(0, 2).map((n) => n.nm);
      lines.push(`[오늘 타깃 ${args.target}] ${ing} (또래 인기 음식: ${dishes.join('·')}${pairWithLiked.length ? ` · 잘 먹는 ${pairWithLiked.join('·')} 곁들이면 좋아요` : ''})`);
      break;   // 타깃은 대표 식재료 1개만
    }
  }

  // (b) 잘 먹는 식재료 → 사촌(+그 사촌의 인기 음식)·궁합
  for (const ing of liked) {
    if (lines.length >= 4) break;
    const nb = neighborsOf(ing);
    const cs = nb.filter((n) => n.kind === 'bridge' && !likedSet.has(n.nm) && !cousins.includes(n.nm)).slice(0, 1);
    const pr = nb.filter((n) => n.kind === 'pair' && !likedSet.has(n.nm)).slice(0, 2).map((n) => n.nm);
    if (!cs.length && !pr.length) continue;
    const parts: string[] = [];
    for (const c of cs) {
      cousins.push(c.nm);
      const dishes = popularDishesFor(c.nm, args.freqMap);
      parts.push(dishes.length ? `사촌 ${c.nm}(또래 인기: ${dishes.join('·')})` : `사촌 ${c.nm}`);
    }
    if (pr.length) parts.push(`궁합 ${pr.join('·')}`);
    lines.push(`${ing} → ${parts.join(' / ')}`);
  }

  return { target: args.target ?? null, cousins, lines, text: lines.join('\n') };
}
