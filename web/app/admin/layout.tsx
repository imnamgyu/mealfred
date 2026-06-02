/**
 * app/admin/layout.tsx — 어드민 셸: 좌측 사이드바 + 우측 콘텐츠.
 * 인증을 여기서 한 번 게이트(비관리자는 로그인만, 사이드바 X). 각 페이지의 자체 가드는 방어용으로 유지.
 */
import type { ReactNode } from 'react';
import { createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import AdminSessionGate from '@/components/AdminSessionGate';
import AdminSidebar from '@/components/AdminSidebar';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();

  if (!isAdmin(user)) {
    // user 없음 = 토큰 만료 가능성(브라우저 refresh token으로 자동복구 시도) · user 있고 비관리자 = 바로 로그인
    return <AdminSessionGate userEmail={user?.email} canRetry={!user} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FBFBFA', fontFamily: 'Pretendard, sans-serif' }}>
      <AdminSidebar />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
