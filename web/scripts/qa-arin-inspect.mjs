/**
 * 일회성 QA — 아린의 최근 7일 식단을 집/기관(place)으로 갈라 보여준다.
 * P10(집/기관 칭찬 분리) 편지 검증의 입력 사실을 눈으로 확인하기 위함.
 * 실행: cd web && node --env-file=.env.local scripts/qa-arin-inspect.mjs
 */
import { createClient } from '@supabase/supabase-js';

const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstNDaysAgo = (n) => new Date(Date.now() + 9 * 3600 * 1000 - n * 86400 * 1000).toISOString().slice(0, 10);

const { data: kid } = await sb.from('children').select('id,nickname,age_band,daycare,sex').eq('id', CID).single();
console.log('아이:', kid);

const { data: rows, error } = await sb.from('meal_logs')
  .select('log_date,slot,place,ingredients,menus,refused,ate_well,note')
  .eq('child_id', CID).gte('log_date', kstNDaysAgo(6)).order('log_date', { ascending: true });
if (error) { console.error(error); process.exit(1); }

console.log(`\n최근 7일(${kstNDaysAgo(6)}~${kstToday()}) 기록 ${rows.length}건:`);
for (const r of rows) {
  console.log(`  ${r.log_date} ${r.slot || '?'} [${r.place || '미상'}] menus=${JSON.stringify(r.menus)} ings=${JSON.stringify(r.ingredients)} ${r.ate_well === false ? '거부' : r.ate_well === true ? '잘먹음' : ''} ${r.refused ? 'refused:' + r.refused : ''} ${r.note ? 'note:' + r.note : ''}`);
}

const home = rows.filter((r) => r.place !== 'daycare');
const daycare = rows.filter((r) => r.place === 'daycare');
console.log(`\n집 끼니: ${home.length}건 / 기관 끼니: ${daycare.length}건`);
const days = new Set(rows.map((r) => r.log_date));
console.log(`기록된 날: ${days.size}일 (활성 기준 ≥3)`);

const { data: lastL } = await sb.from('coach_letters').select('letter_date,letter,oneliner,source_hash').eq('child_id', CID).order('letter_date', { ascending: false }).limit(3);
console.log('\n최근 편지:', JSON.stringify(lastL, null, 1));
