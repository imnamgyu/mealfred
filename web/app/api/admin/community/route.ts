/**
 * POST /api/admin/community — 노하우 모더레이션(숨기기/복구). 관리자(@mealfred.com)만.
 * body: { post_id, action: 'hide'|'unhide' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';

export async function POST(req: NextRequest) {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const { post_id, action } = await req.json();
  if (!post_id || (action !== 'hide' && action !== 'unhide')) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });

  const status = action === 'hide' ? 'hidden' : 'public';
  const admin = createSupabaseAdmin();
  const { error } = await admin.from('community_posts').update({ status }).eq('id', post_id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  return NextResponse.json({ ok: true, status });
}
