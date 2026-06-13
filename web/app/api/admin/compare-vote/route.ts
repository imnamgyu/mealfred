/**
 * POST /api/admin/compare-vote — 어드민(이사님)의 A/B 변형별 비교 평가. @mealfred.com 관리자만.
 *
 * body: { child_id, letter_date, variant: 'A'|'B', rating: 'up'|'down'|'repeat' }
 *
 * compare_votes는 RLS가 parent_id=auth.uid()(부모 소유)로 잠겨 있어, 어드민(부모 아님)은 클라 직접 쓰기 불가.
 *   → 이 서버 라우트가 isAdmin 게이트 후 service_role로 upsert(RLS 우회). NOT NULL parent_id는 자녀 실소유 부모로 채운다.
 * onConflict (child_id,letter_date,variant) — 같은 날 변형별 1표 덮어쓰기.
 *
 * (Next 라우트 규약: node_modules/next/dist/docs/01-app/.../route.md — Web Request/Response 핸들러.)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';

const RATINGS = new Set(['up', 'down', 'repeat']);
const VARIANTS = new Set(['A', 'B']);

export async function POST(req: NextRequest) {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  let b: { child_id?: string; letter_date?: string; variant?: string; rating?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const child_id = typeof b.child_id === 'string' ? b.child_id : '';
  const letter_date = typeof b.letter_date === 'string' ? b.letter_date : '';
  const variant = typeof b.variant === 'string' ? b.variant : '';
  const rating = typeof b.rating === 'string' ? b.rating : '';
  if (!child_id || !/^\d{4}-\d{2}-\d{2}$/.test(letter_date) || !VARIANTS.has(variant) || !RATINGS.has(rating)) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  // NOT NULL parent_id 충족 — 자녀 실소유 부모로 채운다(투표 주체는 어드민이지만 행 소유는 부모 RLS와 일관).
  const { data: child } = await admin.from('children').select('parent_id').eq('id', child_id).maybeSingle();
  if (!child) return NextResponse.json({ ok: false, error: 'child_not_found' }, { status: 404 });

  const { error } = await admin.from('compare_votes').upsert(
    { child_id, parent_id: (child as { parent_id: string }).parent_id, letter_date, variant, rating },
    { onConflict: 'child_id,letter_date,variant' },
  );
  // 테이블 미생성 등 graceful — status 200으로 에러 메시지만(UI는 실패해도 안 터짐).
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  return NextResponse.json({ ok: true, variant, rating });
}
