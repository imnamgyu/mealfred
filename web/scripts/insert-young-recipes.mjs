// 직접 작성한 영유아 레시피 데이터(young-recipes-data.mjs)를 ingredient_recipes 에 삽입.
// LLM API 미사용 — supabase 삽입만. 배치 추가형(같은 식재료 재실행 시 해당 AI템플릿만 교체).
//   cd web && node --env-file=.env.local scripts/insert-young-recipes.mjs [--dry]
import { createClient } from '@supabase/supabase-js';
import { RECIPES as B1 } from './young-recipes-data.mjs';
import { RECIPES as B2 } from './young-recipes-data-2.mjs';
import { RECIPES as B3 } from './young-recipes-data-3.mjs';
const RECIPES = [...B1, ...B2, ...B3];

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SOURCE = 'AI 생성(영유아 템플릿)';
const DRY = process.argv.includes('--dry');

async function main() {
  const { data: ings, error } = await supabase.from('ingredients').select('id,name');
  if (error) { console.error('ingredients 조회 실패:', error.message); process.exit(1); }
  const idByName = Object.fromEntries(ings.map((i) => [i.name, i.id]));

  const rows = []; const missing = new Set();
  for (const r of RECIPES) {
    const ingId = idByName[r.ing];
    if (!ingId) { missing.add(r.ing); continue; }
    for (const [age, p] of Object.entries(r.ages)) {
      rows.push({
        ingredient_id: ingId, recipe_name: r.name, age_band: age,
        cooking_method: r.method, allergens: (r.allergens || []).join(','),
        is_top_pick: true, source: SOURCE,
        detail: { ingredients: r.ings, steps: r.steps, texture: p.texture, tip: p.tip, time_min: p.time, nutri_point: r.nutri },
      });
    }
  }
  console.log(`레시피 항목 ${RECIPES.length} → 행 ${rows.length}${DRY ? ' (DRY)' : ''}`);
  if (missing.size) console.log('⚠️ ingredients 테이블에 없는 식재료(스킵):', [...missing].join(', '));
  if (DRY) { console.log(JSON.stringify(rows.slice(0, 2), null, 2)); return; }

  // 데이터 파일이 단일 진실원 — 기존 AI 영유아 템플릿 전체 삭제 후 전량 재삽입(재실행 안전)
  const { error: delErr } = await supabase.from('ingredient_recipes').delete().eq('source', SOURCE);
  console.log(delErr ? `기존 정리 실패: ${delErr.message}` : '기존 AI 영유아 템플릿 전체 정리(재구축)');
  const { error: insErr } = await supabase.from('ingredient_recipes').insert(rows);
  console.log(insErr ? `삽입 실패: ${insErr.message}` : `✅ ${rows.length}행 삽입 완료`);
}
main();
