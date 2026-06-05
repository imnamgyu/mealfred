/**
 * 레시피 빌더 사전·타입 — 클라(빌더)·서버(렌더) 공용.
 * 식재료 = 도감 표준명(도감 §6 연동 키). 조리방식 = 동사. 시간 = 선택.
 */
export const ING_EMOJI: Record<string, string> = {
  당근: '🥕', 계란: '🥚', 단호박: '🎃', 고구마: '🍠', 감자: '🥔', 시금치: '🥬', 브로콜리: '🥦',
  양파: '🧅', 대파: '🌿', 두부: '🧈', 치즈: '🧀', 밥: '🍚', 김: '🍙', 버섯: '🍄', 우유: '🥛',
  토마토: '🍅', 오이: '🥒', 가지: '🍆', 옥수수: '🌽', 콩: '🫘', 사과: '🍎', 바나나: '🍌',
  소고기: '🥩', 닭고기: '🍗', 돼지고기: '🥓', 새우: '🦐', 생선: '🐟', 미역: '🌿', 김치: '🥬',
};
export const COMMON_INGS = Object.keys(ING_EMOJI);
export function ingEmoji(name: string): string { return ING_EMOJI[name] || '🥄'; }

// 조리방식(동사) → 이모지
export const VERBS: Record<string, string> = {
  씻기: '💧', '껍질 벗기기': '🔪', '채 썰기': '✂️', 다지기: '🔪', 으깨기: '🥄', 섞기: '🥢',
  볶기: '🍳', 굽기: '🔥', 부치기: '🍳', 찌기: '♨️', 데치기: '🫧', 끓이기: '🍲', 조리기: '🥘',
  버무리기: '🥗', 담기: '🍽️',
};
export const VERB_LIST = Object.keys(VERBS);
export function verbEmoji(v: string): string { return VERBS[v] || '🍳'; }

export const TIME_OPTS = ['1분', '3분', '5분', '10분', '15분', '없음'];

export type RecipeStep = { ing: string; verb: string; time?: string; memo?: string };

export type Recipe = {
  id: string;
  dish: string;
  tip: string | null;
  photo_url: string | null;
  ingredients: string[];
  steps: RecipeStep[];
  author_nick: string | null;
  age_band: string | null;
  difficulty: string | null;
  time_min: number | null;
  is_official: boolean;
  like_count: number;
  tried_count: number;
  created_at: string;
  liked_by_me?: boolean;
  tried_by_me?: boolean;
};

export const RECIPE_LIST_COLS =
  'id,dish,tip,photo_url,ingredients,steps,author_nick,age_band,difficulty,time_min,is_official,like_count,tried_count,created_at';

/** 스텝에서 재료 목록(중복 제거, 등장 순). */
export function matsFromSteps(steps: RecipeStep[]): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const s of steps) { if (s.ing && !seen.has(s.ing)) { seen.add(s.ing); out.push(s.ing); } }
  return out;
}
