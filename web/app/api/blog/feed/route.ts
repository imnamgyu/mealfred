/**
 * GET /api/blog/feed — 팁 피드(블로그).
 * - 기본(익명/처음 방문): 공개 최신 발행순. 쿠키 안 읽고 service_role로 동일 결과 → **CDN 캐시**(s-maxage)로 즉시.
 * - ?me=1(로그인): user_tip_ranking 개인 맞춤 순서 + 🎯사유, no-store(개인화라 캐시 X·별도 URL 키라 충돌 없음).
 * 데이터는 전부 공개글(blog_posts status=public)이라 캐시 안전.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin, createSupabaseServer } from '@/lib/supabase/server';
import { BLOG_CARD_COLS, type BlogCard } from '@/lib/blog';

const PUBLIC_CACHE = 'public, s-maxage=300, stale-while-revalidate=86400';

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10)));
    const me = req.nextUrl.searchParams.get('me') === '1';
    const db = createSupabaseAdmin();   // 쿠키 미사용 = 익명 응답이 모두 동일 → CDN 캐시 가능
    const { data: postRows, error } = await db
      .from('blog_posts')
      .select(BLOG_CARD_COLS)
      .eq('status', 'public')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('series_no', { ascending: false });
    if (error) return NextResponse.json({ ok: true, posts: [], degraded: true });
    const posts = (postRows || []) as BlogCard[];

    // 익명/처음 방문 — 공개 최신순, CDN 캐시
    if (!me) {
      return NextResponse.json(
        { ok: true, personalized: false, posts: posts.slice(0, limit) },
        { headers: { 'Cache-Control': PUBLIC_CACHE } },
      );
    }

    // 로그인 — 개인 맞춤 순서 적용(쿠키 세션)
    const server = await createSupabaseServer();
    const { data: { user } } = await server.auth.getUser();
    if (user) {
      const { data: rank } = await server.from('user_tip_ranking')
        .select('slug_order,reasons').eq('parent_id', user.id).maybeSingle();
      if (rank?.slug_order?.length) {
        const reasons: Record<string, string> = rank.reasons || {};
        const rankIdx = new Map((rank.slug_order as string[]).map((s, i) => [s, i] as const));
        const sorted = [...posts].sort((a, b) => (rankIdx.get(a.slug) ?? Infinity) - (rankIdx.get(b.slug) ?? Infinity));
        return NextResponse.json(
          { ok: true, personalized: true, posts: sorted.slice(0, limit).map((p) => ({ ...p, reason: reasons[p.slug] || null })) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }
    }
    return NextResponse.json({ ok: true, personalized: false, posts: posts.slice(0, limit) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: true, posts: [], error: e instanceof Error ? e.message : 'error' });
  }
}
