/**
 * GET /api/blog/feed — 팁 피드(개인 맞춤 순서).
 * 로그인 + 랭킹(user_tip_ranking) 있으면 그 순서로 + 추천 사유(reason) 부착.
 * 비로그인/랭킹 없음 → 최신 발행순 폴백. 랭킹에 없는 신규 글은 뒤에 최신순으로 덧붙임.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseServerAnon } from '@/lib/supabase/server';
import { BLOG_CARD_COLS, type BlogCard } from '@/lib/blog';

export async function GET(req: NextRequest) {
  try {
    const anon = await createSupabaseServerAnon();
    const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10)));
    const { data: postRows, error } = await anon
      .from('blog_posts')
      .select(BLOG_CARD_COLS)
      .eq('status', 'public')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('series_no', { ascending: false });
    if (error) return NextResponse.json({ ok: true, posts: [], degraded: true });
    const posts = (postRows || []) as BlogCard[];

    // 로그인 사용자면 개인 랭킹 적용
    const server = await createSupabaseServer();
    const { data: { user } } = await server.auth.getUser();
    if (user) {
      const { data: rank } = await server.from('user_tip_ranking')
        .select('slug_order,reasons').eq('parent_id', user.id).maybeSingle();
      if (rank?.slug_order?.length) {
        const order: string[] = rank.slug_order;
        const reasons: Record<string, string> = rank.reasons || {};
        const rankIdx = new Map(order.map((s, i) => [s, i] as const));
        const sorted = [...posts].sort((a, b) => {
          const ai = rankIdx.has(a.slug) ? rankIdx.get(a.slug)! : Infinity;
          const bi = rankIdx.has(b.slug) ? rankIdx.get(b.slug)! : Infinity;
          return ai - bi;   // 랭킹에 없는 신규 글은 뒤(이미 published_at desc 정렬됨)
        });
        return NextResponse.json({
          ok: true,
          personalized: true,
          posts: sorted.slice(0, limit).map((p) => ({ ...p, reason: reasons[p.slug] || null })),
        });
      }
    }

    return NextResponse.json({ ok: true, personalized: false, posts: posts.slice(0, limit) });
  } catch (e) {
    return NextResponse.json({ ok: true, posts: [], error: e instanceof Error ? e.message : 'error' });
  }
}
