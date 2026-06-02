/**
 * merge-r2-kit.mjs — R2(키트 매트릭스 채점) 결과를 kit-dish-matrix.json에 병합 + kit-guide.json 재생성.
 * 사용: node scripts/merge-r2-kit.mjs <R2_output_file>
 *   records: [{ nm, scores: { dish: score } }]
 */
import fs from 'node:fs';

const outFile = process.argv[2];
if (!outFile) { console.error('R2 output 파일 경로 필요'); process.exit(1); }
const recs = JSON.parse(fs.readFileSync(outFile, 'utf8')).result.records;
const WEB = '/Users/ing/Desktop/dev/web/landing_page/deploy/web';

const kit = JSON.parse(fs.readFileSync(WEB + '/lib/kit-dish-matrix.json', 'utf8'));
const dishKeys = new Set(kit.dishes.map((d) => d.key));
const emOf = Object.fromEntries(kit.dishes.map((d) => [d.key, d.em]));
const ingSet = new Set(kit.ingredients);
kit.scores = kit.scores || {};

let addedIng = 0, cells = 0, badDish = new Set();
for (const r of recs) {
  if (!ingSet.has(r.nm)) { kit.ingredients.push(r.nm); ingSet.add(r.nm); addedIng++; }
  for (const [dish, sc] of Object.entries(r.scores || {})) {
    if (!dishKeys.has(dish)) { badDish.add(dish); continue; }
    const v = Math.max(0, Math.min(3, Math.round(Number(sc) || 0)));
    if (v >= 1) { (kit.scores[dish] ||= {})[r.nm] = v; }
  }
}
// 전체 점수셀 재계산
for (const d of Object.keys(kit.scores)) cells += Object.keys(kit.scores[d]).length;
kit.meta.scored_cells = cells;
kit.meta.candidate_ingredients = kit.ingredients.length;
kit.meta.r2_added = addedIng;
kit.meta.scored_at = '2026-06-02';
fs.writeFileSync(WEB + '/lib/kit-dish-matrix.json', JSON.stringify(kit));

// kit-guide.json 재생성 — 식재료별 점수≥2 음식 상위6
const guide = {};
for (const ing of kit.ingredients) {
  const rows = [];
  for (const [dish, scores] of Object.entries(kit.scores)) {
    const s = scores[ing];
    if (s >= 2) rows.push({ d: dish, em: emOf[dish] || '🍽', s });
  }
  rows.sort((a, b) => b.s - a.s);
  if (rows.length) guide[ing] = rows.slice(0, 6);
}
fs.writeFileSync(WEB + '/public/kit-guide.json', JSON.stringify(guide));

console.log(`✅ R2 병합 — 후보 식재료 +${addedIng}(총 ${kit.ingredients.length}) · 점수셀 ${cells} · kit-guide ${Object.keys(guide).length}종`);
if (badDish.size) console.log('  알 수 없는 음식키(스킵):', [...badDish].join(','));
// 신규 38 중 가이드 생긴/없는
const newNm = recs.map((r) => r.nm);
const withGuide = newNm.filter((n) => guide[n]);
console.log(`  신규 38 중 가이드 있음 ${withGuide.length}: ${withGuide.slice(0, 12).map((n) => n + '→' + guide[n].map((x) => x.d).slice(0, 3).join('/')).join(' · ')}`);
