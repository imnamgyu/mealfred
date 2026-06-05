/**
 * 블로그(팁) 타입 — 앱이 읽는 발행 글(blog_posts 테이블).
 * 본문(body_html)은 발행 스크립트가 .md를 렌더해 저장한 것. 앱은 그대로 렌더만.
 */
export type BlogPost = {
  slug: string;
  series_no: number;
  track: string | null;
  phase: string | null;
  phase_name: string | null;
  category: string | null;
  title: string;
  headline: string | null;
  excerpt: string | null;
  body_html: string;
  after_html: string | null;
  source: string | null;
  topics: string[];
  ingredients: string[];
  published_at: string | null;
  status: string;
};

/** 카드/리스트에 필요한 가벼운 형태(본문 제외). */
export type BlogCard = Pick<
  BlogPost,
  'slug' | 'series_no' | 'track' | 'phase_name' | 'category' | 'title' | 'excerpt' | 'topics' | 'ingredients' | 'published_at'
>;

export const BLOG_CARD_COLS =
  'slug,series_no,track,phase_name,category,title,excerpt,topics,ingredients,published_at';
