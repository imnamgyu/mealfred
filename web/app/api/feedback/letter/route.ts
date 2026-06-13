/**
 * POST /api/feedback/letter — 부모 편지 1탭 피드백 서버 라우트(옵션 채널·G-07).
 *
 * body: { child_id, letter_date, rating: 'up'|'down'|'repeat', variant?: 'A'|'B' }
 *
 * 부모는 홈에서 '메인 편지(=A)'만 본다 → variant 기본 'A'. (향후 B 노출 실험 시 variant='B' 기록 대비 변수화.)
 * client RLS upsert(app/page.tsx)와 공존하는 서버 검증 채널 — 인증·소유·화이트리스트를 서버에서 강하게 막는다.
 *   variant='A' → letter_feedback(메인 편지, unique child_id+letter_date) upsert.
 *   variant='B' → compare_votes(변형별, unique child_id+letter_date+variant) upsert.
 * anon 클라이언트라 RLS(parent_id=auth.uid)로 본인 행만 — service_role 우회 아님.
 *
 * (Next 라우트 규약: node_modules/next/dist/docs/01-app/.../route.md — Web Request/Response 핸들러.)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

const RATINGS = new Set(['up', 'down', 'repeat']);
const VARIANTS = new Set(['A', 'B']);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let b: { child_id?: string; letter_date?: string; rating?: string; variant?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const child_id = typeof b.child_id === 'string' ? b.child_id : '';
  const letter_date = typeof b.letter_date === 'string' ? b.letter_date : '';
  const rating = typeof b.rating === 'string' ? b.rating : '';
  const variant = typeof b.variant === 'string' && b.variant ? b.variant : 'A'; // 부모는 A만 봄(기본)
  if (!child_id || !/^\d{4}-\d{2}-\d{2}$/.test(letter_date) || !RATINGS.has(rating) || !VARIANTS.has(variant)) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  // 본인 자녀 소유 확인(RLS와 별개로 명시 403). anon 클라라 어차피 RLS로 타인 행 차단되지만 명확한 응답을 준다.
  const { data: child } = await supabase.from('children').select('id').eq('id', child_id).eq('parent_id', user.id).maybeSingle();
  if (!child) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const { error } = variant === 'A'
    ? await supabase.from('letter_feedback').upsert(
        { child_id, parent_id: user.id, letter_date, rating },
        { onConflict: 'child_id,letter_date' },
      )
    : await supabase.from('compare_votes').upsert(
        { child_id, parent_id: user.id, letter_date, variant, rating },
        { onConflict: 'child_id,letter_date,variant' },
      );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 }); // graceful(테이블 미적용 등)
  return NextResponse.json({ ok: true, rating, variant });
}
