#!/usr/bin/env node
/**
 * 147 식재료 + 식재료별 Top 5 레시피 → Supabase ingredients/ingredient_recipes 시드 스크립트
 *
 * 실행:
 *   cd deploy
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed-ingredients.mjs
 *
 * 또는 web/.env.local 로드:
 *   cd web && node --env-file=.env.local ../supabase/seed-ingredients.mjs
 *
 * 멱등성 — slug 기준 upsert. 여러 번 실행해도 안전.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ 환경변수 누락: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ━━━ 데이터 로드 ━━━
const here = path.dirname(new URL(import.meta.url).pathname);
const enrichedPath = path.join(here, '..', 'data_ingredient_pool_enriched.json');
const recipesPath = path.join(here, '..', 'data_recipes_by_ingredient.json');

const enriched = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8'));
const recipesByIng = JSON.parse(fs.readFileSync(recipesPath, 'utf-8')).by_ingredient;

const CAT_TO_FOOD_GROUP = {
  '곡류': 'grain', '면류': 'grain',
  '뿌리채소': 'vitaminA', '잎채소': 'vitaminA',
  '열매채소': 'other', '기타채소': 'other', '십자화과': 'other',
  '버섯': 'other', '해조류': 'other',
  '콩제품': 'legume', '콩가공': 'legume',
  '고기': 'meat', '생선': 'meat', '해산물': 'meat',
  '계란': 'egg', '알류': 'egg',
  '유제품': 'dairy',
  '과일': 'fruit',
};

console.log(`📦 시드 시작: ${enriched.pool.length} 식재료`);

// ━━━ ingredients upsert ━━━
let ok = 0, fail = 0;
const ingredientIds = new Map();  // nm → uuid

for (const p of enriched.pool) {
  const row = {
    slug: p.nm,
    name: p.nm,
    emoji: p.em || '',
    category: p.cat || null,
    food_group: CAT_TO_FOOD_GROUP[p.cat] || 'other',
    grade_label: p.grade_label || '',
    grade_star: p.grade || '',
    v4_grade: p.v4_grade || null,
    v4_score: p.v4_score || null,
    v4_freq_total: p.v4_freq_total || null,
    v4_reason: p.v4_reason || null,
    elem_count: p.elem_count || 0,
    infant_count: p.infant_count || 0,
    nutri_per_100g: p.nutri || null,
    nong_name: p.nong_name || null,
    warning: p.warning || null,
    mercury: p.mercury || null,
    source: '농진청 v10.4',
    status: 'verified',
    enriched_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('ingredients').upsert(row, { onConflict: 'slug' }).select('id').single();
  if (error) { console.warn(`  ⚠ ${p.nm}:`, error.message); fail++; continue; }
  ingredientIds.set(p.nm, data.id);
  ok++;
}
console.log(`✅ ingredients: ${ok} 성공 · ${fail} 실패`);

// ━━━ ingredient_recipes upsert ━━━
let rOk = 0, rFail = 0;
for (const [nm, r] of Object.entries(recipesByIng)) {
  const ingId = ingredientIds.get(nm);
  if (!ingId) continue;
  // 기존 레시피 삭제 후 재삽입 (멱등)
  await supabase.from('ingredient_recipes').delete().eq('ingredient_id', ingId).eq('is_top_pick', true);
  for (let i = 0; i < r.top_recipes.length; i++) {
    const t = r.top_recipes[i];
    const { error } = await supabase.from('ingredient_recipes').insert({
      ingredient_id: ingId,
      recipe_name: t.name,
      age_band: t.age || null,
      cooking_method: t.method || null,
      allergens: t.allergens || null,
      is_top_pick: true,
      rank_in_ingredient: i + 1,
      source: '4,432 레시피 DB',
    });
    if (error) { rFail++; } else { rOk++; }
  }
}
console.log(`✅ ingredient_recipes: ${rOk} 성공 · ${rFail} 실패`);

// ━━━ 분포 확인 ━━━
const { data: dist } = await supabase.from('ingredients').select('grade_label', { count: 'exact' });
const groups = {};
for (const x of dist || []) groups[x.grade_label || '(라벨X)'] = (groups[x.grade_label || '(라벨X)'] || 0) + 1;
console.log('\n📊 등급 분포:', groups);
console.log('\n🎉 시드 완료');
