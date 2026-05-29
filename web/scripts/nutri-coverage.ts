/**
 * NUTRI_MAP 커버리지 감사 — /mealfred-food-mapping 스킬용.
 * 풀 147개 중 정확한 영양 매핑(NUTRI_MAP)이 없는 식재료를 카테고리별로 나열.
 * 각 항목에 CATEGORY_NUTRI 시드(빗대기 근사값)를 함께 보여줘 등재 출발점으로 쓴다.
 *
 * 실행: cd web && node scripts/nutri-coverage.ts
 */
import fs from 'fs';
import { NUTRI_MAP, CATEGORY_NUTRI } from '../lib/nutrition.ts';
import { canon } from '../lib/menuMapCore.ts';

const pool = JSON.parse(fs.readFileSync('./public/ingredients-light.json', 'utf-8')).ingredients as { nm: string; cat: string }[];

const missingByCat: Record<string, { nm: string; seed: string[] }[]> = {};
let have = 0, miss = 0;
for (const p of pool) {
  const name = canon(p.nm) || p.nm;                 // 표준명 기준
  if (NUTRI_MAP[name] || NUTRI_MAP[p.nm]) { have++; continue; }
  miss++;
  (missingByCat[p.cat] ||= []).push({ nm: p.nm, seed: CATEGORY_NUTRI[p.cat] || [] });
}

console.log(`\n===== NUTRI_MAP 커버리지 =====`);
console.log(`풀 ${pool.length} · 매핑 있음 ${have} · 없음 ${miss} (커버리지 ${Math.round(have / pool.length * 100)}%)\n`);
console.log(`── 미등재 (카테고리별 · 시드=CATEGORY_NUTRI 근사) ──`);
for (const [cat, items] of Object.entries(missingByCat).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n[${cat}] 시드: ${(CATEGORY_NUTRI[cat] || []).join(',') || '(없음)'}`);
  console.log('  ' + items.map((x) => x.nm).join(', '));
}
console.log(`\n→ 스킬: 위 식재료를 NUTRI_MAP에 정확값으로 등재(시드 출발 + 검수). 등재할수록 런타임 안전망은 거의 안 쓰임.`);
