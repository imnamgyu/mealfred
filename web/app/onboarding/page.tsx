/**
 * /onboarding — 가입 직후 자녀 정보 입력 (M4)
 *
 * 입력:
 *   - 자녀 닉네임 (실명 X)
 *   - 연령 chip (만 3-4세 / 만 5세 / 만 6-7세 / 3세 미만)
 *   - 키·몸무게 (선택, BMI 계산용)
 *   - 알레르겐 (있다면)
 *
 * 완료 시:
 *   - children 테이블 insert
 *   - /care 으로 redirect
 *   - SENS 가입 환영 알림톡 자동 발송 (백엔드)
 */
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

const AGE_OPTIONS = [
  { key:'3-4y', label:'만 3-4세' },
  { key:'5y', label:'만 5세' },
  { key:'6-7y', label:'만 6-7세 (초1·2)' },
  { key:'younger', label:'3세 미만' },
];

const ALLERGENS = ['우유','달걀','메밀','땅콩','대두','밀','새우','게','고등어','조개','복숭아','토마토','호두','잣'];

export default function OnboardingPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [ageBand, setAgeBand] = useState('3-4y');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowser();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) { setError('자녀 닉네임을 입력해주세요 (예: 지우, 민준)'); return; }
    setLoading(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('로그인이 필요해요'); setLoading(false); return; }
    const { error: e2 } = await supabase.from('children').insert({
      parent_id: user.id,
      nickname: nickname.trim(),
      age_band: ageBand,
      height_cm: height ? parseFloat(height) : null,
      weight_kg: weight ? parseFloat(weight) : null,
      allergens: allergens.length ? allergens : null,
    });
    setLoading(false);
    if (e2) { setError(e2.message); return; }
    // 가입 환영 알림톡 트리거 (서버에서 실행, /api/auth/welcome-alimtalk)
    fetch('/api/auth/welcome-alimtalk', { method:'POST' }).catch(()=>{});
    router.push('/care');
  }

  return (
    <main style={{ maxWidth:560, margin:'0 auto', padding:'40px 24px' }}>
      <header className="hero" style={{ borderRadius:16, marginBottom:24 }}>
        <h1 style={{ fontSize:28, fontWeight:800 }}>🌱 우리 아이 알려주세요</h1>
        <p style={{ marginTop:6 }}>30초만 입력하면 개인화 시작 · 실명 절대 저장 X</p>
      </header>

      <form onSubmit={submit} style={{ background:'white', border:'1px solid #FFE8D0', borderRadius:14, padding:18 }}>
        <div style={{ marginBottom:18 }}>
          <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>👶 자녀 닉네임 (실명 X)</label>
          <input
            type="text" value={nickname} onChange={(e)=>setNickname(e.target.value.slice(0,10))}
            placeholder="예: 지우, 민준"
            style={{ width:'100%', padding:13, marginTop:8, border:'1.5px solid #FFE8D0', borderRadius:10, fontSize:15, fontFamily:'inherit', outline:'none' }}
          />
          <p style={{ fontSize:11, color:'#8a7a6a', marginTop:4 }}>알림톡·코치 편지에서 사용해요. 언제든 수정 가능.</p>
        </div>

        <div style={{ marginBottom:18 }}>
          <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>🎂 연령</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginTop:8 }}>
            {AGE_OPTIONS.map((a) => (
              <button
                key={a.key} type="button"
                onClick={()=>setAgeBand(a.key)}
                style={{
                  padding:10, borderRadius:8, border:'1.5px solid', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  background: ageBand===a.key ? '#FF6B1A' : '#FFFBF5',
                  color: ageBand===a.key ? 'white' : '#5a4a3a',
                  borderColor: ageBand===a.key ? '#FF6B1A' : '#FFE8D0',
                }}
              >{a.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>
            <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>📏 키 (cm, 선택)</label>
            <input type="number" value={height} onChange={(e)=>setHeight(e.target.value)} placeholder="100"
              style={{ width:'100%', padding:13, marginTop:8, border:'1.5px solid #FFE8D0', borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none' }} />
          </div>
          <div>
            <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>⚖ 몸무게 (kg, 선택)</label>
            <input type="number" value={weight} onChange={(e)=>setWeight(e.target.value)} placeholder="15"
              style={{ width:'100%', padding:13, marginTop:8, border:'1.5px solid #FFE8D0', borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none' }} />
          </div>
        </div>

        <div style={{ marginBottom:18 }}>
          <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>⚠ 알레르기 (있다면)</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
            {ALLERGENS.map((a) => {
              const on = allergens.includes(a);
              return (
                <button key={a} type="button"
                  onClick={()=>setAllergens(on?allergens.filter(x=>x!==a):[...allergens,a])}
                  style={{
                    padding:'6px 12px', borderRadius:100, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                    background: on?'#FF6B1A':'#FFFBF5', color: on?'white':'#5a4a3a',
                    border:'1.5px solid', borderColor: on?'#FF6B1A':'#FFE8D0',
                  }}
                >{a}</button>
              );
            })}
          </div>
        </div>

        <button type="submit" disabled={loading} style={{
          width:'100%', padding:14,
          background:'linear-gradient(135deg,#FF6B1A,#C45A00)', color:'white',
          border:'none', borderRadius:10, fontWeight:800, fontSize:15, cursor:'pointer',
        }}>
          {loading ? '저장 중...' : '✓ 90일 챌린지 시작'}
        </button>

        {error && (
          <div style={{ background:'#FFEBEE', border:'1px solid #FFCDD2', color:'#C62828', padding:12, borderRadius:10, marginTop:14, fontSize:13, fontWeight:600 }}>
            ⚠ {error}
          </div>
        )}
      </form>
    </main>
  );
}
