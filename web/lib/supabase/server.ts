/**
 * Supabase 서버 클라이언트 (Server Components·Route Handlers·Server Actions 전용)
 *
 * 사용처:
 *   - app/foods/page.tsx 같은 Server Component에서 DB 조회
 *   - app/api/* 라우트에서 ingredients/comments 등 조회·삽입
 *   - middleware.ts에서 세션 검증
 *
 * service_role 키 사용 — 절대 클라이언트로 전달 금지
 */
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * 진짜 service_role 클라이언트 — 쿠키/세션 비연결.
 * ⚠️ createSupabaseServer()는 @supabase/ssr이라 로그인 세션 쿠키가 있으면
 *    요청을 '그 유저' 토큰으로 보내 RLS가 적용된다(service_role 우회 안 됨).
 *    전 계정을 봐야 하는 어드민·초대 카운트 등 RLS 우회가 꼭 필요한 곳은 이걸 쓴다.
 */
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,  // 서버 전용 (RLS 우회 가능)
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet) {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* Server Component에서 set 불가 — middleware/Route에서만 */ }
        },
      },
    }
  );
}

/** 익명 사용자용 (anon key) — 공개 도감 조회 등 */
export async function createSupabaseServerAnon() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet) {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch {}
        },
      },
    }
  );
}
