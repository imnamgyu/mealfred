/**
 * 식재료 영양 데이터 무결성 감사 — /foods 상세에 쓰는 enriched 풀의 농진청 매핑 점검.
 * 식재료명(nm) ↔ 매핑된 농진청 식품명(nong_name)이 어긋난 항목(예: 아몬드→"아몬드 음료")을 찾는다.
 * 실행: cd web && node scripts/nutri-data-audit.ts
 */
import fs from 'fs';

type Row = { nm: string; cat: string; nong_name?: string; nutri?: Record<string, number> };
const raw = JSON.parse(fs.readFileSync('../data_ingredient_pool_enriched.json', 'utf-8'));
const pool: Row[] = Array.isArray(raw) ? raw : (raw.ingredients || Object.values(raw).find(Array.isArray) as Row[]);

// 가공·다른형태 의심 키워드 (원물이 아닌 매핑일 가능성)
const PROCESSED = /음료|주스|가공|통조림|튀김|조림|볶음|구이|찜|말랭이|분말|가루|시럽|페이스트|소스|젓|장아찌|절임|건조|환|차$|즙/;
// 카테고리별 '물이 이렇게 많을 리 없다' 상한 (원물 기준)
const DRY_CATS: Record<string, number> = { '견과_씨앗': 20, '곡물_탄수': 50, '고기': 80, '생선': 85 };

const flags: { nm: string; nong: string; why: string; kcal?: number; water?: number; protein?: number }[] = [];
let withData = 0;
for (const p of pool) {
  const nong = p.nong_name || '';
  const n = p.nutri || {};
  if (Object.keys(n).length) withData++;
  const reasons: string[] = [];
  // 1) 매핑명에 가공/다른형태 키워드
  if (PROCESSED.test(nong)) reasons.push(`가공형태 매핑("${nong}")`);
  // 2) nm이 nong에 안 들어감 = 다른 식품 매핑 의심
  else if (nong && !nong.replace(/\s/g, '').includes(p.nm.replace(/\s/g, '')) && !p.nm.replace(/\s/g, '').includes(nong.replace(/\s/g, ''))) {
    reasons.push(`이름 불일치(nm≠"${nong}")`);
  }
  // 3) 건조성 카테고리인데 수분 과다 = 다른 식품(묽은 것) 매핑 의심
  const wmax = DRY_CATS[p.cat];
  if (wmax && typeof n.water_g === 'number' && n.water_g > wmax) reasons.push(`수분 과다 ${n.water_g}g(${p.cat})`);
  if (reasons.length) flags.push({ nm: p.nm, nong, why: reasons.join(' · '), kcal: n.energy_kcal, water: n.water_g, protein: n.protein_g });
}

console.log(`\n===== 영양 데이터 무결성 감사 =====`);
console.log(`풀 ${pool.length} · nutri 데이터 있음 ${withData} · ⚠️ 의심 ${flags.length}\n`);
for (const f of flags) {
  console.log(`⚠️ ${f.nm}  →  "${f.nong}"`);
  console.log(`    ${f.why}  [kcal ${f.kcal} · 물 ${f.water}g · 단백 ${f.protein}g]`);
}
console.log(`\n→ 위 항목들은 농진청 매핑이 원물과 다를 가능성. 정확한 원물 식품코드로 재매핑 필요.`);
