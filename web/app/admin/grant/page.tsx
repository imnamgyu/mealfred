/**
 * /admin/grant — 평생무료 부여. 사용자 초대코드로 계정 검색 → 식별 → 부여/해제.
 * 접근: @mealfred.com 관리자만(서버 게이트). 실제 조회·쓰기는 /api/admin/grant.
 */
import { createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import Link from 'next/link';
import GrantSearch from './GrantSearch';

export const dynamic = 'force-dynamic';

export default async function GrantPage() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return (
      <main style={{ maxWidth: 480, margin: '60px auto', padding: 24, fontFamily: 'Pretendard' }}>
        <p style={{ color: '#6B7280' }}>🔒 관리자 전용. <Link href="/admin" style={{ color: '#FF6B1A' }}>← 콘솔</Link></p>
      </main>
    );
  }
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: 24, fontFamily: 'Pretendard' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#FF6B1A', fontWeight: 700, textDecoration: 'none' }}>← 콘솔</Link>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a2b4a', marginTop: 10 }}>🎟 평생무료 부여</h1>
      <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13, lineHeight: 1.6 }}>
        사용자가 불러주는 <b>초대코드</b>(마이페이지 초대링크 <code>/r/CODE</code>의 CODE)로 검색하세요.
        결과의 닉네임·자녀·가입일·끼니수로 본인 계정인지 확인 후 부여합니다.
      </p>
      <GrantSearch />
    </main>
  );
}
