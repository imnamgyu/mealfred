/**
 * POST /api/points/bonus — 일회성 보너스 적립.
 *
 * body: { child_id, kind, month? }
 * 금액·멱등키는 서버가 kind로 결정(클라 위조 불가). 현재:
 *   - 'daycare_menu' = +1,000P, 자녀·월 1회 멱등(같은 달 식단표 재업로드는 0).
 * earn_bonus RPC(security definer)가 멱등·잔액 트랜잭션 처리.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';

const BONUS: Record<string, { amount: number; kind: string; key: (childId: string, month: string) => string; needsMonth: boolean }> = {
  daycare_menu: { amount: 1000, kind: 'daycare_menu_bonus', key: (c, m) => `daycaremenu|${c}|${m}`, needsMonth: true },
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { child_id, kind, month } = await req.json();
    const spec = BONUS[kind as string];
    if (!child_id || !spec) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    if (spec.needsMonth && !/^\d{4}-\d{2}$/.test(String(month || ''))) return NextResponse.json({ ok: false, error: 'bad_month' }, { status: 400 });

    // 자녀 소유 검증(위조 방지)
    const { data: child } = await supabase.from('children').select('id').eq('id', child_id).eq('parent_id', user.id).maybeSingle();
    if (!child) return NextResponse.json({ ok: false, error: 'not_owner' }, { status: 403 });

    const admin = createSupabaseAdmin();
    const key = spec.key(child_id, String(month || ''));
    const { data, error } = await admin.rpc('earn_bonus', {
      p_parent: user.id, p_child: child_id, p_key: key, p_amount: spec.amount, p_kind: spec.kind,
      p_meta: { month: month || null },
    });
    if (error) {
      console.error('[points/bonus]', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });   // 적립 실패가 기록을 막지 않게
    }
    return NextResponse.json({ ok: true, earned: data ?? 0 });   // 0 = 중복(이미 받음)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 200 });
  }
}
