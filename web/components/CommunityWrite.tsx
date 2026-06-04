/**
 * components/CommunityWrite.tsx — 저마찰 노하우 작성 모달(도감 §6 / 마을에서 호출).
 * 한 줄 노하우(필수) + 식재료(프리필/입력) + 방법·성향·난이도·시간 칩 + 위험 키워드 안내.
 * 비로그인이면 로그인 유도. 성공 시 첫 글 +500P 토스트.
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import AuthModal from './AuthModal';
import { TRAIT_CHIPS, METHOD_TYPES, DIFFICULTIES, MIN_BODY, validateBody, dangerWarnings } from '@/lib/community';

export default function CommunityWrite({ ingredient, onClose, onPosted }: { ingredient?: string; onClose: () => void; onPosted?: () => void }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [body, setBody] = useState('');
  const [ings, setIngs] = useState<string[]>(ingredient ? [ingredient] : []);
  const [ingInput, setIngInput] = useState('');
  const [method, setMethod] = useState<string | null>(null);
  const [traits, setTraits] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [timeMin, setTimeMin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ firstBonus: number } | null>(null);

  useEffect(() => {
    createSupabaseBrowser().auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  const warns = dangerWarnings(body);
  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function submit() {
    const v = validateBody(body);
    if (!v.ok) { setErr(v.reason || ''); return; }
    setBusy(true); setErr('');
    let child_id: string | null = null;
    try { child_id = localStorage.getItem('mf_child'); } catch { /* noop */ }
    try {
      const res = await fetch('/api/community/post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim(), ingredient, ingredients: ings, child_id,
          method_type: method, traits, difficulty, time_min: timeMin ? Number(timeMin) : undefined,
        }),
      });
      const j = await res.json();
      if (!j.ok) { setErr(j.error || '저장에 실패했어요'); setBusy(false); return; }
      setDone({ firstBonus: j.firstBonus || 0 });
      onPosted?.();
    } catch {
      setErr('네트워크 오류가 났어요'); setBusy(false);
    }
  }

  const overlay = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center';
  const sheet = 'bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto';

  // 로그인 필요
  if (authed === false) {
    return (
      <div className={overlay} style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
        <div className={sheet} onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-extrabold mb-1" style={{ color: '#1a2b4a' }}>노하우 남기기</h3>
          <p className="text-sm mb-4" style={{ color: '#6B7280' }}>로그인하면 다른 엄마들에게 노하우를 나눌 수 있어요. 첫 글엔 <b style={{ color: '#C45A00' }}>+500P</b>!</p>
          <button onClick={() => setShowAuth(true)} className="w-full py-3 rounded-xl font-extrabold text-sm" style={{ background: '#FEE500', color: '#1a2b4a' }}>로그인 / 가입</button>
          <button onClick={onClose} className="w-full py-2.5 mt-2 text-sm font-bold" style={{ color: '#9CA3AF' }}>닫기</button>
          {showAuth && <AuthModal open onClose={() => setShowAuth(false)} />}
        </div>
      </div>
    );
  }

  // 완료
  if (done) {
    return (
      <div className={overlay} style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
        <div className={sheet + ' text-center'} onClick={(e) => e.stopPropagation()}>
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="text-lg font-extrabold mb-1" style={{ color: '#1a2b4a' }}>노하우가 올라갔어요!</h3>
          <p className="text-sm mb-3" style={{ color: '#6B7280' }}>다른 엄마들이 보고 '해봤어요'로 응답할 거예요.</p>
          {done.firstBonus > 0 && (
            <div className="rounded-xl px-4 py-3 mb-3 text-sm font-extrabold" style={{ background: '#FFF5EB', color: '#C45A00', border: '1px solid #FFD0A0' }}>
              첫 노하우 보너스 +{done.firstBonus.toLocaleString()}P 적립! 🥕
            </div>
          )}
          <button onClick={onClose} className="w-full py-3 rounded-xl font-extrabold text-sm" style={{ background: '#FF6B1A', color: 'white' }}>확인</button>
        </div>
      </div>
    );
  }

  return (
    <div className={overlay} style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className={sheet} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>✏️ 노하우 남기기</h3>
          <button onClick={onClose} className="text-xl" style={{ color: '#9CA3AF' }}>✕</button>
        </div>

        {/* 식재료 칩 */}
        <div className="mb-3">
          <div className="text-[11px] font-bold mb-1.5" style={{ color: '#6B7280' }}>어떤 식재료인가요?</div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {ings.map((i) => (
              <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: '#FFF0E0', color: '#C45A00' }}>
                {i}{ings.length > 0 && <button onClick={() => setIngs(ings.filter((x) => x !== i))} className="ml-0.5">✕</button>}
              </span>
            ))}
            <input value={ingInput} onChange={(e) => setIngInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && ingInput.trim()) { setIngs([...new Set([...ings, ingInput.trim()])]); setIngInput(''); } }}
              placeholder={ings.length ? '+ 추가' : '예: 시금치'} className="text-xs px-2 py-1 rounded-full outline-none" style={{ background: '#FAFAF7', border: '1px solid #E5E7EB', width: 80 }} />
          </div>
          <p className="text-[10.5px] mt-1" style={{ color: '#9CA3AF' }}>본문에서 식재료를 자동으로도 찾아 연결해요.</p>
        </div>

        {/* 한 줄 노하우 */}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
          placeholder={ingredient ? `이 ${ingredient}, 어떻게 하니 잘 먹었나요?` : '우리 아이가 이렇게 하니 잘 먹었어요…'}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-1" style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB' }} />
        <div className="text-[10.5px] mb-3 text-right" style={{ color: body.trim().length < MIN_BODY ? '#E53935' : '#9CA3AF' }}>{body.trim().length}자</div>

        {/* 위험 키워드 안내 */}
        {warns.map((w, i) => (
          <div key={i} className="rounded-lg px-3 py-2 mb-2 text-[12px] font-bold" style={{ background: '#FFF8E8', color: '#8a5a00', border: '1px solid #FFE0A0' }}>⚠️ {w}</div>
        ))}

        {/* 방법 유형 */}
        <ChipRow label="방법" items={METHOD_TYPES} value={method ? [method] : []} onToggle={(v) => setMethod(method === v ? null : v)} />
        {/* 아이 성향 */}
        <ChipRow label="우리 아이는" items={TRAIT_CHIPS} value={traits} onToggle={(v) => toggle(traits, v, setTraits)} multi />
        {/* 난이도 */}
        <ChipRow label="난이도" items={DIFFICULTIES} value={difficulty ? [difficulty] : []} onToggle={(v) => setDifficulty(difficulty === v ? null : v)} />

        {err && <div className="text-xs font-bold my-2" style={{ color: '#E53935' }}>{err}</div>}

        <button onClick={submit} disabled={busy} className="w-full py-3 mt-3 rounded-xl font-extrabold text-sm" style={{ background: busy ? '#FFBE99' : '#FF6B1A', color: 'white' }}>
          {busy ? '올리는 중…' : '노하우 올리기'}
        </button>
        <p className="text-[10.5px] text-center mt-2" style={{ color: '#9CA3AF' }}>비난·비교·강압·판매 글은 가려질 수 있어요. 따뜻한 응원만 부탁드려요.</p>
      </div>
    </div>
  );
}

function ChipRow({ label, items, value, onToggle, multi }: { label: string; items: string[]; value: string[]; onToggle: (v: string) => void; multi?: boolean }) {
  return (
    <div className="mb-2.5">
      <div className="text-[11px] font-bold mb-1.5" style={{ color: '#6B7280' }}>{label}{multi ? ' (여러 개)' : ''}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => {
          const on = value.includes(it);
          return (
            <button key={it} onClick={() => onToggle(it)} className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: on ? '#1a2b4a' : '#FAFAF7', color: on ? 'white' : '#6B7280', border: `1px solid ${on ? '#1a2b4a' : '#E5E7EB'}` }}>{it}</button>
          );
        })}
      </div>
    </div>
  );
}
