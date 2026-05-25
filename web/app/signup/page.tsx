/**
 * /signup — Supabase Auth 전화번호 OTP 가입 (M4)
 *
 * 흐름:
 *   1. 전화번호 입력 → Supabase signInWithOtp() → SMS OTP 발송
 *   2. OTP 6자리 입력 → verifyOtp() → 세션 발급
 *   3. /onboarding으로 redirect (자녀 정보 입력)
 *
 * 비용: SMS OTP는 Supabase Pro plan 또는 Twilio 별도 연동 (M4 검증 시점에 결정)
 */
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowser();

  function formatPhone(v: string) {
    const digits = v.replace(/[^0-9]/g, '').slice(0, 11);
    if (digits.length < 4) return digits;
    if (digits.length < 8) return `${digits.slice(0,3)}-${digits.slice(3)}`;
    return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!/^010-\d{4}-\d{4}$/.test(phone)) {
      setError('전화번호를 정확히 입력해주세요 (010-0000-0000)');
      return;
    }
    setLoading(true); setError(null);
    const intlPhone = '+82' + phone.replace(/[^0-9]/g, '').replace(/^0/, '');
    const { error: e2 } = await supabase.auth.signInWithOtp({ phone: intlPhone });
    setLoading(false);
    if (e2) setError(e2.message);
    else setStep('otp');
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) { setError('OTP 6자리를 입력해주세요'); return; }
    setLoading(true); setError(null);
    const intlPhone = '+82' + phone.replace(/[^0-9]/g, '').replace(/^0/, '');
    const { error: e2 } = await supabase.auth.verifyOtp({
      phone: intlPhone, token: otp, type: 'sms',
    });
    setLoading(false);
    if (e2) { setError(e2.message); return; }
    router.push('/onboarding');
  }

  return (
    <main style={{ maxWidth:480, margin:'0 auto', padding:'40px 24px' }}>
      <header className="hero" style={{ borderRadius:16, marginBottom:24 }}>
        <h1 style={{ fontSize:28, fontWeight:800 }}>📱 밀프레드 가입</h1>
        <p style={{ marginTop:6 }}>전화번호 1개로 30초 가입 · 평생 무료</p>
      </header>

      {step === 'phone' && (
        <form onSubmit={sendOtp} style={{ background:'white', border:'1px solid #FFE8D0', borderRadius:14, padding:18 }}>
          <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>📞 전화번호</label>
          <input
            type="tel" value={phone}
            onChange={(e)=>setPhone(formatPhone(e.target.value))}
            placeholder="010-0000-0000"
            maxLength={13}
            style={{ width:'100%', padding:13, marginTop:8, border:'1.5px solid #FFE8D0', borderRadius:10, fontSize:15, fontFamily:'inherit', outline:'none' }}
          />
          <button type="submit" disabled={loading} style={{
            marginTop:14, width:'100%', padding:14,
            background:'linear-gradient(135deg,#FF6B1A,#C45A00)', color:'white',
            border:'none', borderRadius:10, fontWeight:800, fontSize:14, cursor:'pointer',
          }}>
            {loading ? '발송 중...' : '🔔 인증번호 받기'}
          </button>
          <p style={{ fontSize:11, color:'#8a7a6a', marginTop:10, lineHeight:1.6 }}>
            🔒 전화번호는 가입·알림톡 외 사용되지 않아요 · 30일 미사용 시 자동 삭제
          </p>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={verifyOtp} style={{ background:'white', border:'1px solid #FFE8D0', borderRadius:14, padding:18 }}>
          <p style={{ fontSize:13, color:'#5a4a3a', marginBottom:10 }}>
            <strong style={{ color:'#1a2b4a' }}>{phone}</strong>으로 인증번호를 보냈어요.
          </p>
          <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>🔢 인증번호 6자리</label>
          <input
            type="text" inputMode="numeric" value={otp}
            onChange={(e)=>setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0,6))}
            placeholder="000000"
            maxLength={6}
            style={{ width:'100%', padding:13, marginTop:8, border:'1.5px solid #FFE8D0', borderRadius:10, fontSize:24, fontFamily:'inherit', outline:'none', textAlign:'center', letterSpacing:'0.5em' }}
          />
          <button type="submit" disabled={loading} style={{
            marginTop:14, width:'100%', padding:14,
            background:'linear-gradient(135deg,#FF6B1A,#C45A00)', color:'white',
            border:'none', borderRadius:10, fontWeight:800, fontSize:14, cursor:'pointer',
          }}>
            {loading ? '확인 중...' : '✓ 인증하고 가입 완료'}
          </button>
          <button type="button" onClick={()=>setStep('phone')} style={{
            marginTop:8, background:'transparent', border:'none', color:'#8a7a6a', fontSize:12, cursor:'pointer',
          }}>← 전화번호 다시 입력</button>
        </form>
      )}

      {error && (
        <div style={{ background:'#FFEBEE', border:'1px solid #FFCDD2', color:'#C62828', padding:12, borderRadius:10, marginTop:14, fontSize:13, fontWeight:600 }}>
          ⚠ {error}
        </div>
      )}
    </main>
  );
}
