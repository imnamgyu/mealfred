'use client';
/**
 * VoteButtons — 어드민(이사님) A/B 변형별 1탭 비교 평가(EPIC G-08).
 *
 * 한 날짜의 A·B 각 편지에 대해 👍도움됐어요 / 👎별로 / 🔁또비슷을 찍는다.
 * → POST /api/admin/compare-vote(isAdmin 게이트·service_role upsert·변형별 하루 1표 덮어쓰기).
 *   compare_votes는 RLS가 parent_id=auth.uid()라 어드민 클라 직접 쓰기는 막힌다 → 서버 라우트 경유(안전).
 *
 * props.initial = 서버가 읽어둔 기존 평가({A:'up'|..., B:...}) — 낙관적 하이라이트 시작값.
 */
import { useState } from 'react';

type Rating = 'up' | 'down' | 'repeat';
type Variant = 'A' | 'B';
const OPTS: [Rating, string][] = [['up', '👍'], ['down', '👎'], ['repeat', '🔁']];
const VLABEL: Record<Variant, string> = { A: 'A · v2', B: 'B · 새설계' };

export default function VoteButtons({
  childId, letterDate, initial,
}: { childId: string; letterDate: string; initial?: { A?: Rating | null; B?: Rating | null } }) {
  const [sel, setSel] = useState<{ A: Rating | null; B: Rating | null }>({ A: initial?.A ?? null, B: initial?.B ?? null });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  async function vote(variant: Variant, rating: Rating) {
    setErr(false);
    setBusy(`${variant}:${rating}`);
    const prev = sel[variant];
    setSel((s) => ({ ...s, [variant]: rating })); // 낙관적
    try {
      const res = await fetch('/api/admin/compare-vote', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ child_id: childId, letter_date: letterDate, variant, rating }),
      });
      const j = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !j.ok) { setErr(true); setSel((s) => ({ ...s, [variant]: prev })); } // 롤백
    } catch { setErr(true); setSel((s) => ({ ...s, [variant]: prev })); }
    finally { setBusy(null); }
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 10px' }}>
      {(['A', 'B'] as Variant[]).map((v) => (
        <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F8F8F5', border: '1px solid #ECECEC', borderRadius: 10, padding: '4px 8px' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: v === 'A' ? '#6B7280' : '#1565C0' }}>{VLABEL[v]}</span>
          {OPTS.map(([r, icon]) => {
            const on = sel[v] === r;
            const loading = busy === `${v}:${r}`;
            return (
              <button key={r} onClick={() => vote(v, r)} disabled={!!busy}
                title={r === 'up' ? '도움됐어요' : r === 'down' ? '별로' : '또 비슷해요'}
                style={{
                  fontSize: 13, lineHeight: 1, padding: '4px 7px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer',
                  border: on ? '1.5px solid #F9A825' : '1px solid #E5E7EB',
                  background: on ? '#FFF4E5' : 'white', opacity: loading ? 0.5 : 1,
                }}>{icon}</button>
            );
          })}
        </div>
      ))}
      {err && <span style={{ fontSize: 10.5, color: '#B91C1C', alignSelf: 'center' }}>저장 실패(권한·테이블 확인)</span>}
    </div>
  );
}
