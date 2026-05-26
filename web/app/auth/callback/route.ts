/**
 * GET /auth/callback
 *
 * 카카오 OAuth redirect 처리 — Supabase exchangeCodeForSession
 *
 * 흐름:
 *   1. 카카오 로그인 후 ?code=...로 진입
 *   2. exchangeCodeForSession() → Supabase 세션 cookie 설정
 *   3. 신규 사용자 → /onboarding · 재로그인 → /care
 */
import { NextResponse } from 'next/server';
import { createSupabaseServerAnon } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? null;

  if (!code) {
    return NextResponse.redirect(new URL('/signup?error=no_code', req.url));
  }

  const supabase = await createSupabaseServerAnon();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/signup?error=${encodeURIComponent(error.message)}`, req.url));
  }

  // 자녀 정보 있는지 확인 → 없으면 onboarding, 있으면 care
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/signup?error=no_user', req.url));
  }
  const { data: child } = await supabase.from('children')
    .select('id').eq('parent_id', user.id).limit(1).single();

  const redirectPath = next || (child ? '/care' : '/onboarding');
  return NextResponse.redirect(new URL(redirectPath, req.url));
}
