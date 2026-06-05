/**
 * POST /api/community/recipe/react — 레시피 좋아요/해봤어요 토글(포인트 X, 선정 신호).
 * body: { recipe_id, kind: 'like'|'tried', on: boolean }. 본인 글 차단. 트리거가 카운트 동기화.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { recipe_id, kind, on } = await req.json();
    if (!recipe_id || (kind !== 'like' && kind !== 'tried')) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });

    const { data: recipe } = await supabase.from('community_recipes').select('parent_id').eq('id', recipe_id).maybeSingle();
    if (!recipe) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    if (recipe.parent_id === user.id) return NextResponse.json({ ok: false, error: '본인 레시피에는 반응할 수 없어요.' }, { status: 200 });

    if (on) {
      await supabase.from('recipe_reactions').upsert({ recipe_id, user_id: user.id, kind }, { onConflict: 'recipe_id,user_id,kind', ignoreDuplicates: true });
    } else {
      await supabase.from('recipe_reactions').delete().eq('recipe_id', recipe_id).eq('user_id', user.id).eq('kind', kind);
    }
    return NextResponse.json({ ok: true, on: !!on });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 200 });
  }
}
