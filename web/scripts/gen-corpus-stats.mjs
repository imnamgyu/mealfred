/**
 * gen-corpus-stats.mjs — learned_menus 코퍼스 구성 통계.
 * 음식(distinct 메뉴) / 식재료(distinct) 분리 + 32 음식형태별 개수.
 * 분류기 = gen-kit-matrix.py ARCH 포팅(매트릭스와 동일 기준).
 * 출력 → web/lib/corpus-stats.json (어드민 매트릭스 표가 읽음).
 * 실행: node --env-file=.env.local scripts/gen-corpus-stats.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 32 음식형태 — (label, [표면형 키워드], emoji). 위→아래 우선(구체→일반).
const ARCH = [
  ['볶음밥', ['볶음밥'], '🍚'], ['비빔밥', ['비빔밥'], '🍚'], ['주먹밥', ['주먹밥'], '🍙'],
  ['김밥', ['김밥'], '🍙'], ['덮밥', ['덮밥', '국밥'], '🍚'], ['카레', ['카레'], '🍛'],
  ['죽·미음', ['죽', '미음', '리조또', '오트밀'], '🥣'],
  ['미역국', ['미역국'], '🍲'], ['김치찌개', ['김치찌개'], '🍲'],
  ['된장국·찌개', ['된장국', '된장찌개', '청국장', '강된장'], '🍲'], ['순두부', ['순두부'], '🍲'],
  ['계란찜', ['계란찜', '달걀찜', '알찜'], '🥚'], ['계란말이', ['계란말이', '달걀말이'], '🥚'],
  ['국', ['국'], '🍲'], ['찌개·전골', ['찌개', '전골'], '🍲'], ['탕', ['탕'], '🍲'],
  ['찜', ['찜'], '♨️'], ['조림', ['조림'], '🥘'], ['볶음', ['볶음'], '🍳'],
  ['무침·나물', ['무침', '나물', '생채', '겉절이'], '🥗'], ['전·부침', ['전', '부침', '부각', '적'], '🟤'],
  ['구이', ['구이'], '🔥'], ['잡채', ['잡채'], '🍜'],
  ['국수·면', ['국수', '파스타', '스파게티', '우동', '수제비', '라면', '쌀국수'], '🍜'],
  ['떡', ['떡국', '떡볶이', '떡'], '🍡'], ['만두', ['만두'], '🥟'],
  ['샐러드', ['샐러드'], '🥗'],
  ['빵·토스트', ['토스트', '샌드위치', '베이글', '머핀', '핫케이크', '팬케이크', '파이', '와플'], '🍞'],
  ['그라탕·수프', ['그라탕', '수프', '스프', '도리아', '리조또'], '🧀'],
  ['음료·스무디', ['스무디', '쉐이크', '주스', '라떼', '에이드'], '🥤'],
  ['요거트·간식', ['요거트', '푸딩', '젤리', '요거트볼'], '🍮'], ['쌈', ['쌈'], '🥬'],
];

const clean = (name) => (name || '').trim().replace(/^\([^)]*\)/, '').replace(/\([^)]*\)$/, '').replace(/\s/g, '');
const archetypeOf = (name) => {
  const n = clean(name);
  for (const [label, keys] of ARCH) for (const k of keys) if (n.includes(k)) return label;
  return null;
};

// learned_menus 전량 페이지네이션
let rows = [], from = 0;
for (;;) {
  const r = await sb.from('learned_menus').select('menu,ingredients').range(from, from + 999);
  if (r.error) { console.error('❌', r.error.message); process.exit(1); }
  rows = rows.concat(r.data);
  if (r.data.length < 1000) break;
  from += 1000;
}

const formN = Object.fromEntries(ARCH.map(([l]) => [l, 0]));
const ingSet = new Set();
let unclassified = 0;
for (const row of rows) {
  const a = archetypeOf(row.menu);
  if (a) formN[a]++; else unclassified++;
  (row.ingredients || []).forEach((i) => ingSet.add(i));
}

const forms = ARCH.map(([key, , em]) => ({ key, em, n: formN[key] })).sort((a, b) => b.n - a.n);
const out = {
  learned_menus: rows.length,        // 음식(distinct 메뉴)
  learned_ingredients: ingSet.size,  // 식재료(distinct)
  forms,                              // 32 형태별 개수(내림차순)
  unclassified,                       // 32 형태에 안 걸린 메뉴(단품·비표준 형태)
  classified: rows.length - unclassified,
  generated_at: '2026-06-02',
};
fs.writeFileSync('lib/corpus-stats.json', JSON.stringify(out));
console.log(`✅ 음식(메뉴) ${out.learned_menus} · 식재료 ${out.learned_ingredients}종`);
console.log(`   형태분류 ${out.classified} · 미분류 ${unclassified} (${(unclassified / rows.length * 100).toFixed(0)}%)`);
console.log('   상위 형태:', forms.slice(0, 8).map((f) => `${f.key} ${f.n}`).join(' · '));
