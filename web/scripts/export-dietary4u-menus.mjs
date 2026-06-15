/**
 * scripts/export-dietary4u-menus.mjs — dietary4u(영유아 표준식단) 메뉴별 식재료 집합 export.
 *   learned_menus(source='dietary4u')의 ingredients 배열(메뉴=한 끼 요리, 같은 요리에 함께 들어간 식재료)을
 *   레시피 동시출현과 같은 축으로 gen-food-graph.py에 공급한다(푸드체이닝 소스 추가·데이터 세션 핸드오프).
 *   tray 패턴과 동일: export → /tmp → gen-food-graph.py가 있으면 읽고 없으면 graceful skip.
 *
 * 실행: node --env-file=.env.local scripts/export-dietary4u-menus.mjs
 * 출력: /tmp/dietary4u-menus.json  { meta:{menus,multi}, menus:[["당근","밀","양파","옥수수"], ...] }
 *   ※ 이름은 raw(예 "토마토 소스") — gen-food-graph.py norm()이 도감 매핑·양념/과일 필터를 적용한다.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const OUT = '/tmp/dietary4u-menus.json';

const menus = [];
const PAGE = 1000;
for (let from = 0; ; from += PAGE) {
  const { data, error } = await sb.from('learned_menus')
    .select('menu,ingredients').eq('source', 'dietary4u')
    .order('menu', { ascending: true }).range(from, from + PAGE - 1);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data || !data.length) break;
  for (const r of data) {
    const ings = (r.ingredients || []).filter((x) => typeof x === 'string' && x.trim());
    if (ings.length >= 2) menus.push(ings);   // 동시출현은 2재료+ 메뉴만
  }
  if (data.length < PAGE) break;
}

writeFileSync(OUT, JSON.stringify({ meta: { menus: menus.length, source: 'dietary4u', generated: 'learned_menus' }, menus }), 'utf8');
console.log(`dietary4u 메뉴 ${menus.length}건(≥2재료) → ${OUT}`);
console.log('샘플:', JSON.stringify(menus.slice(0, 5)));
