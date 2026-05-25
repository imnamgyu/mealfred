/**
 * Supabase 브라우저 클라이언트 (Client Components 전용)
 *
 * 사용처:
 *   - 'use client' 컴포넌트에서 실시간 구독·인증 상태 추적
 *   - 도감 댓글 인풋 등
 *
 * anon (publishable) 키 사용 — RLS 정책으로 보호됨
 */
'use client';
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
