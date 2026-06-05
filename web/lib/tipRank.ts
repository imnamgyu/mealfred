/**
 * 팁(블로그) 개인 맞춤 랭킹 — 순수 함수.
 *
 * 코칭 엔진이 매일 계산해 coach_letters.context에 저장한 신호(부족 식품군·영양소·시나리오·거부)
 * + children(만성질환·연령·다양성)을 받아, 발행 글을 그 사람에게 맞게 점수화한다.
 * 최신순이 아니라 '지금 이 부모에게 필요한 글'이 위로. 사유(reason)도 함께 내어 카드에 노출(인위적이지 않게).
 *
 * 콘텐츠 기반(content-based): 글 텍스트(제목·요약·카테고리·토픽)에서 태그를 뽑고,
 * 신호 → 태그 가중치와 매칭해 합산. 설명 가능(왜 추천됐는지 = 매칭된 최고 가중 태그).
 */

export type TipSignals = {
  missingGroups: string[];   // 부족 식품군(8군 라벨): 곡물·콩류·유제품·고기·계란·생선·해산물·비타민A채소·기타채소·과일
  reds: string[];            // 부족 영양소(KDRI 빨강)
  chronicText: string;       // children.chronic_conditions 자유서술(키워드 매칭)
  hasRefused: boolean;       // 최근 거부한 음식 있음
  scenarioId: string | null; // 오늘의 코칭 시나리오
  eatenCount: number;        // 최근 다양성(먹은 식재료 수)
  ageBand: string | null;
};

// 글에서 태그를 뽑는 키워드(제목·요약·카테고리·토픽 스캔). 영문은 소문자 비교.
const POST_TAG_KEYWORDS: Record<string, string[]> = {
  veg: ['채소', '녹채', '브로콜리', '쓴맛', '쓴 채소', '채소만', '시금치', '녹색'],
  protein: ['단백질', '고기', '생선', '계란', '달걀', '콩'],
  fruit: ['과일', '퓨레', '포우치'],
  texture: ['식감', '물컹', '텍스처', '씹', '감각'],
  diagnosis: ['arfid', '진단', '식이장애', '의학적', '경계', 'dsm', '아르피드', '양상'],
  diversity: ['30가지', '다양성', '비율', '시그널', '기준', '몇 가지', '가짓수'],
  bridge: ['다리', '사촌', '닮은', '브릿지', 'bridge', '두 입', 'betterbites', '닮'],
  reexposure: ['다시', '반복', '노출', '번까지', '거부', '다른 날'],
  age_infant: ['영유아', '첫 음식', '이유식', '보완식', '만 5세', '골든타임', '5년', '첫음식'],
  constipation: ['변비', '섬유'],
  anemia: ['철분', '빈혈', '철'],
  weight: ['체중', '비만', '저체중', '성장'],
  general: ['채널', '미션', '소개', '로드맵', '시작'],
};

const TAG_REASON: Record<string, string | null> = {
  veg: '요즘 채소가 부족해요',
  protein: '단백질군이 부족해요',
  fruit: '과일이 부족해요',
  texture: '식감 거부에 도움돼요',
  diagnosis: '편식 유형을 이해하는 글',
  diversity: '다양성을 늘리는 이야기',
  bridge: '안 먹던 음식에 다리 놓기',
  reexposure: '다시 시도하는 법',
  age_infant: '지금 시기에 중요한 글',
  constipation: '변비에 도움되는 이야기',
  anemia: '철분·빈혈 관련 글',
  weight: '성장·체중에 맞춘 글',
  general: null,
};

export type RankablePost = {
  slug: string;
  series_no: number;
  title: string;
  excerpt: string | null;
  category: string | null;
  topics: string[] | null;
};

/** 글 → 보유 태그 집합. */
export function postTagsOf(post: RankablePost): Set<string> {
  const hay = [post.title, post.excerpt || '', post.category || '', (post.topics || []).join(' ')]
    .join(' ').toLowerCase();
  const tags = new Set<string>();
  for (const [tag, kws] of Object.entries(POST_TAG_KEYWORDS)) {
    if (kws.some((k) => hay.includes(k.toLowerCase()))) tags.add(tag);
  }
  return tags;
}

