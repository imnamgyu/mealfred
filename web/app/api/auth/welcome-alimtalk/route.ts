/**
 * POST /api/auth/welcome-alimtalk
 *
 * 온보딩 완료 직후 가입 환영 알림톡 발송
 * 호출: web/app/onboarding/page.tsx 의 submit() 안에서 fire-and-forget
 *
 * 보안: Supabase 세션 검증 (Cookie 기반)
 * 비용: ₩8/회 (네이버 SENS)
 */
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { sendAlimtalkLogged } from '@/lib/sens';

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // 자녀 정보 (가장 최근)
  const { data: child } = await supabase.from('children')
    .select('nickname')
    .eq('parent_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const phone = user.phone;
  if (!phone) {
    return NextResponse.json({ ok: false, error: 'no phone on user' }, { status: 400 });
  }

  const result = await sendAlimtalkLogged({
    supabase,
    userId: user.id,
    phone,
    template: 'signup_welcome',
    templateCode: 'mealfred_welcome_v1',  // SENS 콘솔에 등록될 templateCode
    vars: {
      parentName: '어머니',
      childName: child?.nickname ?? '우리 아이',
    },
  });
  return NextResponse.json(result);
}
