/**
 * POST /api/eval/log
 *
 * daycare-eval 평가 결과를 daycare_eval_signals + daycare_recipe_hints에 누적 (ALG-EVAL-07)
 *
 * 호출: daycare-eval.html에서 평가 완료 시 fire-and-forget fetch
 * 익명 OK (anon key + RLS insert 정책)
 *
 * 입력:
 *   {
 *     menuText: string,         // 사용자 입력 (개인정보 X)
 *     ageBand: '3-4y'|'5y'|'6-7y'|'younger',
 *     extractedIngredients: [{name, matched, cookingMethod?, menuName?}],
 *     totalScore: number
 *   }
 *
 * 효과:
 *   - 식재료별 sighting_count + 1
 *   - 매칭된 식재료 → ingredient_id 채움 (필수/권장 등급 평가 데이터)
 *   - 미매칭 식재료 → normalized_name null (5회+ 시 enrich_queue로 자동 push, ALG-EVAL-07)
 *   - 메뉴-식재료 매핑 → daycare_recipe_hints (5회+ 시 ingredient_recipes 승급)
 */
import { NextResponse } from 'next/server';
import { createSupabaseServerAnon } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type ExtractedIng = {
  name: string;            // 메뉴에서 추출된 식재료명
  matched: boolean;        // 147 풀과 매칭 여부
  cookingMethod?: string;  // '국·탕'·'볶음·구이' 등
  menuName?: string;       // 등장한 메뉴명
};

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }); }

  const { ageBand, extractedIngredients, totalScore } = body as {
    ageBand: string;
    extractedIngredients: ExtractedIng[];
    totalScore: number;
  };

  if (!Array.isArray(extractedIngredients)) {
    return NextResponse.json({ ok: false, error: 'extractedIngredients required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerAnon();

  // 매칭된 식재료의 ingredient_id 미리 조회
  const matchedNames = extractedIngredients.filter((i) => i.matched).map((i) => i.name);
  let idMap = new Map<string, string>();
  if (matchedNames.length > 0) {
    const { data } = await supabase.from('ingredients')
      .select('id, name')
      .in('name', matchedNames);
    if (data) for (const r of data) idMap.set(r.name, r.id);
  }

  let signaled = 0, hinted = 0;

  for (const ing of extractedIngredients) {
    // 1. 빈도 시그널 누적 (upsert)
    const ingredientId = idMap.get(ing.name) || null;
    const { data: existing } = await supabase.from('daycare_eval_signals')
      .select('id, sighting_count')
      .eq('ingredient_name', ing.name)
      .maybeSingle();

    if (existing) {
      await supabase.from('daycare_eval_signals').update({
        sighting_count: (existing.sighting_count ?? 0) + 1,
        last_seen_at: new Date().toISOString(),
        ingredient_id: ingredientId,
        normalized_name: ing.matched ? ing.name : null,
        age_band: ageBand,
        cooking_method: ing.cookingMethod ?? null,
      }).eq('id', existing.id);
    } else {
      await supabase.from('daycare_eval_signals').insert({
        ingredient_name: ing.name,
        normalized_name: ing.matched ? ing.name : null,
        ingredient_id: ingredientId,
        age_band: ageBand,
        cooking_method: ing.cookingMethod ?? null,
      });
    }
    signaled++;

    // 2. 메뉴-식재료 매핑 (매칭된 식재료 + 메뉴명 있을 때만)
    if (ingredientId && ing.menuName) {
      const { data: hint } = await supabase.from('daycare_recipe_hints')
        .select('id, sighting_count')
        .eq('ingredient_id', ingredientId)
        .eq('menu_name', ing.menuName)
        .maybeSingle();
      if (hint) {
        await supabase.from('daycare_recipe_hints').update({
          sighting_count: (hint.sighting_count ?? 0) + 1,
          last_seen_at: new Date().toISOString(),
        }).eq('id', hint.id);
      } else {
        await supabase.from('daycare_recipe_hints').insert({
          ingredient_id: ingredientId,
          menu_name: ing.menuName,
          cooking_method: ing.cookingMethod ?? null,
          age_band: ageBand,
        });
      }
      hinted++;
    }
  }

  return NextResponse.json({
    ok: true,
    signaled, hinted, totalScore,
    note: 'daycare_eval_signals + daycare_recipe_hints 누적 완료',
  });
}
