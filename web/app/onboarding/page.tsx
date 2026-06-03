/**
 * /onboarding — 자녀 정보 입력·수정 (M4)
 *
 * 신규: children insert → /care
 * 수정(내 정보 탭에서 진입): 기존 자녀 로드 → 미리 채움 → update → /care/me
 *
 * 입력: 닉네임 · 출생 년·월 · 성별 · 키·몸무게(선택) · 알레르겐
 * 체위(키·몸무게)는 children 컬럼 + growth_logs(시계열)에 함께 기록 →
 * 홈 BMI(growth_logs 최신값 사용)에 즉시 반영된다.
 */
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { kstToday } from '@/lib/date';

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
  const [sex, setSex] = useState<'M' | 'F' | ''>('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [customAllergen, setCustomAllergen] = useState('');  // 수동 추가 입력
  const [chronicConditions, setChronicConditions] = useState('');   // 만성질환·특이사항(코칭·영양 반영)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);   // 기존 자녀 id → 수정 모드
  const [hydrating, setHydrating] = useState(true);

  const ageBand = (birthYear && birthMonth) ? deriveAgeBand(Number(birthYear), Number(birthMonth)) : '';

  const supabase = createSupabaseBrowser();

  // 모드: ?edit=<id> 특정 자녀 수정 · ?add=1 새 자녀(빈 폼·insert) · 무파라미터=첫 자녀(하위호환)
  useEffect(() => {
    (async () => {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
      const editParam = params.get('edit');
      const addMode = params.get('add') === '1';
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || addMode) { setHydrating(false); return; }   // 새 자녀 추가 → 미리채움 안 함(insert)
      const base = supabase.from('children')
        .select('id,nickname,birth_year,birth_month,sex,height_cm,weight_kg,allergens,chronic_conditions')
        .eq('parent_id', user.id);
      const { data: child } = editParam
        ? await base.eq('id', editParam).maybeSingle()
        : await base.order('id', { ascending: true }).limit(1).maybeSingle();
      if (child) {
        setEditId(child.id);
        setNickname(child.nickname || '');
        if (child.birth_year) setBirthYear(child.birth_year);
        if (child.birth_month) setBirthMonth(child.birth_month);
        if (child.sex === 'M' || child.sex === 'F') setSex(child.sex);
        if (child.allergens?.length) setAllergens(child.allergens);
        if (child.chronic_conditions) setChronicConditions(child.chronic_conditions);
        if (child.height_cm != null) setHeight(String(child.height_cm));
        if (child.weight_kg != null) setWeight(String(child.weight_kg));
        // 체위는 시계열(growth_logs) 최신값이 더 정확 — 있으면 덮어씀
        const { data: g } = await supabase.from('growth_logs').select('height_cm,weight_kg')
          .eq('child_id', child.id).order('measured_on', { ascending: false }).limit(1).maybeSingle();
        if (g) {
          if (g.height_cm != null) setHeight(String(g.height_cm));
          if (g.weight_kg != null) setWeight(String(g.weight_kg));
        }
      }
      setHydrating(false);
    })();
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) { setError('자녀 닉네임을 입력해주세요 (예: 지우, 민준)'); return; }
    if (!birthYear || !birthMonth) { setError('아이 출생 년·월을 선택해주세요'); return; }
    setLoading(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('로그인이 필요해요'); setLoading(false); return; }

    const h = height ? parseFloat(height) : null;
    const w = weight ? parseFloat(weight) : null;
    const payload = {
      nickname: nickname.trim(),
      age_band: ageBand,
      birth_year: Number(birthYear),
      birth_month: Number(birthMonth),
      sex: sex || null,
      height_cm: h,
      weight_kg: w,
      allergens: allergens.length ? allergens : null,
      chronic_conditions: chronicConditions.trim() || null,
    };

    let childId = editId;
    if (editId) {
      const { error: e2 } = await supabase.from('children').update(payload).eq('id', editId).eq('parent_id', user.id);   // RLS에 더해 앱단 소유 방어
      if (e2) { setError(e2.message); setLoading(false); return; }
    } else {
      // 초대 링크로 왔으면 코드 연결(친구 가입 보너스용) — 첫 끼니 기록 시 초대자에게 +4,900P
      const referredBy = typeof window !== 'undefined' ? localStorage.getItem('mf_ref') : null;
      const { data: ins, error: e2 } = await supabase.from('children')
        .insert({ parent_id: user.id, ...payload, referred_by_code: referredBy || null }).select('id').single();
      if (e2) { setError(e2.message); setLoading(false); return; }
      childId = ins?.id ?? null;
      if (referredBy) { try { localStorage.removeItem('mf_ref'); } catch {} }
    }

    // 체위가 있으면 growth_logs(시계열)에도 오늘 날짜로 기록 → 홈 BMI 즉시 반영
    if (childId && (h || w)) {
      await supabase.from('growth_logs').upsert(
        { child_id: childId, parent_id: user.id, measured_on: kstToday(), height_cm: h, weight_kg: w, updated_at: new Date().toISOString() },
        { onConflict: 'child_id,measured_on' }
      );
    }

    setLoading(false);
    router.push('/care/me');   // 가입·자녀 등록 후 마이페이지를 기본 진입으로
  }

  return (
    <main style={{ maxWidth:560, margin:'0 auto', padding:'40px 24px' }}>
      <header className="hero" style={{ borderRadius:16, marginBottom:24 }}>
        <h1 style={{ fontSize:28, fontWeight:800 }}>{editId ? '✏️ 아이 정보 수정' : '🌱 우리 아이 알려주세요'}</h1>
        <p style={{ marginTop:6 }}>{editId ? '바꾼 내용은 바로 코칭·BMI에 반영돼요' : '30초만 입력하면 개인화 시작 · 실명 절대 저장 X'}</p>
      </header>

      <form onSubmit={submit} style={{ background:'white', border:'1px solid #FFE8D0', borderRadius:14, padding:18, opacity: hydrating ? 0.5 : 1 }}>
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

        <div style={{ marginBottom:18 }}>
          <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>👧 성별 <span style={{ color:'#9CA3AF', fontWeight:600 }}>(BMI 또래 퍼센타일용)</span></label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
            {([['M','남아'],['F','여아']] as const).map(([v,l])=>(
              <button key={v} type="button" onClick={()=>setSex(sex===v?'':v)}
                style={{ padding:12, borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit',
                  background: sex===v?'#1a2b4a':'#FAFAF7', color: sex===v?'white':'#6B7280',
                  border:`1.5px solid ${sex===v?'#1a2b4a':'#E5E7EB'}` }}>{l}</button>
            ))}
          </div>
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

        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:13, fontWeight:800, color:'#1a2b4a' }}>🩺 만성질환·특이사항 (있다면)</label>
          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2, marginBottom:6 }}>코칭·영양 분석에 반영돼요. 없으면 비워두세요.</div>
          <textarea value={chronicConditions} onChange={(e)=>setChronicConditions(e.target.value)} rows={2}
            placeholder="예: 갑상선 기능저하, 신장질환, 페닐케톤뇨증(PKU), 유당불내증, 당뇨…"
            style={{ width:'100%', padding:'10px 12px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:13, fontFamily:'inherit', resize:'none', color:'#1a2b4a', boxSizing:'border-box' }} />
        </div>

        <button type="submit" disabled={loading || hydrating} style={{
          width:'100%', padding:14,
          background:'linear-gradient(135deg,#FF6B1A,#C45A00)', color:'white',
          border:'none', borderRadius:10, fontWeight:800, fontSize:15, cursor:'pointer',
        }}>
          {loading ? '저장 중...' : editId ? '✅ 수정 저장' : '🍽 우리 아이 편식 잡는 식단 받기'}
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
