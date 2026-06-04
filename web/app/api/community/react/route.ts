/**
 * POST /api/community/react — 좋아요/해봤어요 토글(포인트 X, 선정 신호).
 * body: { post_id, kind: 'like'|'tried', on: boolean }
 * 셀프 반응 차단. unique(post_id,user_id,kind)로 중복 차단. 트리거가 posts 카운트 동기화.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { post_id, kind, on } = await req.json();
    if (!post_id || (kind !== 'like' && kind !== 'tried')) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });

    const { data: post } = await supabase.from('community_posts').select('parent_id').eq('id', post_id).maybeSingle();
    if (!post) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    if (post.parent_id === user.id) return NextResponse.json({ ok: false, error: '본인 글에는 반응할 수 없어요.' }, { status: 200 });

    if (on) {
      await supabase.from('community_reactions').upsert({ post_id, user_id: user.id, kind }, { onConflict: 'post_id,user_id,kind', ignoreDuplicates: true });
    } else {
      await supabase.from('community_reactions').delete().eq('post_id', post_id).eq('user_id', user.id).eq('kind', kind);
    }
    return NextResponse.json({ ok: true, on: !!on });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 200 });
  }
}
