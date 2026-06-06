/**
 * RecipeBuilder — 식재료(명사)+조리방식(동사)+시간 버튼 조립으로 레시피 작성 모달.
 * 올리면 이케아식 인포그래픽으로 자동 시각화(미리보기) + 도감 §6 연동. 첫 레시피 +500P.
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import AuthModal from './AuthModal';
import RecipeInfographic from './RecipeInfographic';
import { COMMON_INGS, VERB_LIST, TIME_OPTS, ingEmoji, verbEmoji, type RecipeStep } from '@/lib/recipe';
import { DIFFICULTIES } from '@/lib/community';

export default function RecipeBuilder({ ingredient, onClose, onPosted }: { ingredient?: string; onClose: () => void; onPosted?: () => void }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [dish, setDish] = useState('');
  const [tip, setTip] = useState('');
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [cur, setCur] = useState<{ ing: string | null; verb: string | null; time: string | null; memo: string }>({ ing: null, verb: null, time: null, memo: '' });
  const [pick, setPick] = useState<'ing' | 'verb' | 'time' | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ id: string; firstBonus: number } | null>(null);

  useEffect(() => {
    createSupabaseBrowser().auth.getUser().then(({ data }) => { setAuthed(!!data.user); setUid(data.user?.id ?? null); });
  }, []);

  const ings = [...new Set([...(ingredient ? [ingredient] : []), ...COMMON_INGS])];

  function pickPhoto(f: File | null) {
    setPhoto(f);
    setPreview((p) => { if (p) URL.revokeObjectURL(p); return f ? URL.createObjectURL(f) : null; });
  }
  function addStep() {
    if (!cur.ing || !cur.verb) return;
    setSteps((s) => [...s, { ing: cur.ing!, verb: cur.verb!, time: cur.time && cur.time !== '없음' ? cur.time : undefined, memo: cur.memo.trim() || undefined }]);
    setCur({ ing: null, verb: null, time: null, memo: '' }); setPick(null);
  }

  async function submit() {
    if (dish.trim().length < 2) { setErr('음식 이름을 적어주세요.'); return; }
    if (!steps.length) { setErr('조리 순서를 한 단계 이상 만들어주세요.'); return; }
    setBusy(true); setErr('');
    let child_id: string | null = null;
    try { child_id = localStorage.getItem('mf_child'); } catch { /* noop */ }

    let photo_url: string | null = null;
    if (photo && uid) {
      try {
        const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const sb = createSupabaseBrowser();
        const { error: upErr } = await sb.storage.from('community').upload(path, photo, { upsert: false, contentType: photo.type || 'image/jpeg' });
        if (upErr) { setErr('사진 업로드 실패 — 사진 없이 올리거나 다시 시도해 주세요.'); setBusy(false); return; }
        photo_url = sb.storage.from('community').getPublicUrl(path).data.publicUrl;
      } catch { setErr('사진 업로드 중 오류'); setBusy(false); return; }
    }

    try {
      const res = await fetch('/api/community/recipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish: dish.trim(), tip: tip.trim() || undefined, photo_url, steps, ingredient, child_id, difficulty }),
      });
      const j = await res.json();
      if (!j.ok) { setErr(j.error || '저장에 실패했어요'); setBusy(false); return; }
      setDone({ id: j.recipe?.id, firstBonus: j.firstBonus || 0 });
      onPosted?.();
    } catch { setErr('네트워크 오류가 났어요'); setBusy(false); }
  }

  const overlay = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center';
  const sheet = 'bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto';
  const slotCls = (filled: boolean) => `flex-1 rounded-xl py-2.5 text-[13px] font-bold text-center cursor-pointer ${filled ? '' : ''}`;
  const slotStyle = (filled: boolean) => ({ border: `1.5px ${filled ? 'solid #FFB375' : 'dashed #D8C8B8'}`, color: filled ? '#C45A00' : '#9a8a7a', background: filled ? '#FFF8F0' : 'white' });

  if (authed === false) {
    return (
      <div className={overlay} style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
        <div className={sheet} onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-extrabold mb-1" style={{ color: '#1a2b4a' }}>레시피 올리기</h3>
          <p className="text-sm mb-4" style={{ color: '#6B7280' }}>로그인하면 레시피를 나눌 수 있어요. 첫 레시피엔 <b style={{ color: '#C45A00' }}>+500P</b>!</p>
          <button onClick={() => setShowAuth(true)} className="w-full py-3 rounded-xl font-extrabold text-sm" style={{ background: '#FEE500', color: '#1a2b4a' }}>로그인 / 가입</button>
          <button onClick={onClose} className="w-full py-2.5 mt-2 text-sm font-bold" style={{ color: '#9CA3AF' }}>닫기</button>
          {showAuth && <AuthModal open onClose={() => setShowAuth(false)} />}
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={overlay} style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
        <div className={sheet} onClick={(e) => e.stopPropagation()}>
          <div className="text-center mb-3">
            <div className="text-3xl mb-1">🎉</div>
            <h3 className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>레시피가 올라갔어요!</h3>
            {done.firstBonus > 0 && <div className="inline-block rounded-xl px-3 py-1.5 mt-2 text-[13px] font-extrabold" style={{ background: '#FFF5EB', color: '#C45A00', border: '1px solid #FFD0A0' }}>첫 레시피 +{done.firstBonus.toLocaleString()}P 🥕</div>}
          </div>
          <div className="rounded-2xl p-3 mb-3" style={{ background: '#FFFDFB', border: '1px solid #F0E6DC' }}>
            <RecipeInfographic dish={dish.trim()} tip={tip.trim()} photoUrl={preview} steps={steps} author="🍀 내 레시피" badge="방금 올림" />
          </div>
          <div className="flex gap-2">
            {done.id && <a href={`/recipe/${done.id}`} className="flex-1 py-3 rounded-xl font-extrabold text-sm text-center" style={{ background: '#FF6B1A', color: 'white', textDecoration: 'none' }}>레시피 보기</a>}
            <button onClick={onClose} className="flex-1 py-3 rounded-xl font-extrabold text-sm" style={{ background: '#F1F1F0', color: '#1a2b4a' }}>닫기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={overlay} style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className={sheet} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>✏️ {ingredient ? `${ingredient} ` : ''}레시피 올리기</h3>
          <button onClick={onClose} className="text-xl" style={{ color: '#9CA3AF' }}>✕</button>
        </div>
        <div className="rounded-xl px-3 py-2 mb-3 text-[11.5px] font-bold text-center" style={{ background: 'linear-gradient(135deg,#FFF3E0,#FFE0B2)', color: '#8a5a00', border: '1px solid #FFB877' }}>🎁 첫 레시피 <b style={{ color: '#C45A00' }}>+500P</b> · 올리면 그림 설명서처럼 자동 정리</div>

        {/* ① 음식 이름 */}
        <div className="text-[12.5px] font-extrabold mb-1" style={{ color: '#1a2b4a' }}>① 음식 이름 <span className="text-[10px] font-bold" style={{ color: '#E53935' }}>필수</span></div>
        <input value={dish} onChange={(e) => setDish(e.target.value)} placeholder={ingredient ? `예: ${ingredient} 숨김 계란말이` : '예: 당근 숨김 계란말이'}
          className="w-full rounded-xl px-3 py-2.5 text-[14.5px] font-semibold outline-none mb-3" style={{ border: '1.5px solid #E5E7EB' }} />

        {/* ② 사진(선택) */}
        <div className="text-[12.5px] font-extrabold mb-1" style={{ color: '#1a2b4a' }}>② 완성 사진 <span className="text-[10px] font-bold" style={{ color: '#9CA3AF' }}>선택·권장</span></div>
        <div className="mb-3">
          {preview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" className="w-full rounded-xl object-cover" style={{ maxHeight: 200 }} />
              <button onClick={() => pickPhoto(null)} className="absolute top-2 right-2 text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}>✕ 빼기</button>
            </div>
          ) : (
            <label className="block w-full rounded-xl py-3 text-center text-[13px] font-bold cursor-pointer" style={{ border: '1.5px dashed #FFD0A0', color: '#C45A00', background: '#FFFBF5' }}>
              📷 완성 사진 추가
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0] || null)} />
            </label>
          )}
        </div>

        {/* ③ 한 줄 팁 */}
        <div className="text-[12.5px] font-extrabold mb-1" style={{ color: '#1a2b4a' }}>③ 한 줄 팁 <span className="text-[10px] font-bold" style={{ color: '#9CA3AF' }}>선택</span></div>
        <input value={tip} onChange={(e) => setTip(e.target.value)} placeholder="얇게 채 썰어 숨겼더니 색이 예뻐 관심부터 생겨요"
          className="w-full rounded-xl px-3 py-2.5 text-[13.5px] outline-none mb-3" style={{ border: '1.5px solid #E5E7EB' }} />

        {/* ④ 조리 순서 조립 */}
        <div className="text-[12.5px] font-extrabold mb-1.5" style={{ color: '#1a2b4a' }}>④ 조리 순서 — 버튼만 눌러 조립</div>
        <div className="rounded-2xl p-3" style={{ background: '#FBF7F2', border: '1.5px solid #F0E6DC' }}>
          <div className="flex gap-2 mb-2">
            <button onClick={() => setPick(pick === 'ing' ? null : 'ing')} className={slotCls(!!cur.ing)} style={slotStyle(!!cur.ing)}>{cur.ing ? `${ingEmoji(cur.ing)} ${cur.ing}` : '＋ 식재료'}</button>
            <button onClick={() => setPick(pick === 'verb' ? null : 'verb')} className={slotCls(!!cur.verb)} style={slotStyle(!!cur.verb)}>{cur.verb ? `${verbEmoji(cur.verb)} ${cur.verb}` : '＋ 조리방식'}</button>
            <button onClick={() => setPick(pick === 'time' ? null : 'time')} className={slotCls(!!cur.time && cur.time !== '없음')} style={slotStyle(!!cur.time && cur.time !== '없음')}>{cur.time && cur.time !== '없음' ? `⏱ ${cur.time}` : '＋ 시간'}</button>
          </div>

          {pick && (
            <div className="pt-2 mb-2" style={{ borderTop: '1px dashed #E0D5C8' }}>
              <div className="text-[10.5px] font-extrabold mb-1.5" style={{ color: '#8a7a6a' }}>{pick === 'ing' ? '식재료 (명사)' : pick === 'verb' ? '조리방식 (동사)' : '시간 (선택)'}</div>
              <div className="flex flex-wrap gap-1.5">
                {(pick === 'ing' ? ings : pick === 'verb' ? VERB_LIST : TIME_OPTS).map((opt) => {
                  const on = cur[pick] === opt;
                  const label = pick === 'ing' ? `${ingEmoji(opt)} ${opt}` : pick === 'verb' ? `${verbEmoji(opt)} ${opt}` : opt;
                  return <button key={opt} onClick={() => setCur((c) => ({ ...c, [pick]: c[pick] === opt ? null : opt }))} className="text-[12.5px] font-bold px-2.5 py-1.5 rounded-full" style={{ background: on ? '#1a2b4a' : '#fff', color: on ? '#fff' : '#5a6575', border: `1.5px solid ${on ? '#1a2b4a' : '#E5E7EB'}` }}>{label}</button>;
                })}
              </div>
            </div>
          )}

          <input value={cur.memo} onChange={(e) => setCur((c) => ({ ...c, memo: e.target.value }))} placeholder="메모(선택) — 예: 아주 얇게"
            className="w-full rounded-lg px-2.5 py-2 text-[12.5px] outline-none mb-2" style={{ border: '1px solid #E5E7EB' }} />
          <button onClick={addStep} disabled={!cur.ing || !cur.verb} className="w-full rounded-lg py-2.5 text-[13px] font-extrabold" style={{ background: !cur.ing || !cur.verb ? '#C9C2BA' : '#1a2b4a', color: 'white' }}>이 단계 추가 ＋</button>

          {steps.length > 0 && (
            <div className="mt-3">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl px-2.5 py-2 mb-1.5 text-[13px] font-bold" style={{ background: 'white', border: '1.5px solid #F0E6DC' }}>
                  <span className="flex items-center justify-center flex-shrink-0" style={{ width: 20, height: 20, borderRadius: '50%', background: '#1a2b4a', color: 'white', fontSize: 11 }}>{i + 1}</span>
                  <span>{ingEmoji(s.ing)} {s.ing}</span><span style={{ color: '#C9B8A8' }}>→</span><span>{verbEmoji(s.verb)} {s.verb}</span>
                  {s.time && <span style={{ color: '#C45A00' }}>· {s.time}</span>}
                  <button onClick={() => setSteps((st) => st.filter((_, j) => j !== i))} className="ml-auto" style={{ color: '#C9B0A0' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 난이도 */}
        <div className="mt-3">
          <div className="text-[11px] font-bold mb-1.5" style={{ color: '#6B7280' }}>난이도</div>
          <div className="flex gap-1.5">
            {DIFFICULTIES.map((d) => (
              <button key={d} onClick={() => setDifficulty(difficulty === d ? null : d)} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: difficulty === d ? '#1a2b4a' : '#FAFAF7', color: difficulty === d ? 'white' : '#6B7280', border: `1px solid ${difficulty === d ? '#1a2b4a' : '#E5E7EB'}` }}>{d}</button>
            ))}
          </div>
        </div>

        {err && <div className="text-xs font-bold mt-3" style={{ color: '#E53935' }}>{err}</div>}
        <button onClick={submit} disabled={busy} className="w-full py-3 mt-4 rounded-xl font-extrabold text-sm" style={{ background: busy ? '#FFBE99' : '#FF6B1A', color: 'white' }}>
          {busy ? '올리는 중…' : '레시피 올리고 인포그래픽 보기 →'}
        </button>
      </div>
    </div>
  );
}
