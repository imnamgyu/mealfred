/**
 * POST /api/blog/read  { slug } — 블로그 열람 기록.
 * 추천 크론이 이미 읽은 글을 뒤로 보내 '다음 읽을 글'을 위로. 로그인 사용자만, 멱등 upsert.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { slug } = await req.json().catch(() => ({ slug: '' }));
    if (!slug || typeof slug !== 'string') return NextResponse.json({ ok: false }, { status: 400 });
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: true, skipped: 'anon' });
    await supabase.from('blog_reads').upsert(
      { parent_id: user.id, slug, read_at: new Date().toISOString() },
      { onConflict: 'parent_id,slug' },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' });
  }
}
