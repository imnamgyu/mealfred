/** 일회성 — menus는 있는데 ingredients가 빈 meal_logs 행 통계(최근 60일) */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const nDaysAgo = (n) => new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
const { data, error } = await sb.from('meal_logs')
  .select('id,child_id,log_date,slot,place,source,menus,ingredients')
  .gte('log_date', nDaysAgo(60));
if (error) { console.error(error); process.exit(1); }
const hasMenu = (r) => (r.menus?.length ?? 0) > 0;
const empty = data.filter((r) => hasMenu(r) && (r.ingredients?.length ?? 0) === 0);
console.log(`최근 60일 메뉴기록 행: ${data.filter(hasMenu).length} / 그 중 ingredients 빈 행: ${empty.length}`);
const menuFreq = {};
for (const r of empty) for (const m of (r.menus || [])) { const k = m.replace(/\s/g, ''); menuFreq[k] = (menuFreq[k] || 0) + 1; }
console.log('\n빈 행의 메뉴(빈도순):');
Object.entries(menuFreq).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([m, c]) => console.log(`  ${c}× ${m}`));
console.log('\n샘플 빈 행 10개:');
empty.slice(0, 10).forEach((r) => console.log(`  ${r.log_date} ${r.slot} [${r.place || '?'}]${r.source ? '/' + r.source : ''} menus=${JSON.stringify(r.menus)}`));
