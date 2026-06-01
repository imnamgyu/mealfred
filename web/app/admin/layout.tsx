/**
 * app/admin/layout.tsx — 어드민 셸: 좌측 사이드바 + 우측 콘텐츠.
 * 인증을 여기서 한 번 게이트(비관리자는 로그인만, 사이드바 X). 각 페이지의 자체 가드는 방어용으로 유지.
 */
import type { ReactNode } from 'react';
import { createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import AdminLogin from '@/components/AdminLogin';
import AdminSidebar from '@/components/AdminSidebar';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();

  if (!isAdmin(user)) {
    return (
      <main style={{ maxWidth: 420, margin: '60px auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a2b4a' }}>🔒 밀프레드 관리자</h1>
        <p style={{ marginTop: 8, color: '#6B7280', fontSize: 14 }}><b>@mealfred.com</b> 계정(구글 워크스페이스)으로만 접근할 수 있어요.</p>
        <AdminLogin />
        {user && (
          <div style={{ marginTop: 16, padding: 14, background: '#F8F8F5', borderRadius: 10, fontSize: 12, color: '#9CA3AF', wordBreak: 'break-all' }}>
            현재: <code>{user.email || '(이메일 없음)'}</code> — 도메인 계정이 아니에요. mealfred.com 계정으로 다시 로그인하세요.
          </div>
        )}
      </main>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FBFBFA', fontFamily: 'Pretendard, sans-serif' }}>
      <AdminSidebar />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
