/**
 * POST /api/community/report — 노하우 신고(누적 3건 자동 블라인드, 올리브영식).
 * body: { post_id }
 * 신고자 dedup = community_reactions(kind='report', unique). 집계·hidden 전환은 service_role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';

const HIDE_THRESHOLD = 3;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { post_id } = await req.json();
    if (!post_id) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });

    // 신고자 1인 1회(트리거는 like/tried만 카운트하므로 report는 안전)
    await supabase.from('community_reactions').upsert({ post_id, user_id: user.id, kind: 'report' }, { onConflict: 'post_id,user_id,kind', ignoreDuplicates: true });

    try {
      const admin = createSupabaseAdmin();
      const { count } = await admin.from('community_reactions').select('id', { count: 'exact', head: true }).eq('post_id', post_id).eq('kind', 'report');
      const reports = count ?? 0;
      await admin.from('community_posts').update({ report_count: reports, ...(reports >= HIDE_THRESHOLD ? { status: 'hidden' } : {}) }).eq('id', post_id);
    } catch (e) { console.error('[community/report]', e instanceof Error ? e.message : e); }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 200 });
  }
}
