'use client';
import { useState } from 'react';

type Account = {
  found: boolean;
  parentId?: string;
  code?: string;
  nickname?: string | null;
  email?: string | null;
  provider?: string | null;
  signupAt?: string | null;
  lastSignInAt?: string | null;
  children?: { nickname: string; ageBand: string }[];
  mealCount?: number;
  lifetime?: boolean;
  lifetimeNote?: string | null;
  lifetimeGrantedAt?: string | null;
  paidUntil?: string | null;
};

const AGE: Record<string, string> = { younger: '만3세-', '3-4y': '만3–4', '5y': '만5', '6-7y': '만6–7' };
const box: React.CSSProperties = { border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 12px', fontSize: 14 };

export default function GrantSearch() {
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [acct, setAcct] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function search() {
    const c = code.trim();
    if (!c) return;
    setLoading(true); setErr(''); setAcct(null);
    try {
      const r = await fetch(`/api/admin/grant?code=${encodeURIComponent(c)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error || `${r.status}`); }
      else setAcct(d);
    } catch (e) { setErr(e instanceof Error ? e.message : '네트워크 오류'); }
    finally { setLoading(false); }
  }

  async function setLifetime(on: boolean) {
    if (!acct?.parentId) return;
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/admin/grant', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentId: acct.parentId, lifetime: on, note: note.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) setErr(d?.error || `${r.status}`);
      else setAcct({ ...acct, lifetime: on, lifetimeGrantedAt: on ? '방금' : null });
    } catch (e) { setErr(e instanceof Error ? e.message : '네트워크 오류'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder="초대코드 (예: jxsx7p9)" autoCapitalize="none" autoCorrect="off"
          style={{ flex: 1, ...box, fontFamily: 'monospace' }}
        />
        <button onClick={search} disabled={loading}
          style={{ background: loading ? '#9CA3AF' : '#1a2b4a', color: '#fff', border: 'none', borderRadius: 10, padding: '0 18px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
          {loading ? '…' : '검색'}
        </button>
      </div>

      {err && <div style={{ ...box, background: '#FFEBEE', color: '#C62828', borderColor: '#FFCDD2' }}>⚠ {err}</div>}

      {acct && !acct.found && (
        <div style={{ ...box, background: '#FAFAFA', color: '#9CA3AF' }}>그 코드의 계정을 찾지 못했어요. 코드를 다시 확인해주세요.</div>
      )}

      {acct?.found && (
        <div style={{ border: '1.5px solid #FFE0C0', borderRadius: 14, padding: 16, background: '#FFFDFB' }}>
          {/* 식별 정보 — 사람이 본인 계정인지 확인 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1a2b4a' }}>{acct.nickname || '(닉네임 없음)'}</span>
            {acct.lifetime && <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: '#16A085', borderRadius: 100, padding: '3px 9px' }}>🎉 평생무료</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12.5, color: '#4B5563' }}>
            <div>👶 자녀: <b>{(acct.children || []).map((k) => `${k.nickname}(${AGE[k.ageBand] || k.ageBand})`).join(', ') || '없음'}</b></div>
            <div>🍽️ 끼니: <b>{(acct.mealCount ?? 0).toLocaleString()}</b>건</div>
            <div>📅 가입: <b>{acct.signupAt || '?'}</b></div>
            <div>🕒 최근접속: <b>{acct.lastSignInAt || '?'}</b></div>
            <div>🔑 코드: <b>{acct.code}</b></div>
            <div>🔐 로그인: <b>{acct.email?.endsWith('@kakao.local') ? '카카오' : (acct.provider || '?')}</b></div>
          </div>
          <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 6, wordBreak: 'break-all' }}>{acct.email}</div>
          {acct.lifetime && acct.lifetimeGrantedAt && <div style={{ fontSize: 11, color: '#16A085', marginTop: 4 }}>부여됨 · {acct.lifetimeGrantedAt}{acct.lifetimeNote ? ` · ${acct.lifetimeNote}` : ''}</div>}

          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택): 부여 사유"
            style={{ ...box, width: '100%', marginTop: 12, fontSize: 12.5 }} />

          {acct.lifetime ? (
            <button onClick={() => setLifetime(false)} disabled={saving}
              style={{ width: '100%', marginTop: 10, background: '#fff', color: '#C62828', border: '1.5px solid #FFCDD2', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              {saving ? '처리 중…' : '평생무료 해제'}
            </button>
          ) : (
            <button onClick={() => setLifetime(true)} disabled={saving}
              style={{ width: '100%', marginTop: 10, background: saving ? '#9CA3AF' : '#16A085', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              {saving ? '처리 중…' : '🎉 이 계정에 평생무료 부여'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
