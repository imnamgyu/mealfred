'use client';
/**
 * 어드민 구글 로그인 버튼 — @mealfred.com 워크스페이스 계정 전용.
 * Supabase Google OAuth → /auth/callback?next=/admin 으로 복귀(기존 콜백 재사용).
 * hd=mealfred.com 으로 워크스페이스 계정 선택을 유도.
 */
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function AdminLogin() {
  const supabase = createSupabaseBrowser();
  async function login() {
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback?next=/admin`,
        queryParams: { hd: 'mealfred.com', prompt: 'select_account' },
      },
    });
  }
  return (
    <button onClick={login}
      style={{ marginTop: 14, width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #DADCE0', background: 'white', color: '#1a2b4a', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
      mealfred.com 계정으로 로그인
    </button>
  );
}
