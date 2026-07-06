/**
 * import-recipes.mjs — 레시피 1k 빌드 산출물을 recipes/recipe_ingredients에 적재.
 * 선행: sql/2026-07-06_recipes.sql DDL 적용 (Supabase 대시보드).
 * 입력: 편식극복키트/01_참고자료/B_레시피DB/빌드_레시피1k_2026-07-06/recipes-build-v1.json
 *   (build 파이프라인 산출물 — 표준레시피 매칭 + nong_foods 나트륨 역산 + AI 생성분 병합본)
 * 실행: node scripts/import-recipes.mjs [json경로]
 * 멱등: recipes는 (menu_norm, age_band) upsert, 재료는 recipe_id별 delete→insert.
 */
import fs from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(WEB, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const INPUT = process.argv[2] || '/Users/ing/Desktop/편식극복키트/01_참고자료/B_레시피DB/빌드_레시피1k_2026-07-06/recipes-build-v1.json';
const rows = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
console.log(`입력 ${rows.length}건 (${INPUT})`);

let ok = 0, fail = 0;
for (let i = 0; i < rows.length; i += 50) {
  const batch = rows.slice(i, i + 50);
  const recipePayload = batch.map(({ ingredients, ...r }) => r);
  const res = await fetch(`${URL_}/rest/v1/recipes?on_conflict=menu_norm,age_band`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(recipePayload),
  });
  if (!res.ok) { console.error(`recipes 배치 ${i} 실패:`, res.status, (await res.text()).slice(0, 300)); fail += batch.length; continue; }
  const saved = await res.json();
  const idByKey = Object.fromEntries(saved.map(r => [`${r.menu_norm}|${r.age_band}`, r.id]));

  const ingRows = [];
  for (const r of batch) {
    const rid = idByKey[`${r.menu_norm}|${r.age_band}`];
    if (!rid) { console.error(`id 누락: ${r.menu_norm}/${r.age_band}`); fail++; continue; }
    await fetch(`${URL_}/rest/v1/recipe_ingredients?recipe_id=eq.${rid}`, { method: 'DELETE', headers: H });
    for (const ing of r.ingredients || []) ingRows.push({ ...ing, recipe_id: rid });
    ok++;
  }
  for (let j = 0; j < ingRows.length; j += 500) {
    const rr = await fetch(`${URL_}/rest/v1/recipe_ingredients`, { method: 'POST', headers: H, body: JSON.stringify(ingRows.slice(j, j + 500)) });
    if (!rr.ok) console.error('재료 배치 실패:', rr.status, (await rr.text()).slice(0, 300));
  }
  if ((i / 50) % 4 === 0) console.log(`  ${Math.min(i + 50, rows.length)}/${rows.length}…`);
}

const cnt = await fetch(`${URL_}/rest/v1/recipes?select=id&limit=1`, { headers: { ...H, Prefer: 'count=exact' } });
console.log(`\n완료: 적재 ${ok} · 실패 ${fail} · DB recipes 총 ${cnt.headers.get('content-range')?.split('/')[1]}건`);
