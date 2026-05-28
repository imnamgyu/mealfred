import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface RecipeDetail {
  ingredients?: string[];
  steps?: string[];
  texture?: string;
  tip?: string;
  time_min?: number;
  nutri_point?: string;
}
export interface PlanRecipe {
  ingredient: string;
  recipe_name: string;
  cooking_method: string;
  allergens: string;
  detail: RecipeDetail;
}
export interface PlanDay { day: number; recipes: PlanRecipe[]; }
export interface MealPlan { days: PlanDay[]; covered: string[]; missing: string[]; ageBand: string; }

interface RecipeRow {
  ingredient_id: string;
  recipe_name: string;
  cooking_method: string | null;
  allergens: string | null;
  detail: RecipeDetail | null;
  is_top_pick: boolean | null;
}

const AGE_LABEL: Record<string, string> = { younger: '만 1-2세', '3-4y': '만 3-4세', '5y': '만 5세', '6-7y': '만 6-7세' };
export function ageLabel(code: string): string { return AGE_LABEL[code] || code; }

// 안 먹는 식재료 + 아이 연령 → 영유아 레시피 템플릿으로 3일 예시 식단을 결정적으로 조립 (LLM 미사용)
export async function composePlan(ings: string[], ageBand: string): Promise<MealPlan> {
  const cleaned = [...new Set(ings.map((s) => s.trim()).filter(Boolean))].slice(0, 12);
  if (!cleaned.length) return { days: [], covered: [], missing: [], ageBand };

  const { data: ingRows } = await supabase.from('ingredients').select('id,name').in('name', cleaned);
  const rows = ingRows || [];
  const ids = rows.map((r) => r.id);
  if (!ids.length) return { days: [], covered: [], missing: cleaned, ageBand };

  const { data: recsData } = await supabase
    .from('ingredient_recipes')
    .select('ingredient_id,recipe_name,cooking_method,allergens,detail,is_top_pick')
    .in('ingredient_id', ids)
    .eq('age_band', ageBand)
    .not('detail', 'is', null)
    .order('is_top_pick', { ascending: false });
  const recs = (recsData || []) as RecipeRow[];

  // 식재료별 대표 레시피 1개 (top pick 우선)
  const byIng = new Map<string, RecipeRow>();
  for (const r of recs) if (!byIng.has(r.ingredient_id)) byIng.set(r.ingredient_id, r);

  const picked: PlanRecipe[] = [];
  const covered: string[] = [];
  const missing: string[] = [];
  for (const r of rows) {
    const rec = byIng.get(r.id);
    if (rec) {
      picked.push({ ingredient: r.name, recipe_name: rec.recipe_name, cooking_method: rec.cooking_method || '', allergens: rec.allergens || '', detail: rec.detail || {} });
      covered.push(r.name);
    } else {
      missing.push(r.name);
    }
  }
  // 입력에는 있으나 ingredients 테이블에 없던 것도 missing
  for (const n of cleaned) if (!rows.find((r) => r.name === n)) missing.push(n);

  // 3일에 라운드로빈 분배 (하루 2~3개)
  const buckets: PlanRecipe[][] = [[], [], []];
  picked.slice(0, 9).forEach((rec, i) => buckets[i % 3].push(rec));
  const days: PlanDay[] = buckets.filter((b) => b.length).map((recipes, idx) => ({ day: idx + 1, recipes }));

  return { days, covered, missing: [...new Set(missing)], ageBand };
}
