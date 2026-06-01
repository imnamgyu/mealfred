/**
 * /api/admin/grant — 관리자 평생무료 부여/조회.
 *
 * GET  ?code=<초대코드>  → 그 코드 주인 계정 식별 정보(닉네임·이메일·자녀·가입일·끼니수·현재 평생무료)
 * POST { parentId, lifetime, note } → app_subscriptions.lifetime 토글(부여/해제)
 *
 * 접근: @mealfred.com 관리자만(isAdmin). 식별·쓰기는 service_role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerAnon, createSupabaseAdmin } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';

async function requireAdmin(): Promise<boolean> {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  return isAdmin(user);
}

const kst = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16) : null);

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const code = (new URL(req.url).searchParams.get('code') || '').trim().toLowerCase();
  if (!code) return NextResponse.json({ error: 'no_code' }, { status: 400 });

  const db = createSupabaseAdmin();
  const { data: ref } = await db.from('app_referrals').select('parent_id,code').eq('code', code).maybeSingle();
  if (!ref) return NextResponse.json({ found: false });
  const pid = ref.parent_id as string;

  const [{ data: acct }, { data: kids }, { count: meals }, { data: sub }] = await Promise.all([
    db.auth.admin.getUserById(pid),
    db.from('children').select('nickname,age_band,created_at').eq('parent_id', pid).order('created_at'),
    db.from('meal_logs').select('*', { count: 'exact', head: true }).eq('parent_id', pid),
    db.from('app_subscriptions').select('lifetime,paid_until,lifetime_note,lifetime_granted_at').eq('parent_id', pid).maybeSingle(),
  ]);
  const u = acct?.user;
  return NextResponse.json({
    found: true,
    parentId: pid,
    code: ref.code,
    nickname: (u?.user_metadata?.nickname as string) || null,
    email: u?.email || null,
    provider: (u?.app_metadata?.provider as string) || (u?.user_metadata?.provider as string) || null,
    signupAt: kst(u?.created_at),
    lastSignInAt: kst(u?.last_sign_in_at),
    children: (kids || []).map((k: { nickname: string; age_band: string }) => ({ nickname: k.nickname, ageBand: k.age_band })),
    mealCount: meals ?? 0,
    lifetime: !!sub?.lifetime,
    lifetimeNote: sub?.lifetime_note || null,
    lifetimeGrantedAt: kst(sub?.lifetime_granted_at),
    paidUntil: sub?.paid_until || null,
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { parentId, lifetime, note } = await req.json();
  if (!parentId) return NextResponse.json({ error: 'no_parent' }, { status: 400 });

  const db = createSupabaseAdmin();
  const { error } = await db.from('app_subscriptions').upsert(
    {
      parent_id: parentId,
      lifetime: !!lifetime,
      lifetime_note: (note as string)?.slice(0, 200) || null,
      lifetime_granted_at: lifetime ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'parent_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lifetime: !!lifetime });
}
