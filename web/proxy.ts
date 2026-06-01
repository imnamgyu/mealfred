/**
 * proxy.ts — Supabase 세션 자동 갱신 (구 middleware, 이 Next 버전에서 proxy로 rename됨).
 *
 * 이게 없으면 access token(JWT, 기본 1시간)이 만료된 뒤 서버 렌더 페이지(/admin·/care 등)가
 * 사용자를 '로그아웃'으로 보고 다시 로그인을 요구한다. 매 요청마다 getUser()로 토큰을 갱신해
 * (refresh token은 수 주 유효) 세션을 사실상 지속시킨다 → 3시간이 아니라 한참 더 유지된다.
 *
 * (JWT 만료 자체를 늘리려면 Supabase 대시보드 Auth → Sessions → JWT expiry도 조정 가능. 단, 갱신은 이걸로 해결.)
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // 토큰 만료 전 갱신 → 갱신된 세션 쿠키를 응답에 실어 보냄(로그인 지속)
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // 정적 자산·이미지·아이콘 제외한 모든 경로에서 세션 갱신
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|logo|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)'],
};
