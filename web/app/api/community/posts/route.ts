/**
 * GET /api/community/posts — 노하우 목록.
 * query: ?ing=식재료(도감 §6) · ?sort=new|hot · ?mine=1 · ?me=1 · ?limit=20
 * - 기본(익명/처음): 공개글 목록, 쿠키 미사용 → **CDN 캐시**(s-maxage)로 즉시.
 * - ?me=1 또는 ?mine=1(로그인): 쿠키 세션으로 내 반응(liked/tried) 머지, no-store(별도 URL 키라 캐시 충돌 없음).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { ageBandLabel } from '@/lib/community';

const PUBLIC_CACHE = 'public, s-maxage=120, stale-while-revalidate=86400';
const COLS = 'id,parent_id,child_id,author_nick,ingredients,body,photo_url,age_band,traits,method_type,difficulty,time_min,status,like_count,tried_count,created_at,is_official';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const ing = sp.get('ing');
    const sort = sp.get('sort') === 'hot' ? 'hot' : 'new';
    const mine = sp.get('mine') === '1';
    const me = sp.get('me') === '1' || mine;
    const limit = Math.min(40, Math.max(1, parseInt(sp.get('limit') || '20', 10)));

    // 익명/처음 방문 — 쿠키 안 읽고 공개글만(모두 동일 결과) → CDN 캐시
    if (!me) {
      const db = createSupabaseAdmin();
      let pq = db.from('community_posts').select(COLS).eq('status', 'public');
      if (ing) pq = pq.contains('ingredients', [ing]);
      pq = sort === 'hot'
        ? pq.order('like_count', { ascending: false }).order('tried_count', { ascending: false }).order('created_at', { ascending: false })
        : pq.order('created_at', { ascending: false });
      const { data: rows, error } = await pq.limit(limit);
      if (error) return NextResponse.json({ ok: true, posts: [], degraded: true });
      const posts = (rows || []).map((p) => ({ ...p, child_age_label: p.age_band ? ageBandLabel(p.age_band) : null }));
      return NextResponse.json({ ok: true, posts }, { headers: { 'Cache-Control': PUBLIC_CACHE } });
    }

    // 로그인 — 내 글(mine) / 내 반응 머지
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    let q = supabase.from('community_posts').select(COLS);
    if (mine) {
      if (!user) return NextResponse.json({ ok: true, posts: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
      q = q.eq('parent_id', user.id);
    } else {
      q = q.eq('status', 'public');
    }
    if (ing) q = q.contains('ingredients', [ing]);
    q = sort === 'hot'
      ? q.order('like_count', { ascending: false }).order('tried_count', { ascending: false }).order('created_at', { ascending: false })
      : q.order('created_at', { ascending: false });

    const { data: rows, error } = await q.limit(limit);
    if (error) return NextResponse.json({ ok: true, posts: [], degraded: true });

    const posts = (rows || []).map((p) => ({ ...p, child_age_label: p.age_band ? ageBandLabel(p.age_band) : null }));

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

    return NextResponse.json({ ok: true, posts }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: true, posts: [], error: e instanceof Error ? e.message : 'error' });
  }
}
