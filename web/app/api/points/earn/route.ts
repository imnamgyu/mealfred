/**
 * POST /api/points/earn — 끼니 입력 포인트 적립(M7 v0).
 *
 * body: { child_id, date('YYYY-MM-DD'), slot }
 * 끼니 저장 직후 care가 호출. earn_meal_point RPC가 멱등(중복 차단)·일일 5끼 한도·잔액 트랜잭션 처리.
 * 위조 방지: p_parent는 클라가 못 넘기고 서버 세션 user.id로 고정. child 소유도 검증.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';

const POINT_PER_MEAL = 50;   // 끼니 입력 1건 적립(정액). 1P = 1원.

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { child_id, date, slot } = await req.json();
    if (!child_id || !date || !slot) return NextResponse.json({ ok: false, error: 'missing' }, { status: 400 });

    // 이 자녀가 로그인 부모 소유인지 검증(위조 방지)
    const { data: child } = await supabase.from('children').select('id').eq('id', child_id).eq('parent_id', user.id).maybeSingle();
    if (!child) return NextResponse.json({ ok: false, error: 'not_owner' }, { status: 403 });

    // 적립은 service_role로 RPC(security definer). p_parent = 세션 user.id(클라 위조 불가).
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.rpc('earn_meal_point', {
      p_parent: user.id, p_child: child_id, p_date: String(date).slice(0, 10), p_slot: String(slot), p_amount: POINT_PER_MEAL,
    });
    if (error) {
      console.error('[points/earn]', error.message);
      // 테이블/RPC 미생성 등 — 적립 실패가 끼니 기록을 막지 않게 graceful
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }
    return NextResponse.json({ ok: true, earned: data ?? 0 });   // data = 이번 실제 적립액(0=중복/한도)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 200 });
  }
}
