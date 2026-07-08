/**
 * components/AuthModal.tsx — 카카오 간편 가입/로그인 팝업(바텀시트)
 *
 * 별도 /signup 페이지를 없애고, 비로그인 어디서나 '로그인/가입' 버튼이 이걸 띄운다.
 * 약관·개인정보(자녀 건강·식이 민감정보 포함) 동의 후 카카오 OAuth 시작.
 * 가입 마찰 축소: 체크박스에는 민감정보 처리 동의만 노출하고, AI 코칭을 위한 국외(미국) 이전 등 상세는
 * /privacy(개인정보처리방침 2·5항)에 명시한다. mf_consent에는 sensitive:true로 동의 사실을 기록한다.
 */
'use client';
import { useState } from 'react';
import { startKakaoLogin } from '@/lib/kakaoAuth';

export default function AuthModal({ open, onClose, initialError }: { open: boolean; onClose: () => void; initialError?: string | null }) {
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  if (!open) return null;

  const go = () => {
    if (!agree) { setError('가입을 위해 약관 동의가 필요해요.'); return; }
    setLoading(true); setError(null);
    try { localStorage.setItem('mf_consent', JSON.stringify({ terms: true, privacy: true, sensitive: true, ts: Date.now() })); } catch {}
    const r = startKakaoLogin();
    if (!r.ok) { setLoading(false); setError(r.error || '오류가 발생했어요.'); }
  };

  return (
    <div onClick={onClose} role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,10,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 480, padding: '14px 22px calc(22px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 30px rgba(0,0,0,0.18)' }}>
        {/* 핸들 + 닫기 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: '#E5E7EB' }} />
        </div>
        <button onClick={onClose} aria-label="닫기"
          style={{ position: 'absolute', right: 18, marginTop: -4, background: 'none', border: 'none', fontSize: 20, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>✕</button>

        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1a2b4a', lineHeight: 1.4 }}>밀프레드 시작하기</div>
          <p style={{ fontSize: 12.5, color: '#5a4a3a', fontWeight: 500, lineHeight: 1.6, marginTop: 6 }}>
            카카오로 1초에 — 우리 아이 식단을 <strong style={{ color: '#C45A00' }}>매일 분석·코칭</strong>해드려요.
          </p>
        </div>

        {/* 혜택 */}
        <div style={{ background: 'linear-gradient(135deg,#FFF3E0,#FFE0B2)', border: '1.5px solid #FFB877', borderRadius: 12, padding: '11px 14px', margin: '14px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1a2b4a' }}>🎁 첫 달 무료 <span style={{ color: '#FF6B1A' }}>· 친구 초대마다 한 달 무료</span></div>
        </div>

        {/* 약관 동의(필수) — 민감정보(자녀 건강·식이) 처리 포함 */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 11.5, color: '#5a4a3a', lineHeight: 1.6, cursor: 'pointer', margin: '4px 0 12px' }}>
          <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); if (e.target.checked) setError(null); }}
            style={{ width: 17, height: 17, marginTop: 1, accentColor: '#FF6B1A', flexShrink: 0 }} />
          <span>
            <b>[필수]</b> 만 14세 이상이며, <a href="/terms" target="_blank" rel="noopener" style={{ color: '#C45A00', fontWeight: 700, textDecoration: 'underline' }}>이용약관</a>과{' '}
            <a href="/privacy" target="_blank" rel="noopener" style={{ color: '#C45A00', fontWeight: 700, textDecoration: 'underline' }}>개인정보처리방침</a>(자녀 식이·건강정보 처리 포함)에 동의합니다.
          </span>
        </label>

        <button onClick={go} disabled={loading}
          style={{
            width: '100%', padding: '15px 20px', background: agree ? '#FEE500' : '#F3E9A8', color: '#000', border: 'none', borderRadius: 12,
            fontWeight: 800, fontSize: 15, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: agree ? 1 : 0.7,
            boxShadow: agree ? '0 4px 14px rgba(254,229,0,0.4)' : 'none', transition: 'all .15s',
          }}>
          {loading ? '카카오로 이동 중…' : (
            <>
              <svg width="18" height="17" viewBox="0 0 18 17" fill="#000" aria-hidden="true">
                <path d="M9 .5C4 .5 0 3.6 0 7.5c0 2.5 1.7 4.7 4.2 6L3 17.4c-.1.3.3.5.5.4l4.3-2.8c.4 0 .8.1 1.2.1 5 0 9-3.1 9-7s-4-7-9-7z" />
              </svg>
              카카오로 1초 가입 · 로그인
            </>
          )}
        </button>

        {error && (
          <div style={{ background: '#FFEBEE', border: '1px solid #FFCDD2', color: '#C62828', padding: 10, borderRadius: 10, marginTop: 12, fontSize: 12.5, fontWeight: 600 }}>⚠ {error}</div>
        )}

        <p style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 12, lineHeight: 1.7, textAlign: 'center' }}>
          🔒 카카오 닉네임 외 추가 정보 없음 · 30일 미사용 시 자동 삭제<br />
          이미 가입했어도 같은 버튼으로 로그인돼요.
        </p>
      </div>
    </div>
  );
}
