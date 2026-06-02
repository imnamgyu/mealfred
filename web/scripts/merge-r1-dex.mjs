/**
 * merge-r1-dex.mjs — 도감 신규 38종 R1 보강 결과를 도감 자산에 병합.
 * 입력: /tmp/r1_records.json (워크플로 wdzeeo404 출력)
 * 병합: enriched pool · ingredients-light · ingredient-season · food-graph(bridge) · must-eat
 *       + NUTRI_MAP 삽입 텍스트를 /tmp/nutri_map_insert.txt 로 출력(→ nutrition.ts 수동 Edit)
 * cooking-amounts는 cookingGuide 카테고리 폴백이라 스킵.
 */
import fs from 'node:fs';

const recs = JSON.parse(fs.readFileSync('/tmp/r1_records.json', 'utf8'));
const ROOT = '/Users/ing/Desktop/dev/web/landing_page/deploy';
const WEB = ROOT + '/web';

// 영양소 라벨(에이전트) → 고정 nutri 키
const NK = [
  [/에너지|열량|칼로리/, 'energy_kcal'], [/수분/, 'water_g'], [/단백질/, 'protein_g'],
  [/지방/, 'fat_g'], [/탄수화물/, 'carb_g'], [/^당|당류/, 'sugar_g'], [/식이섬유|^섬유/, 'fiber_g'],
  [/칼슘/, 'calcium_mg'], [/철/, 'iron_mg'], [/마그네슘/, 'magnesium_mg'], [/^인$|^인\(/, 'phosphorus_mg'],
  [/칼륨/, 'potassium_mg'], [/나트륨/, 'sodium_mg'], [/아연/, 'zinc_mg'], [/셀레늄/, 'selenium_ug'],
  [/비타민\s*A|베타카로틴/, 'vitA_ug'], [/비타민\s*B12/, 'vitB12_ug'], [/비타민\s*C/, 'vitC_mg'], [/비타민\s*D/, 'vitD_ug'],
];
function toNutri(arr) {
  const o = {};
  for (const it of arr || []) {
    const hit = NK.find(([re]) => re.test(it.nutrient));
    if (hit && o[hit[1]] === undefined) o[hit[1]] = it.value;
  }
  return o;
}
const STAR = { 자주: '⭐⭐⭐', 가끔: '⭐⭐', 드물게: '⭐' };

// 파일 로드
const pool = JSON.parse(fs.readFileSync(ROOT + '/data_ingredient_pool_enriched.json', 'utf8'));
const light = JSON.parse(fs.readFileSync(WEB + '/public/ingredients-light.json', 'utf8'));
const season = JSON.parse(fs.readFileSync(WEB + '/lib/ingredient-season.json', 'utf8'));
const graph = JSON.parse(fs.readFileSync(WEB + '/lib/food-graph.json', 'utf8'));
const mustEat = JSON.parse(fs.readFileSync(WEB + '/lib/must-eat.json', 'utf8'));

const poolNames = new Set(pool.pool.map((p) => p.nm));
const lightNames = new Set(light.ingredients.map((x) => x.nm));
const allNames = new Set([...poolNames, ...recs.map((r) => r.nm)]);
const nodes = new Set(graph.nodes || []);
const nutriMapLines = [];
let added = 0, bridgesAdded = 0, bridgesDropped = 0;

for (const r of recs) {
  if (poolNames.has(r.nm)) { console.log('skip(중복):', r.nm); continue; }
  added++;
  const me = r.must_eat ? { must_eat: true, must_eat_tier: r.must_eat_tier === 'none' ? 'good' : r.must_eat_tier, must_eat_nutrient: r.must_eat_nutrient || '', must_eat_reason: r.must_eat_reason || '' } : { must_eat: false };

  // enriched pool
  pool.pool.push({
    nm: r.nm, em: r.em || '', cat: r.cat, count: 0, elem_count: 0, infant_count: 0, v4_freq_total: 0,
    source: 'LLM 추정(농진청 기준)', nutri: toNutri(r.nutri_100g),
    ...me, grade: STAR[r.grade] || '⭐', grade_label: r.grade, grade_reason: r.grade_reason || '',
  });
  // light
  if (!lightNames.has(r.nm)) light.ingredients.push({ nm: r.nm, cat: r.cat, em: r.em || '', grade: r.grade, grade_reason: r.grade_reason || '', ...me });
  // season
  season.season[r.nm] = (r.season_months && r.season_months.length) ? [...new Set(r.season_months)].sort((a, b) => a - b) : null;
  // NUTRI_MAP (라벨 3~5개, μ 등 표준화)
  const labels = (r.nutri_labels || []).slice(0, 5);
  if (labels.length) nutriMapLines.push(`  '${r.nm}': [${labels.map((l) => `'${l.replace(/'/g, '')}'`).join(', ')}],`);
  // 💎 must-eat.json
  if (r.must_eat) mustEat[r.nm] = { tier: r.must_eat_tier === 'none' ? 'good' : r.must_eat_tier, nutrient: r.must_eat_nutrient || '', reason: r.must_eat_reason || '' };
  // food-graph nodes + bridges
  nodes.add(r.nm);
  for (const b of (r.bridges || [])) {
    if (!allNames.has(b)) { bridgesDropped++; continue; }
    const exists = graph.edges.some((e) => (e.a === r.nm && e.b === b) || (e.a === b && e.b === r.nm));
    if (exists) continue;
    graph.edges.push({ a: r.nm, b, kind: 'bridge', strength: 3, basis: '맛·식감이 닮은 사촌' });
    nodes.add(b); bridgesAdded++;
  }
}
graph.nodes = [...nodes];
if (graph.meta) graph.meta.bridges = graph.edges.filter((e) => e.kind === 'bridge').length;

// 쓰기
fs.writeFileSync(ROOT + '/data_ingredient_pool_enriched.json', JSON.stringify(pool));
fs.writeFileSync(WEB + '/public/ingredients-light.json', JSON.stringify(light));
fs.writeFileSync(WEB + '/lib/ingredient-season.json', JSON.stringify(season));
fs.writeFileSync(WEB + '/lib/food-graph.json', JSON.stringify(graph));
fs.writeFileSync(WEB + '/lib/must-eat.json', JSON.stringify(mustEat));
fs.writeFileSync('/tmp/nutri_map_insert.txt', nutriMapLines.join('\n'));

console.log(`\n✅ 병합 — 신규 ${added}종 · 사촌 +${bridgesAdded}(드롭 ${bridgesDropped}) · 💎 ${recs.filter((r) => r.must_eat).length}`);
console.log(`   pool ${pool.pool.length} · light ${light.ingredients.length} · graph nodes ${graph.nodes.length} bridges ${graph.meta?.bridges}`);
console.log(`   NUTRI_MAP 삽입 ${nutriMapLines.length}줄 → /tmp/nutri_map_insert.txt (nutrition.ts에 Edit 필요)`);
