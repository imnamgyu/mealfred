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
  // 카카오톡 인앱·CDN이 302를 캐시해 다음 클릭에서 서버 라우트를 건너뛰지 않게(방문 누락 방지)
  res.headers.set('Cache-Control', 'no-store, max-age=0');

  if (!code || !/^[a-z0-9]{4,24}$/i.test(code)) return res;

  // OG 미리보기 봇(카카오 스크래퍼 등)의 프리페치는 사람 방문으로 세지 않음.
  // 주의: 'kakaotalk' 단독(=실제 인앱 웹뷰 사용자)은 봇이 아님 — 'kakaotalk-scrap'만 제외.
  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  const isBot = /bot|crawler|spider|facebookexternalhit|kakaotalk-scrap|slackbot|twitterbot|whatsapp/.test(ua);

  const jar = await cookies();
  let vid = jar.get('mf_vid')?.value;
  if (!vid) {
    vid = crypto.randomUUID();
    res.cookies.set('mf_vid', vid, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', path: '/' });
  }

  if (!isBot) {
    try {
      const db = createSupabaseAdmin();
      // 존재하는 코드만 기록 (임의 코드 스팸 방지)
      const { data: ref } = await db.from('app_referrals').select('parent_id').eq('code', code).maybeSingle();
      if (ref) {
        const { error } = await db.from('app_referral_visits').upsert({ code, visitor_id: vid }, { onConflict: 'code,visitor_id', ignoreDuplicates: true });
        // 조용한 실패 제거 — 카운트가 안 되는 진짜 원인을 Vercel 로그로 추적 가능하게
        if (error) console.error('[referral] visit upsert fail', code, vid, error.message);
      } else {
        console.warn('[referral] visit for unknown code (no app_referrals row)', code);
      }
    } catch (e) {
      console.error('[referral] visit error', code, e instanceof Error ? e.message : String(e));
    }
  }

  return res;
}
