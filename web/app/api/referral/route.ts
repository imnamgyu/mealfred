/**
 * GET /api/referral — 내 초대 코드(없으면 생성) + 방문 수 + 과금 상태.
 *
 * 클라(/care/me)가 호출. 방문 카운트/코드 생성은 service_role로(테이블 RLS는 클라 차단).
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { referralBilling } from '@/lib/billing';
import { kstToday } from '@/lib/date';

export const dynamic = 'force-dynamic';

function genCode(): string {
  // 짧고 읽기 쉬운 코드 (혼동문자 제외)
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const buf = crypto.getRandomValues(new Uint32Array(7));
  for (let i = 0; i < 7; i++) s += abc[buf[i] % abc.length];
  return s;
}

export async function GET() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const db = createSupabaseAdmin();
  let { data: ref } = await db.from('app_referrals').select('code,created_at').eq('parent_id', user.id).maybeSingle();
  if (!ref) {
    // 코드 생성(충돌 시 몇 번 재시도)
    for (let i = 0; i < 4 && !ref; i++) {
      const code = genCode();
      const { data, error } = await db.from('app_referrals').insert({ parent_id: user.id, code }).select('code,created_at').single();
      if (!error && data) ref = data;
      else if (error && !/duplicate|unique/i.test(error.message)) break;
    }
  }
  if (!ref) return NextResponse.json({ error: 'code_failed' }, { status: 500 });

  const { count } = await db.from('app_referral_visits').select('*', { count: 'exact', head: true }).eq('code', ref.code);
  const visits = count ?? 0;
  const billing = referralBilling(ref.created_at, visits, kstToday());

  return NextResponse.json({ code: ref.code, visits, billing });
}
