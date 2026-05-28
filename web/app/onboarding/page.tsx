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

const ALLERGENS = ['우유','달걀','메밀','땅콩','대두','밀','새우','게','고등어','조개','복숭아','토마토','호두','잣'];

const NOW = new Date();
const CUR_YEAR = NOW.getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => CUR_YEAR - i); // 최근 10년

// 출생 년·월 → age_band (만 나이 개월 기준)
function deriveAgeBand(year: number, month: number): string {
  const months = (CUR_YEAR - year) * 12 + (NOW.getMonth() + 1 - month);
  if (months < 36) return 'younger';   // 만 3세 미만
  if (months < 60) return '3-4y';       // 만 3-4세
  if (months < 72) return '5y';         // 만 5세
  return '6-7y';                         // 만 6세 이상
}

const AGE_BAND_LABEL: Record<string, string> = {
  younger: '만 3세 미만', '3-4y': '만 3–4세', '5y': '만 5세', '6-7y': '만 6–7세 (초1·2)',
};

export default function OnboardingPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState<number | ''>('');
  const [birthMonth, setBirthMonth] = useState<number | ''>('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [customAllergen, setCustomAllergen] = useState('');  // 수동 추가 입력
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageBand = (birthYear && birthMonth) ? deriveAgeBand(Number(birthYear), Number(birthMonth)) : '';

  const supabase = createSupabaseBrowser();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) { setError('자녀 닉네임을 입력해주세요 (예: 지우, 민준)'); return; }
    if (!birthYear || !birthMonth) { setError('아이 출생 년·월을 선택해주세요'); return; }
    setLoading(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('로그인이 필요해요'); setLoading(false); return; }

    const { error: e2 } = await supabase.from('children').insert({
      parent_id: user.id,
      nickname: nickname.trim(),
      age_band: ageBand,
      birth_year: Number(birthYear),
      birth_month: Number(birthMonth),
      height_cm: height ? parseFloat(height) : null,
      weight_kg: weight ? parseFloat(weight) : null,
      allergens: allergens.length ? allergens : null,
    });
    setLoading(false);
    if (e2) { setError(e2.message); return; }

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
          <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>🎂 출생 년·월</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
            <select value={birthYear} onChange={(e)=>setBirthYear(e.target.value ? Number(e.target.value) : '')}
              style={{ width:'100%', padding:13, border:'1.5px solid #FFE8D0', borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none', background:'white', color:'#1a2b4a' }}>
              <option value="">출생 연도</option>
              {YEARS.map((y)=>(<option key={y} value={y}>{y}년</option>))}
            </select>
            <select value={birthMonth} onChange={(e)=>setBirthMonth(e.target.value ? Number(e.target.value) : '')}
              style={{ width:'100%', padding:13, border:'1.5px solid #FFE8D0', borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none', background:'white', color:'#1a2b4a' }}>
              <option value="">출생 월</option>
              {Array.from({length:12},(_, i)=>i+1).map((m)=>(<option key={m} value={m}>{m}월</option>))}
            </select>
          </div>
          {ageBand && (
            <p style={{ fontSize:12, color:'#C45A00', marginTop:6, fontWeight:700 }}>
              우리 아이는 <strong>{AGE_BAND_LABEL[ageBand]}</strong>예요 · 이 나이에 맞는 영양 기준으로 분석해드려요
            </p>
          )}
        </div>

        <div style={{ marginBottom:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>
            <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>📏 키 (cm, 선택)</label>
            <input type="number" inputMode="decimal" step="0.1" value={height} onChange={(e)=>setHeight(e.target.value)} placeholder="100.5"
              style={{ width:'100%', padding:13, marginTop:8, border:'1.5px solid #FFE8D0', borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none' }} />
          </div>
          <div>
            <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>⚖ 몸무게 (kg, 선택)</label>
            <input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(e)=>setWeight(e.target.value)} placeholder="15.5"
              style={{ width:'100%', padding:13, marginTop:8, border:'1.5px solid #FFE8D0', borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none' }} />
          </div>
        </div>

        <div style={{ marginBottom:18 }}>
          <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>⚠ 알레르기 (있다면)</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
            {[...ALLERGENS, ...allergens.filter(a=>!ALLERGENS.includes(a))].map((a) => {
              const on = allergens.includes(a);
              const isCustom = !ALLERGENS.includes(a);
              return (
                <button key={a} type="button"
                  onClick={()=>setAllergens(on?allergens.filter(x=>x!==a):[...allergens,a])}
                  style={{
                    padding:'6px 12px', borderRadius:100, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                    background: on?'#FF6B1A':'#FFFBF5', color: on?'white':'#5a4a3a',
                    border:'1.5px solid', borderColor: on?'#FF6B1A':'#FFE8D0',
                  }}
                >{a}{isCustom && on ? ' ✕' : ''}</button>
              );
            })}
          </div>
          <div style={{ display:'flex', gap:6, marginTop:8 }}>
            <input
              type="text" value={customAllergen}
              onChange={(e)=>setCustomAllergen(e.target.value.slice(0,15))}
              onKeyDown={(e)=>{
                if(e.key==='Enter'){
                  e.preventDefault();
                  const v = customAllergen.trim();
                  if(v && !allergens.includes(v)){ setAllergens([...allergens, v]); setCustomAllergen(''); }
                }
              }}
              placeholder="직접 입력 (예: 키위, 망고)"
              style={{ flex:1, padding:10, border:'1.5px solid #FFE8D0', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none' }}
            />
            <button type="button"
              onClick={()=>{
                const v = customAllergen.trim();
                if(v && !allergens.includes(v)){ setAllergens([...allergens, v]); setCustomAllergen(''); }
              }}
              style={{ padding:'10px 16px', background:'#1a2b4a', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}
            >추가</button>
          </div>
        </div>

        <button type="submit" disabled={loading} style={{
          width:'100%', padding:14,
          background:'linear-gradient(135deg,#FF6B1A,#C45A00)', color:'white',
          border:'none', borderRadius:10, fontWeight:800, fontSize:15, cursor:'pointer',
        }}>
          {loading ? '저장 중...' : '🍽 우리 아이 편식 잡는 식단 받기'}
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
