/**
 * GET /api/blog/posts — 발행 블로그 목록(팁 피드용).
 * query: ?limit=20
 * 공개글(status=public)은 RLS로 비로그인도 조회. 본문은 빼고 카드 필드만.
 * 추천엔진(Phase 2)이 붙기 전 기본 정렬 = 최신 발행순.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerAnon } from '@/lib/supabase/server';
import { BLOG_CARD_COLS } from '@/lib/blog';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerAnon();
    const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10)));
    const { data, error } = await supabase
      .from('blog_posts')
      .select(BLOG_CARD_COLS)
      .eq('status', 'public')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('series_no', { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ ok: true, posts: [], degraded: true });
    return NextResponse.json({ ok: true, posts: data || [] });
  } catch (e) {
    return NextResponse.json({ ok: true, posts: [], error: e instanceof Error ? e.message : 'error' });
  }
}
