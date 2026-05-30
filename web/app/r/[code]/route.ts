/**
 * GET /r/[code] — 초대링크 방문 처리.
 *
 * 방문자 쿠키(mf_vid)로 사람을 식별해 (code, visitor_id) 1행만 기록(중복 방문 무시).
 * 가입은 안 해도 카운트 → 5명 방문 시 초대자 평생 무료(referralBilling).
 * 기록 후 가입 페이지로 보냄.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const dest = new URL(`/signup?ref=${encodeURIComponent(code)}`, req.url);
  const res = NextResponse.redirect(dest);

  if (!code || !/^[a-z0-9]{4,24}$/i.test(code)) return res;

  const jar = await cookies();
  let vid = jar.get('mf_vid')?.value;
  if (!vid) {
    vid = crypto.randomUUID();
    res.cookies.set('mf_vid', vid, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', path: '/' });
  }

  try {
    const db = createSupabaseAdmin();
    // 존재하는 코드만 기록 (임의 코드 스팸 방지)
    const { data: ref } = await db.from('app_referrals').select('parent_id').eq('code', code).maybeSingle();
    if (ref) {
      await db.from('app_referral_visits').upsert({ code, visitor_id: vid }, { onConflict: 'code,visitor_id', ignoreDuplicates: true });
    }
  } catch { /* 카운트 실패는 리다이렉트를 막지 않는다 */ }

  return res;
}
