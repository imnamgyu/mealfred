/**
 * POST /api/community/post — 도감 노하우 글 작성.
 * body: { body, ingredient?(프리필 식재료), child_id?, traits?, method_type?, difficulty?, time_min? }
 * - 한 줄 노하우 검증(길이) → 매핑엔진 scanIngredients로 식재료 자동 태깅(+프리필) → 위험 키워드 안내
 * - community_posts insert(RLS: 본인 것만) → 첫 글이면 +500P(award_community_first_post RPC, 멱등)
 * parent_id는 서버 세션 user.id 고정(위조 불가).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { scanIngredients } from '@/lib/menuMap';
import { validateBody, dangerWarnings, MAX_BODY } from '@/lib/community';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const b = await req.json();
    const body = String(b.body || '').trim().slice(0, MAX_BODY);
    const v = validateBody(body);
    if (!v.ok) return NextResponse.json({ ok: false, error: v.reason }, { status: 400 });

    // 식재료 자동 태깅: 매핑엔진이 본문에서 식재료를 추출 + 도감에서 들어온 프리필을 항상 포함(칩 0개 방지)
    const tagged = new Set<string>();
    for (const ing of scanIngredients(body)) tagged.add(ing);
    if (b.ingredient && typeof b.ingredient === 'string') tagged.add(b.ingredient);
    // 클라가 직접 고른 식재료(폴백)도 허용
    if (Array.isArray(b.ingredients)) for (const ing of b.ingredients) if (typeof ing === 'string') tagged.add(ing);
    const ingredients = [...tagged].slice(0, 8);
    if (!ingredients.length) {
      return NextResponse.json({ ok: false, error: '어떤 식재료에 대한 노하우인지 알려주세요(도감에서 작성하면 자동 연결돼요).' }, { status: 400 });
    }

    // 작성 주체 자녀(소유 검증) → age_band 스냅샷
    let child_id: string | null = null, age_band: string | null = null;
    if (b.child_id) {
      const { data: child } = await supabase.from('children').select('id,age_band').eq('id', b.child_id).eq('parent_id', user.id).maybeSingle();
      if (child) { child_id = child.id; age_band = (child as { age_band?: string }).age_band ?? null; }
    }

    const meta = user.user_metadata as Record<string, unknown> | null;
    const author_nick = (meta?.name || meta?.nickname || meta?.full_name || null) as string | null;
    const traits = Array.isArray(b.traits) ? (b.traits as string[]).filter((x) => typeof x === 'string').slice(0, 4) : [];

    const { data: post, error } = await supabase.from('community_posts').insert({
      parent_id: user.id, child_id, author_nick, ingredients, body, age_band, traits,
      method_type: typeof b.method_type === 'string' ? b.method_type : null,
      difficulty: typeof b.difficulty === 'string' ? b.difficulty : null,
      time_min: Number.isFinite(b.time_min) ? Math.max(0, Math.round(b.time_min)) : null,
      status: 'public',
    }).select('id,ingredients,created_at').single();
    if (error) {
      console.error('[community/post]', error.message);
      return NextResponse.json({ ok: false, error: '저장에 실패했어요. 잠시 후 다시 시도해주세요.' }, { status: 200 });
    }

    // 첫 글 +500(멱등) — 항상 호출해도 1회만 지급
    let firstBonus = 0;
    try {
      const admin = createSupabaseAdmin();
      const { data: bonus } = await admin.rpc('award_community_first_post', { p_parent: user.id });
      firstBonus = bonus ?? 0;
    } catch (e) { console.error('[community/post] bonus', e instanceof Error ? e.message : e); }

    return NextResponse.json({ ok: true, post, warnings: dangerWarnings(body), firstBonus });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 200 });
  }
}
