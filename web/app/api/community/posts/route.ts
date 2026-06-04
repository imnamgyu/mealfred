/**
 * GET /api/community/posts — 노하우 목록.
 * query: ?ing=식재료(도감 §6) · ?sort=new|hot · ?mine=1 · ?limit=20
 * 공개글(+ 본인 글)은 RLS로 비로그인도 조회. 로그인 시 내 반응(liked/tried) 머지.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ageBandLabel } from '@/lib/community';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const sp = req.nextUrl.searchParams;
    const ing = sp.get('ing');
    const sort = sp.get('sort') === 'hot' ? 'hot' : 'new';
    const mine = sp.get('mine') === '1';
    const limit = Math.min(40, Math.max(1, parseInt(sp.get('limit') || '20', 10)));

    const { data: { user } } = await supabase.auth.getUser();

    let q = supabase.from('community_posts')
      .select('id,parent_id,child_id,author_nick,ingredients,body,photo_url,age_band,traits,method_type,difficulty,time_min,status,like_count,tried_count,created_at,is_official');
    if (mine) {
      if (!user) return NextResponse.json({ ok: true, posts: [] });
      q = q.eq('parent_id', user.id);
    } else {
      q = q.eq('status', 'public');
    }
    if (ing) q = q.contains('ingredients', [ing]);
    q = sort === 'hot'
      ? q.order('like_count', { ascending: false }).order('tried_count', { ascending: false }).order('created_at', { ascending: false })
      : q.order('created_at', { ascending: false });

    const { data: rows, error } = await q.limit(limit);
    if (error) {
      // 테이블 미생성 등 — 빈 목록으로 graceful(콜드스타트 UI가 시드로 채움)
      return NextResponse.json({ ok: true, posts: [], degraded: true });
    }

    const posts = (rows || []).map((p) => ({
      ...p,
      child_age_label: p.age_band ? ageBandLabel(p.age_band) : null,
    }));

    // 로그인 시 내 반응 머지
    if (user && posts.length) {
      const ids = posts.map((p) => p.id);
      const { data: reacts } = await supabase.from('community_reactions')
        .select('post_id,kind').eq('user_id', user.id).in('post_id', ids);
      const liked = new Set((reacts || []).filter((r) => r.kind === 'like').map((r) => r.post_id));
      const tried = new Set((reacts || []).filter((r) => r.kind === 'tried').map((r) => r.post_id));
      for (const p of posts as Array<Record<string, unknown> & { id: string }>) {
        p.liked_by_me = liked.has(p.id);
        p.tried_by_me = tried.has(p.id);
      }
    }

    return NextResponse.json({ ok: true, posts });
  } catch (e) {
    return NextResponse.json({ ok: true, posts: [], error: e instanceof Error ? e.message : 'error' });
  }
}
