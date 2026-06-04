'use client';
import { useState } from 'react';

export default function AdminModerateBtn({ postId, status }: { postId: string; status: string }) {
  const [st, setSt] = useState(status);
  const [busy, setBusy] = useState(false);
  const hidden = st === 'hidden';

  async function toggle() {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post_id: postId, action: hidden ? 'unhide' : 'hide' }) });
      const j = await r.json();
      if (j.ok) setSt(j.status);
    } catch { /* noop */ }
    setBusy(false);
  }

  return (
    <button onClick={toggle} disabled={busy} style={{
      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
      border: `1px solid ${hidden ? '#A5D6C6' : '#F5B5B5'}`,
      background: hidden ? '#F0FAF6' : '#FFF3F3', color: hidden ? '#1B7A3D' : '#C62828', opacity: busy ? 0.5 : 1,
    }}>{busy ? '…' : hidden ? '복구' : '숨기기'}</button>
  );
}
