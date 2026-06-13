/** 일회성 — 아린 실제 끼니 패턴(슬롯별 메뉴·반복도·반찬 수) */
import { createClient } from '@supabase/supabase-js';
const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows, error } = await sb.from('meal_logs').select('*').eq('child_id', CID).order('log_date', { ascending: true }).limit(60);
if (error) { console.log('error:', error.message); process.exit(0); }
console.log('컬럼:', Object.keys(rows[0] || {}).join(', '));
console.log(`총 ${rows.length}건\n`);
// 날짜·슬롯별 나열
const fmt = (r) => {
  const menus = r.menus || r.menu || r.items || [];
  const ings = r.ingredients || [];
  const m = Array.isArray(menus) ? menus.join('/') : menus;
  return `${r.log_date} [${r.place || '집'}/${r.slot || r.meal_slot || r.meal_type || '?'}] ${m || '(메뉴없음)'}  ·재료:${ings.length}`;
};
for (const r of rows) console.log(fmt(r));
// 메뉴 반복도
const menuCount = {};
for (const r of rows) {
  const menus = r.menus || r.menu || r.items || [];
  const arr = Array.isArray(menus) ? menus : [menus];
  for (const m of arr) if (m) menuCount[m] = (menuCount[m] || 0) + 1;
}
const top = Object.entries(menuCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log('\n[메뉴 반복 TOP15]');
console.log(top.map(([m, c]) => `${m}×${c}`).join('  '));
// 끼니당 메뉴 수 (반찬 수 근사)
const counts = rows.map((r) => { const menus = r.menus || r.menu || r.items || []; return Array.isArray(menus) ? menus.length : (menus ? 1 : 0); });
const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
console.log(`\n끼니당 평균 메뉴 수: ${avg.toFixed(1)} (min ${Math.min(...counts)}, max ${Math.max(...counts)})`);
