/** 일회성 — 골고루 키트 구성 입력: 아린이 먹은/안 먹은 식재료, 식품군 분포, 등급별 미노출 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows } = await sb.from('meal_logs').select('ingredients,menus,ate_well,refused,place,log_date').eq('child_id', CID);
const freq = {}; const refused = new Set(); const placeOf = {};
for (const r of rows || []) {
  for (const i of r.ingredients || []) { freq[i] = (freq[i] || 0) + 1; placeOf[i] = placeOf[i] || r.place || '집'; }
  if (r.refused) refused.add(r.refused);
}
const eaten = new Set(Object.keys(freq));
console.log(`총 기록 ${rows?.length}끼니 · 먹어본 식재료 ${eaten.size}종 · 거부: ${[...refused].join(',') || '없음'}`);

// pool 등급
const pool = JSON.parse(fs.readFileSync('public/ingredients-light.json', 'utf8')).ingredients;
const byGrade = { 필수: [], 권장: [], 향신료: [] };
for (const p of pool) (byGrade[p.grade] ||= []).push(p);
console.log(`\npool: 필수 ${byGrade['필수']?.length} · 권장 ${byGrade['권장']?.length} · 향신료 ${byGrade['향신료']?.length}`);

// 안 먹어본 필수/권장 (식품군별)
for (const g of ['필수', '권장']) {
  const notEaten = (byGrade[g] || []).filter((p) => !eaten.has(p.nm));
  const byCat = {};
  for (const p of notEaten) (byCat[p.cat] ||= []).push(p.nm);
  console.log(`\n=== 안 먹어본 ${g} (${notEaten.length}종) ===`);
  for (const [cat, arr] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  [${cat}] ${arr.slice(0, 14).join(', ')}${arr.length > 14 ? ` …+${arr.length - 14}` : ''}`);
  }
}

// 먹어본 것 식품군 분포
const eatenByCat = {};
for (const nm of eaten) { const p = pool.find((x) => x.nm === nm); const c = p?.cat || '기타'; (eatenByCat[c] ||= []).push(nm); }
console.log('\n=== 먹어본 식재료 식품군 분포 ===');
for (const [cat, arr] of Object.entries(eatenByCat).sort((a, b) => b[1].length - a[1].length)) console.log(`  [${cat}] ${arr.length}종: ${arr.join(', ')}`);
