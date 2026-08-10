/**
 * POST /api/kit/order — 편식키트 사전예약 신청(결제 아님).
 * 세션 부모에 귀속(p_parent 위조 불가) · payload는 lib/kitOrder 검증 · use_points는 잔액·가격으로 서버 재상한.
 * 실제 포인트 차감은 관리자 확정 시(redeem_kit RPC) — 여기서는 '사용 의사'만 기록.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { validateKitOrder, capUsePoints } from '@/lib/kitOrder';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const input = validateKitOrder(await req.json().catch(() => null));
    if (!input) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });

    const admin = createSupabaseAdmin();

    // 같은 키트 종류의 미처리(requested) 신청이 이미 있으면 중복 접수 방지
    const { data: dup } = await admin.from('kit_orders')
      .select('id').eq('parent_id', user.id).eq('kit_type', input.kit_type).eq('status', 'requested').limit(1);
    if (dup && dup.length) return NextResponse.json({ ok: false, error: 'duplicate' }, { status: 200 });

    const { data: pb } = await admin.from('point_balance').select('balance').eq('parent_id', user.id).maybeSingle();
    const usePoints = capUsePoints(input.use_points, pb?.balance ?? 0, input.kit_type);

    const { data: order, error } = await admin.from('kit_orders').insert({
      parent_id: user.id,
      kit_type: input.kit_type,
      course: input.course,
      recipient_name: input.recipient_name,
      phone: input.phone,
      address: input.address,
      use_points: usePoints,
    }).select('id,kit_type,course,use_points,status,created_at').single();
    if (error) {
      // 동시 이중 제출은 부분 유니크 인덱스(kit_orders_one_open_per_type)가 DB에서 차단 → duplicate로 안내
      if (error.code === '23505') return NextResponse.json({ ok: false, error: 'duplicate' }, { status: 200 });
      console.error('[kit/order]', error.message);
      return NextResponse.json({ ok: false, error: 'db' }, { status: 200 });
    }
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 200 });
  }
}
