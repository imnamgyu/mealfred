/**
 * 레시피 API.
 * POST /api/community/recipe — 레시피 작성(버튼 조립). 첫 레시피 +500P(멱등).
 *   body: { dish, tip?, photo_url?, steps:[{ing,verb,time?,memo?}], child_id?, traits?, difficulty? }
 *   ingredients = 스텝 식재료 distinct(도감 표준명) → 도감 §6 연동 키. parent_id는 세션 고정(위조 불가).
 * GET  /api/community/recipe?ing=식재료&sort=new|hot&limit=20 — 목록(공개글). 로그인 시 내 반응 머지.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { matsFromSteps, RECIPE_LIST_COLS, type RecipeStep } from '@/lib/recipe';
import { ageBandLabel } from '@/lib/community';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const b = await req.json();
    const dish = String(b.dish || '').trim().slice(0, 60);
    if (dish.length < 2) return NextResponse.json({ ok: false, error: '음식 이름을 적어주세요.' }, { status: 400 });

    // 스텝 검증 — {ing, verb} 필수
    const rawSteps = Array.isArray(b.steps) ? b.steps : [];
    const steps: RecipeStep[] = rawSteps
      .filter((s: unknown): s is RecipeStep => !!s && typeof (s as RecipeStep).ing === 'string' && typeof (s as RecipeStep).verb === 'string')
      .slice(0, 12)
      .map((s: RecipeStep) => ({
        ing: s.ing.trim().slice(0, 20), verb: s.verb.trim().slice(0, 20),
        time: s.time ? String(s.time).slice(0, 10) : undefined,
        memo: s.memo ? String(s.memo).trim().slice(0, 40) : undefined,
      }));
    if (!steps.length) return NextResponse.json({ ok: false, error: '조리 순서를 한 단계 이상 만들어주세요.' }, { status: 400 });

    const ingredients = matsFromSteps(steps).slice(0, 10);
    if (b.ingredient && typeof b.ingredient === 'string' && !ingredients.includes(b.ingredient)) ingredients.unshift(b.ingredient);

    // 자녀 소유 검증 → age_band 스냅샷
    let child_id: string | null = null, age_band: string | null = null;
    if (b.child_id) {
      const { data: child } = await supabase.from('children').select('id,age_band').eq('id', b.child_id).eq('parent_id', user.id).maybeSingle();
      if (child) { child_id = child.id; age_band = (child as { age_band?: string }).age_band ?? null; }
    }

    const meta = user.user_metadata as Record<string, unknown> | null;
    const author_nick = (meta?.name || meta?.nickname || meta?.full_name || null) as string | null;
    const traits = Array.isArray(b.traits) ? (b.traits as string[]).filter((x) => typeof x === 'string').slice(0, 4) : [];

    let photo_url: string | null = null;
    if (typeof b.photo_url === 'string' && b.photo_url.includes('/community/') && b.photo_url.includes(`/${user.id}/`)) {
      photo_url = b.photo_url.slice(0, 500);
    }

    const { data: recipe, error } = await supabase.from('community_recipes').insert({
      parent_id: user.id, child_id, author_nick, dish, tip: typeof b.tip === 'string' ? b.tip.trim().slice(0, 200) : null,
      photo_url, ingredients, steps, age_band, traits,
      difficulty: typeof b.difficulty === 'string' ? b.difficulty : null,
      time_min: Number.isFinite(b.time_min) ? Math.max(0, Math.round(b.time_min)) : null,
      status: 'public',
    }).select('id,ingredients').single();
    if (error) {
      console.error('[community/recipe]', error.message);
      return NextResponse.json({ ok: false, error: '저장에 실패했어요. 잠시 후 다시 시도해주세요.' }, { status: 200 });
    }

    // 첫 레시피 +500P(멱등 — earn_bonus 고정 키)
    let firstBonus = 0;
    try {
      const admin = createSupabaseAdmin();
      const { data: earned } = await admin.rpc('earn_bonus', {
        p_parent: user.id, p_child: child_id, p_key: `community_first_recipe:${user.id}`,
        p_amount: 500, p_kind: 'community_first_recipe', p_meta: { reason: '첫 레시피' },
      });
      firstBonus = earned ?? 0;
    } catch (e) { console.error('[community/recipe] bonus', e instanceof Error ? e.message : e); }

    return NextResponse.json({ ok: true, recipe, firstBonus });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 200 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const sp = req.nextUrl.searchParams;
    const ing = sp.get('ing');
    const sort = sp.get('sort') === 'hot' ? 'hot' : 'new';
    const limit = Math.min(40, Math.max(1, parseInt(sp.get('limit') || '20', 10)));
    const { data: { user } } = await supabase.auth.getUser();

    let q = supabase.from('community_recipes').select(RECIPE_LIST_COLS).eq('status', 'public');
    if (ing) q = q.contains('ingredients', [ing]);
    q = sort === 'hot'
      ? q.order('like_count', { ascending: false }).order('tried_count', { ascending: false }).order('created_at', { ascending: false })
      : q.order('created_at', { ascending: false });
    const { data: rows, error } = await q.limit(limit);
    if (error) return NextResponse.json({ ok: true, recipes: [], degraded: true });

    const recipes = (rows || []).map((r) => ({ ...r, child_age_label: r.age_band ? ageBandLabel(r.age_band) : null }));
    if (user && recipes.length) {
      const ids = recipes.map((r) => r.id);
      const { data: reacts } = await supabase.from('recipe_reactions').select('recipe_id,kind').eq('user_id', user.id).in('recipe_id', ids);
      const liked = new Set((reacts || []).filter((r) => r.kind === 'like').map((r) => r.recipe_id));
      const tried = new Set((reacts || []).filter((r) => r.kind === 'tried').map((r) => r.recipe_id));
      for (const r of recipes as Array<Record<string, unknown> & { id: string }>) { r.liked_by_me = liked.has(r.id); r.tried_by_me = tried.has(r.id); }
    }
    return NextResponse.json({ ok: true, recipes });
  } catch (e) {
    return NextResponse.json({ ok: true, recipes: [], error: e instanceof Error ? e.message : 'error' });
  }
}
