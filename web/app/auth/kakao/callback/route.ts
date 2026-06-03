/**
 * GET /auth/kakao/callback — 커스텀 카카오 OAuth 콜백
 *
 * Supabase GoTrue가 account_email scope를 강제하는 문제를 우회하기 위해
 * 카카오 인증을 직접 처리한다. (scope = profile_nickname 만)
 *
 * 흐름:
 *   1. 카카오 ?code → 카카오 access_token 교환
 *   2. access_token → 카카오 사용자 정보 (id, 닉네임)
 *   3. 합성 이메일(kakao_{id}@kakao.local)로 Supabase 유저 생성/조회 (admin)
 *   4. magiclink 생성 → verifyOtp로 세션 cookie 설정
 *   5. 신규 → /onboarding · 기존 → /care/me(마이페이지 기본 진입)
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerAnon } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const kakaoError = url.searchParams.get('error');

  if (kakaoError || !code) {
    return NextResponse.redirect(new URL(`/signup?error=${encodeURIComponent(kakaoError || 'no_code')}`, req.url));
  }

  try {
    // 1. code → 카카오 access_token
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_REST_API_KEY!,
        client_secret: process.env.KAKAO_CLIENT_SECRET || '',
        redirect_uri: `${url.origin}/auth/kakao/callback`,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('[kakao] token error:', tokenData);
      return NextResponse.redirect(new URL('/signup?error=kakao_token', req.url));
    }

    // 2. access_token → 카카오 사용자
    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const kakaoUser = await userRes.json();
    const kakaoId = kakaoUser.id;
    const nickname =
      kakaoUser.properties?.nickname ||
      kakaoUser.kakao_account?.profile?.nickname ||
      '회원';

    if (!kakaoId) {
      return NextResponse.redirect(new URL('/signup?error=kakao_user', req.url));
    }

    // 3. Supabase 유저 생성/조회 (admin, service_role)
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const email = `kakao_${kakaoId}@kakao.local`;

    // 유저 없으면 생성 (이미 있으면 에러 무시)
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provider: 'kakao', kakao_id: kakaoId, nickname },
    });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      console.error('[kakao] createUser error:', createErr.message);
    }

    // 4. magiclink 생성 → token_hash
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('[kakao] generateLink error:', linkErr?.message);
      return NextResponse.redirect(new URL('/signup?error=link', req.url));
    }
    const tokenHash = linkData.properties.hashed_token;

    // 5. verifyOtp로 세션 cookie 설정 (anon client, cookie 쓰기 가능)
    const supabase = await createSupabaseServerAnon();
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });
    if (verifyErr) {
      console.error('[kakao] verifyOtp error:', verifyErr.message);
      return NextResponse.redirect(new URL('/signup?error=verify', req.url));
    }

    // 신규/기존 분기
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/signup?error=no_session', req.url));
    }
    const { data: child } = await supabase
      .from('children')
      .select('id')
      .eq('parent_id', user.id)
      .limit(1)
      .maybeSingle();

    return NextResponse.redirect(new URL(child ? '/care/me' : '/onboarding', req.url));   // 기존 회원 → 마이페이지 기본
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[kakao] callback error:', msg);
    return NextResponse.redirect(new URL('/signup?error=callback', req.url));
  }
}
