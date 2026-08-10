'use client';
/** AdminOrderBtn — 키트 사전예약 처리 버튼(확정=포인트 차감 / 취소 / 배송완료). /admin/orders 행에서 사용. */
import { useState } from 'react';

export default function AdminOrderBtn({ orderId, status, usePoints }: { orderId: string; status: string; usePoints: number }) {
  const [busy, setBusy] = useState(false);

  async function act(action: 'confirm' | 'cancel' | 'fulfill') {
    if (busy) return;
    if (action === 'confirm' && usePoints > 0 && !window.confirm(`확정하면 ${usePoints.toLocaleString()}P가 차감됩니다. 진행할까요?`)) return;
    setBusy(true);
    const r = await fetch('/api/admin/kit-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, action }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.ok) window.location.reload();
    else window.alert(`실패: ${r?.error || '네트워크 오류'}${r?.balance != null ? ` (잔액 ${r.balance}P)` : ''}`);
  }

  const btn = (label: string, action: 'confirm' | 'cancel' | 'fulfill', color: string) => (
    <button key={action} onClick={() => act(action)} disabled={busy}
      style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, border: `1px solid ${color}`, color, background: 'white', cursor: 'pointer', marginRight: 6, opacity: busy ? 0.5 : 1 }}>
      {label}
    </button>
  );

  if (status === 'requested') return <>{btn('확정', 'confirm', '#16A085')}{btn('취소', 'cancel', '#C62828')}</>;
  if (status === 'confirmed') return btn('배송완료', 'fulfill', '#1565C0');
  return null;
}
