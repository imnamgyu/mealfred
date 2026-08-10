/**
 * /admin/orders — 편식키트 사전예약 주문 관리(키트 탭 개편 2026-08-10).
 * 확정 = 포인트 실차감(redeem_kit RPC, 주문 멱등) · 취소는 requested만 · 확정 후엔 배송완료 처리.
 * 접근: @mealfred.com 관리자만(레이아웃 게이트 + 자체 가드).
 */
import Link from 'next/link';
import { createSupabaseServerAnon, createSupabaseAdmin } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import AdminOrderBtn from '@/components/AdminOrderBtn';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string; parent_id: string; kit_type: string; course: string | null;
  recipient_name: string; phone: string; address: string;
  use_points: number; point_redeemed: number; status: string; created_at: string;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  requested: { label: '접수됨', color: '#C45A00', bg: '#FFF0E0' },
  confirmed: { label: '확정', color: '#16A085', bg: '#EAF6F0' },
  cancelled: { label: '취소', color: '#9CA3AF', bg: '#F4F4F5' },
  fulfilled: { label: '배송완료', color: '#1565C0', bg: '#EEF2FF' },
};

const kst = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const fmtPhone = (p: string) => p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p;

const th = { textAlign: 'left' as const, padding: '8px 10px', fontSize: 12, fontWeight: 800, color: '#6B7280', borderBottom: '2px solid #ECECEC', whiteSpace: 'nowrap' as const };
const td = { padding: '9px 10px', fontSize: 12.5, color: '#374151', borderBottom: '1px solid #F3F4F6', verticalAlign: 'top' as const };

export default async function AdminOrdersPage() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 480, margin: '60px auto', padding: 24 }}><p style={{ color: '#6B7280' }}>🔒 관리자 전용. <Link href="/admin" style={{ color: '#FF6B1A' }}>← 콘솔</Link></p></main>;
  }

  const admin = createSupabaseAdmin();
  const { data } = await admin.from('kit_orders')
    .select('id,parent_id,kit_type,course,recipient_name,phone,address,use_points,point_redeemed,status,created_at')
    .order('created_at', { ascending: false }).limit(200);
  const orders = (data as OrderRow[] | null) || [];
  const kpi = (s: string) => orders.filter((o) => o.status === s).length;

  return (
    <main style={{ padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a2b4a' }}>📦 키트 사전예약 주문</h1>
      <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>
        확정하면 신청 포인트가 <b>실제 차감</b>돼요(주문별 1회 멱등). 확정 후 취소는 포인트 환불이 얽혀 있어 DB에서 수동 처리하세요.
      </p>
      <div style={{ display: 'flex', gap: 10, margin: '14px 0 18px' }}>
        {(['requested', 'confirmed', 'fulfilled', 'cancelled'] as const).map((s) => (
          <div key={s} style={{ background: STATUS_META[s].bg, color: STATUS_META[s].color, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 800 }}>
            {STATUS_META[s].label} {kpi(s)}
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <p style={{ color: '#9CA3AF', fontSize: 14, marginTop: 30 }}>아직 신청이 없어요 — 키트 탭(/kit)에서 사전예약이 들어오면 여기 쌓입니다.</p>
      ) : (
        <div style={{ overflowX: 'auto', background: 'white', borderRadius: 12, border: '1px solid #ECECEC' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead><tr>
              <th style={th}>접수(KST)</th><th style={th}>키트</th><th style={th}>수취인</th><th style={th}>연락처</th>
              <th style={th}>주소</th><th style={th}>포인트</th><th style={th}>상태</th><th style={th}>처리</th>
            </tr></thead>
            <tbody>
              {orders.map((o) => {
                const m = STATUS_META[o.status] || STATUS_META.requested;
                return (
                  <tr key={o.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{kst(o.created_at)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>{o.kit_type === 'gollo' ? '📦 골고루' : `🎯 집중${o.course ? `·${o.course}` : ''}`}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{o.recipient_name}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtPhone(o.phone)}</td>
                    <td style={{ ...td, maxWidth: 260 }}>{o.address}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {o.status === 'requested'
                        ? (o.use_points > 0 ? `${o.use_points.toLocaleString()}P 할인 신청` : '—')
                        : (o.point_redeemed > 0 ? `-${o.point_redeemed.toLocaleString()}P 차감됨` : '—')}
                    </td>
                    <td style={td}><span style={{ background: m.bg, color: m.color, borderRadius: 100, padding: '3px 10px', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{m.label}</span></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><AdminOrderBtn orderId={o.id} status={o.status} usePoints={o.use_points} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
