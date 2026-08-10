/**
 * POST /api/admin/kit-order — 키트 사전예약 처리(확정/취소/배송완료). 관리자(@mealfred.com)만.
 * body: { order_id, action: 'confirm' | 'cancel' | 'fulfill' }
 * confirm: use_points > 0이면 redeem_kit RPC로 실차감(주문 멱등키 — 이중 클릭에도 1회만) 후 status 확정.
 * cancel: requested만 취소 가능(확정 후 취소는 포인트 환불이 얽혀 수동 처리).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerAnon, createSupabaseAdmin } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';

export async function POST(req: NextRequest) {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const { order_id, action } = await req.json().catch(() => ({}));
  if (!order_id || !['confirm', 'cancel', 'fulfill'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: order } = await admin.from('kit_orders')
    .select('id,parent_id,kit_type,use_points,point_redeemed,status').eq('id', order_id).maybeSingle();
  if (!order) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  if (action === 'cancel') {
    if (order.status !== 'requested') return NextResponse.json({ ok: false, error: 'not_cancellable' }, { status: 200 });
    const { error } = await admin.from('kit_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', order_id);
    return NextResponse.json({ ok: !error, error: error?.message });
  }

  if (action === 'fulfill') {
    if (order.status !== 'confirmed') return NextResponse.json({ ok: false, error: 'not_confirmed' }, { status: 200 });
    const { error } = await admin.from('kit_orders').update({ status: 'fulfilled', updated_at: new Date().toISOString() }).eq('id', order_id);
    return NextResponse.json({ ok: !error, error: error?.message });
  }

  // confirm
  if (order.status !== 'requested') return NextResponse.json({ ok: false, error: 'not_requested' }, { status: 200 });
  let redeemed = 0;
  if (order.use_points > 0) {
    const { data: r, error: rpcErr } = await admin.rpc('redeem_kit', { p_parent: order.parent_id, p_order: order.id, p_amount: order.use_points });
    if (rpcErr) return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 200 });
    if (!r?.ok) return NextResponse.json({ ok: false, error: r?.reason || 'redeem_failed', balance: r?.balance }, { status: 200 });
    redeemed = r.redeemed ?? 0;
    if (r.reason === 'already') {
      // 재시도 경로(이전 확정에서 RPC 차감 후 상태 갱신만 실패) — 실차감액을 원장에서 복원해 0 덮어쓰기 방지
      const { data: led } = await admin.from('point_ledger').select('amount').eq('idempotency_key', `kit|${order.id}`).maybeSingle();
      redeemed = led ? Math.abs(led.amount) : 0;
    }
  }
  // status 가드 — 다른 관리자 탭이 그 사이 처리했으면 덮어쓰지 않음(0행 갱신 = raced)
  const { data: upd, error } = await admin.from('kit_orders')
    .update({ status: 'confirmed', point_redeemed: redeemed, updated_at: new Date().toISOString() })
    .eq('id', order_id).eq('status', 'requested').select('id');
  if (!error && (!upd || upd.length === 0)) return NextResponse.json({ ok: false, error: 'raced' }, { status: 200 });
  return NextResponse.json({ ok: !error, error: error?.message, redeemed });
}
