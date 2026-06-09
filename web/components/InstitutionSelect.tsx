'use client';
/**
 * InstitutionSelect — 자녀가 다니는 어린이집·유치원을 '검색→선택'으로 정확히 등록.
 *  - 자유텍스트 금지: institutions 디렉터리(공개 RLS)에서 검색해 children.institution_id(불변 FK) 저장.
 *  - 동명 구분: 기관명(굵게) 아래 작고 흐린 글자로 [유형 · 시도 시군구 동].
 *  - 기존 가입자/신규 모두 사용(care 프로필·온보딩). 선택 시 daycare=true도 같이 켬.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

type Inst = { id: string; name: string; type: string; inst_type: string | null; sido: string | null; sigungu: string | null; dong: string | null };

const TYPE_LABEL: Record<string, string> = { daycare: '어린이집', kindergarten: '유치원', school: '학교' };
const norm = (s: string) => (s || '').replace(/\s+/g, '');
const subline = (i: Inst) => [i.inst_type || TYPE_LABEL[i.type], [i.sido, i.sigungu, i.dong].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

export default function InstitutionSelect({ childId, onChange }: { childId: string; onChange?: (inst: Inst | null) => void }) {
  const supabase = createSupabaseBrowser();
  const [current, setCurrent] = useState<Inst | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Inst[]>([]);
  const [loading, setLoading] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 현재 등록된 기관 로드
  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('children').select('institution_id').eq('id', childId).maybeSingle();
      const iid = (data as { institution_id?: string } | null)?.institution_id;
      if (!iid || cancelled) return;
      const { data: inst } = await supabase.from('institutions').select('id,name,type,inst_type,sido,sigungu,dong').eq('id', iid).maybeSingle();
      if (inst && !cancelled) setCurrent(inst as Inst);
    })();
    return () => { cancelled = true; };
  }, [childId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 검색(디바운스) — name_norm 부분일치, 접두 일치·짧은 이름 우선
  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    const qn = norm(q);
    if (qn.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    tRef.current = setTimeout(async () => {
      const { data } = await supabase.from('institutions')
        .select('id,name,type,inst_type,sido,sigungu,dong')
        .ilike('name_norm', `%${qn}%`).limit(40);
      const rows = ((data || []) as Inst[]).sort((a, b) => {
        const ap = norm(a.name).startsWith(qn) ? 0 : 1, bp = norm(b.name).startsWith(qn) ? 0 : 1;
        return ap - bp || a.name.length - b.name.length;
      });
      setResults(rows.slice(0, 20));
      setLoading(false);
    }, 250);
  }, [q]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pick = useCallback(async (inst: Inst) => {
    setCurrent(inst); setOpen(false); setQ(''); setResults([]); onChange?.(inst);
    const { error } = await supabase.from('children').update({ institution_id: inst.id, daycare: true }).eq('id', childId);
    if (error) console.warn('[institution] save:', error.message);
  }, [childId, onChange, supabase]);

  const clearInst = useCallback(async () => {
    setCurrent(null); onChange?.(null);
    await supabase.from('children').update({ institution_id: null }).eq('id', childId);
  }, [childId, onChange, supabase]);

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px dashed #FFE8D0' }}>
      {!open ? (
        current ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold truncate" style={{ color: '#1a2b4a' }}>🏫 {current.name}</div>
              <div className="text-[10.5px] mt-0.5 truncate" style={{ color: '#9a8a7a' }}>{subline(current)}</div>
            </div>
            <button onClick={() => setOpen(true)} className="text-[11px] font-extrabold flex-shrink-0" style={{ color: '#C45A00' }}>변경</button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="w-full text-left rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: '#FFF8F2', border: '1.5px solid #FFE0C0' }}>
            <span className="text-[12.5px] font-bold" style={{ color: '#C45A00' }}>🔍 자녀가 다니는 어린이집·유치원 등록</span>
            <span style={{ color: '#FFB375' }}>›</span>
          </button>
        )
      ) : (
        <div>
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="기관 이름 입력 (예: 가온)"
            className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={{ border: '1.5px solid #FFB375', outline: 'none', color: '#1a2b4a' }}
          />
          <div className="mt-2 rounded-xl overflow-hidden" style={{ border: results.length ? '1px solid #F0E8E0' : 'none', maxHeight: 260, overflowY: 'auto' }}>
            {results.map((i) => (
              <button key={i.id} onClick={() => pick(i)} className="w-full text-left px-3 py-2" style={{ borderBottom: '1px solid #F4EFE8', background: 'white' }}>
                <div className="text-[13px] font-bold" style={{ color: '#1a2b4a' }}>{i.name}</div>
                <div className="text-[10.5px] mt-0.5" style={{ color: '#a89888' }}>{subline(i)}</div>
              </button>
            ))}
          </div>
          {norm(q).length >= 2 && !loading && results.length === 0 && (
            <div className="text-[11.5px] px-1 py-2" style={{ color: '#9a8a7a' }}>검색 결과가 없어요. 이름을 줄이거나 다르게 입력해보세요.</div>
          )}
          <div className="flex items-center justify-between mt-2">
            {current ? <button onClick={clearInst} className="text-[11px] font-bold" style={{ color: '#C62828' }}>등록 해제</button> : <span />}
            <button onClick={() => { setOpen(false); setQ(''); setResults([]); }} className="text-[11px] font-extrabold" style={{ color: '#8a7a6a' }}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