const VEG_GROUPS = ['비타민A채소', '기타채소'];
const PROTEIN_GROUPS = ['고기·계란', '생선·해산물'];

/** 신호 → 사용자 태그 가중치. */
export function userTagWeights(s: TipSignals): Record<string, number> {
  const w: Record<string, number> = {};
  const add = (t: string, n: number) => { w[t] = (w[t] || 0) + n; };

  if (s.missingGroups.some((g) => VEG_GROUPS.includes(g))) add('veg', 3);
  if (s.missingGroups.some((g) => PROTEIN_GROUPS.includes(g))) add('protein', 3);
  if (s.missingGroups.includes('콩류')) add('protein', 1);
  if (s.missingGroups.includes('과일')) add('fruit', 2);

  if (s.reds.includes('철')) { add('anemia', 2); add('protein', 1); }

  const c = (s.chronicText || '').toLowerCase();
  if (c.includes('변비')) { add('constipation', 3); add('veg', 1); }
  if (c.includes('빈혈') || c.includes('철')) add('anemia', 3);
  if (c.includes('비만') || c.includes('저체중') || c.includes('체중') || c.includes('성장')) add('weight', 3);

  // 다양성 낮음(<30가지 = SOS 시그널) → 편식 기본 테마 부양
  if (s.eatenCount > 0 && s.eatenCount < 30) { add('diversity', 2); add('bridge', 2); add('reexposure', 1); add('diagnosis', 1); }
  if (s.hasRefused) { add('reexposure', 2); add('bridge', 1); add('texture', 1); }

  // 시나리오 보정(가볍게)
  const sid = (s.scenarioId || '').toLowerCase();
  if (sid.includes('refus') || sid.includes('reject') || sid.includes('거부')) add('reexposure', 1);
  if (sid.includes('transition') || sid.includes('전환')) add('bridge', 1);

  // 제품 자체가 영유아~초등 — 연령 글은 항상 약하게
  add('age_infant', 1);
  // 베이스라인(신호 없어도 편식 일반 글이 뜨게 — 무신호 부모도 빈 피드 방지)
  add('diversity', 1); add('reexposure', 1); add('bridge', 1);
  return w;
}

export type RankedTip = { slug: string; score: number; reason: string | null };

/**
 * 글 랭킹. daySeed로 동점 글은 매일 회전(다음날 다른 글). readSlugs는 뒤로(이미 읽음).
 */
export function rankTips(
  posts: RankablePost[],
  signals: TipSignals,
  opts?: { daySeed?: number; readSlugs?: Set<string> },
): RankedTip[] {
  const w = userTagWeights(signals);
  const daySeed = opts?.daySeed ?? 0;
  const readSlugs = opts?.readSlugs ?? new Set<string>();

  return posts.map((p) => {
    const tags = postTagsOf(p);
    let score = 0;
    let bestTag: string | null = null, bestW = 0;
    for (const t of tags) {
      const tw = w[t] || 0;
      if (tw <= 0) continue;
      score += tw;
      if (tw > bestW && TAG_REASON[t]) { bestW = tw; bestTag = t; }
    }
    score += (p.series_no || 0) * 0.001;                                   // 최신 미세 가점(동점 깨기)
    let slugHash = 0; for (let i = 0; i < p.slug.length; i++) slugHash = (slugHash * 31 + p.slug.charCodeAt(i)) >>> 0;
    score += ((daySeed + slugHash) % 5) * 0.02;                            // 일별 회전(동점권 안에서)
    if (readSlugs.has(p.slug)) score -= 50;                                // 이미 읽은 글은 뒤로
    return { slug: p.slug, score, reason: bestTag ? TAG_REASON[bestTag] : null };
  }).sort((a, b) => b.score - a.score);
}
