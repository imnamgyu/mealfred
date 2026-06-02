'use client';
/**
 * AdminSessionGate — 서버 게이트가 '비로그인'으로 본 경우의 세션 자동복구 폴백.
 *
 * 왜: access token(JWT, 기본 1h)이 만료된 뒤 /admin에 '직접 진입'하면 proxy가 갱신하기 전
 *  서버 렌더가 만료 토큰을 보고 로그인 벽을 띄운다(브라우저엔 refresh token이 아직 유효한데도).
 *  → 마운트 시 브라우저 클라이언트로 getSession()(만료면 refresh token으로 자동 갱신·쿠키 재기록)
 *    → 세션이 살아나면 router.refresh()로 서버 게이트를 1회 다시 태운다(이번엔 통과).
 *  무한루프 방지: 1회만 시도(sessionStorage 플래그). 그래도 안 되면(진짜 로그아웃·비관리자) 로그인 노출.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import AdminLogin from './AdminLogin';

const FLAG = 'mf_admin_session_retry';

export default function AdminSessionGate({ userEmail, canRetry = true }: { userEmail?: string | null; canRetry?: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'checking' | 'login'>(canRetry ? 'checking' : 'login');

  useEffect(() => {
    if (!canRetry) return;   // 이미 다른 계정으로 로그인됨(비관리자 도메인) → 갱신해도 소용없음, 바로 로그인
    let alive = true;
    (async () => {
      const tried = sessionStorage.getItem(FLAG);
      try {
        const sb = createSupabaseBrowser();
        const { data: { session } } = await sb.auth.getSession();   // 만료면 refresh token으로 자동 갱신 + 쿠키 재기록
        if (session && !tried) {
          sessionStorage.setItem(FLAG, '1');   // 1회만
          router.refresh();                     // 갱신된 쿠키로 서버 게이트 재실행
          return;
        }
      } catch { /* 갱신 실패 → 로그인 */ }
      sessionStorage.removeItem(FLAG);
      if (alive) setPhase('login');
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'checking') {
    return (
      <main style={{ maxWidth: 420, margin: '80px auto', padding: 24, fontFamily: 'Pretendard, sans-serif', textAlign: 'center', color: '#9CA3AF' }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>세션 확인 중…</div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: '60px auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a2b4a' }}>🔒 밀프레드 관리자</h1>
      <p style={{ marginTop: 8, color: '#6B7280', fontSize: 14 }}><b>@mealfred.com</b> 계정(구글 워크스페이스)으로만 접근할 수 있어요.</p>
      <AdminLogin />
      {userEmail && (
        <div style={{ marginTop: 16, padding: 14, background: '#F8F8F5', borderRadius: 10, fontSize: 12, color: '#9CA3AF', wordBreak: 'break-all' }}>
          현재: <code>{userEmail}</code> — 도메인 계정이 아니에요. mealfred.com 계정으로 다시 로그인하세요.
        </div>
      )}
    </main>
  );
}
