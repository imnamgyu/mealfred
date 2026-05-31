/**
 * POST /api/points/redeem — 포인트로 월 구독 결제 차감(4,900P = 1개월).
 * redeem_subscription RPC가 잔액 확인(행 잠금)·차감·만료일 연장을 트랜잭션 처리.
 * p_parent는 서버 세션 user.id로 고정(클라 위조 불가).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';

const REDEEM_AMOUNT = 4900;   // 월 구독값

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const admin = createSupabaseAdmin();
    const { data, error } = await admin.rpc('redeem_subscription', { p_parent: user.id, p_amount: REDEEM_AMOUNT });
    if (error) {
      console.error('[points/redeem]', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }
    // data = { ok, paid_until?, balance, reason? }
    return NextResponse.json(data ?? { ok: false, error: 'no_data' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 200 });
  }
}
