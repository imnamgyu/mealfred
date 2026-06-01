/**
 * /signup — 카카오 OAuth 가입 (M4 MVP)
 *
 * MVP 단순화: 카카오 로그인 1버튼.
 * SMS OTP 없음 (Twilio·NHN Cloud 비용·복잡성 제거).
 * 전화번호는 /onboarding에서 선택 입력 (알림톡 수신 동의 시만).
 *
 * 흐름:
 *   1. '카카오로 가입' 클릭 → supabase.auth.signInWithOAuth({provider:'kakao'})
 *   2. 카카오 로그인 → /auth/callback → Supabase 세션
 *   3. callback에서 /onboarding으로 redirect (신규) 또는 /care (재로그인)
 */
'use client';
import { useState, useEffect } from 'react';

const KAKAO_REST_KEY = process.env.NEXT_PUBLIC_KAKAO_REST_KEY;

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 초대 링크(/r/CODE → /signup?ref=CODE)로 왔으면 코드 보관 → 가입(onboarding)에서 children에 연결
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) { try { localStorage.setItem('mf_ref', ref); } catch {} }
  }, []);

  // 커스텀 카카오 OAuth — Supabase의 account_email 강제 scope 우회
  function loginKakao() {
    if (!KAKAO_REST_KEY) {
      setError('카카오 설정이 누락되었습니다 (NEXT_PUBLIC_KAKAO_REST_KEY)');
      return;
    }
    setLoading(true); setError(null);
    const redirectUri = `${window.location.origin}/auth/kakao/callback`;
    const authUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_KEY}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=profile_nickname`;
    window.location.href = authUrl;
  }

  return (
    <main style={{ maxWidth:480, margin:'0 auto', padding:'40px 24px' }}>
      <header style={{ borderRadius:16, marginBottom:20, overflow:'hidden', position:'relative', boxShadow:'0 6px 24px rgba(0,0,0,0.10)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arin-1.png" alt="당근을 즐겁게 먹는 아이" style={{ width:'100%', height:300, objectFit:'cover', objectPosition:'center 30%', display:'block' }} />
        <div style={{ position:'absolute', top:14, left:14 }}>
          <span style={{ background:'#FF6B1A', color:'white', fontSize:11, fontWeight:800, padding:'5px 11px', borderRadius:999, letterSpacing:'0.02em', boxShadow:'0 2px 8px rgba(255,107,26,0.45)' }}>🎁 첫 달 무료 런칭 이벤트</span>
        </div>
      </header>

      <div style={{ background:'white', border:'1px solid #FFE8D0', borderRadius:14, padding:22, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>

        <h2 style={{ fontSize:19, fontWeight:800, color:'#1a2b4a', marginBottom:8, lineHeight:1.45 }}>
          우리 아이 식단을 <span style={{ color:'#FF6B1A' }}>매일 분석</span>하고<br/>개인 맞춤으로 <span style={{ color:'#FF6B1A' }}>코칭</span>해드려요
        </h2>
        <p style={{ fontSize:13, color:'#5a4a3a', fontWeight:500, lineHeight:1.7, marginBottom:18 }}>
          Satter·SOS·HabEat 등 <strong style={{ color:'#C45A00' }}>35가지 국제 편식 이론</strong>으로 분석 —<br/>
          부족한 영양·거부 패턴을 읽고 <strong style={{ color:'#C45A00' }}>아침마다 맞춤 편지·질문</strong>으로 케어해요.
        </p>

        {/* 가입 혜택 — 첫 달 무료 + 친구 초대마다 한 달 무료 (바이럴 후킹) */}
        <div style={{ background:'linear-gradient(135deg,#FFF3E0,#FFE0B2)', border:'2px solid #FF6B1A', borderRadius:12, padding:'14px 16px', marginBottom:20, textAlign:'left' }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#C45A00', letterSpacing:'0.03em', marginBottom:4 }}>🎁 런칭 이벤트</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#1a2b4a', lineHeight:1.4 }}>첫 달 무료 <span style={{ color:'#FF6B1A' }}>+ 친구 초대마다 한 달 무료</span></div>
          <div style={{ fontSize:10.5, color:'#8a7a6a', marginTop:5, lineHeight:1.6 }}>가입하면 <strong style={{ color:'#C45A00' }}>첫 달 무료</strong>. 친구가 내 링크로 가입하고 첫 끼니를 기록할 때마다 <strong style={{ color:'#C45A00' }}>한 달치(4,900P)</strong>가 쌓여 계속 무료로 쓸 수 있어요.</div>
        </div>

        <button
          onClick={loginKakao} disabled={loading}
          style={{
            width:'100%', padding:'15px 20px',
            background:'#FEE500', color:'#000', border:'none', borderRadius:12,
            fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow:'0 4px 14px rgba(254,229,0,0.4)',
          }}
        >
          {loading ? '카카오로 이동 중...' : (
            <>
              <svg width="18" height="17" viewBox="0 0 18 17" fill="#000">
                <path d="M9 .5C4 .5 0 3.6 0 7.5c0 2.5 1.7 4.7 4.2 6L3 17.4c-.1.3.3.5.5.4l4.3-2.8c.4 0 .8.1 1.2.1 5 0 9-3.1 9-7s-4-7-9-7z"/>
              </svg>
              카카오로 1초 가입
            </>
          )}
        </button>

        <p style={{ fontSize:10.5, color:'#8a7a6a', marginTop:14, lineHeight:1.7 }}>
          가입 후 자녀 정보 입력 (30초) · 전화번호는 알림 받고 싶을 때만 선택<br/>
          🔒 카카오 닉네임 외 추가 정보 X · 30일 미사용 시 자동 삭제
        </p>
      </div>

      {error && (
        <div style={{ background:'#FFEBEE', border:'1px solid #FFCDD2', color:'#C62828', padding:12, borderRadius:10, marginTop:14, fontSize:13, fontWeight:600 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ textAlign:'center', marginTop:24, fontSize:12, color:'#8a7a6a' }}>
        이미 가입했어요? <a href="/signup" style={{ color:'#C45A00', fontWeight:700 }}>같은 버튼으로 로그인</a>
      </div>
    </main>
  );
}
