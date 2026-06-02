/**
 * Supabase 브라우저 클라이언트 (Client Components 전용) — 싱글톤.
 *
 * ⚠️ 반드시 싱글톤이어야 한다. createBrowserClient를 호출마다(또는 컴포넌트 렌더마다) 새로 만들면
 *   GoTrueClient 인스턴스가 여러 개 생기고, 각자 autoRefreshToken 타이머를 돌려
 *   토큰 만료 무렵 동시에 refresh token으로 갱신을 시도한다. Supabase는 refresh token 회전이라
 *   첫 갱신이 토큰을 교체하면 나머지는 '이미 사용된' 옛 토큰을 보내 'Invalid Refresh Token: Already Used'
 *   → 세션이 통째로 무효화(강제 로그아웃)된다. 이게 '자꾸 로그아웃' 근본 원인이었다.
 *   브라우저 컨텍스트당 인스턴스 1개로 고정해 그 경쟁을 없앤다.
 *
 * anon (publishable) 키 사용 — RLS 정책으로 보호됨. 쿠키 저장(@supabase/ssr)이라 서버 proxy와 세션 공유.
 */
'use client';
import { createBrowserClient } from '@supabase/ssr';

// 비제네릭 래퍼 — ReturnType이 제네릭 기본값을 풀며 쿼리 타입이 흐려지는 걸 막아 inline 호출과 동일 타입 보존
function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let _client: ReturnType<typeof makeClient> | undefined;

export function createSupabaseBrowser() {
  return (_client ??= makeClient());
}
