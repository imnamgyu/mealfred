/**
 * scripts/capture-fixture.mjs — 실데이터 fixture 캡처 (WBS I-04 — 사고 박제 절차 I-07의 도구)
 * node --env-file=.env.local scripts/capture-fixture.mjs <child_id> <from> <to> [별칭]
 * → tests/fixtures/real-<별칭>.json (meal_logs 전 컬럼·자녀 메타 — 개인정보는 닉네임뿐)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const [cid, from, to, alias = 'arin'] = process.argv.slice(2);
if (!cid || !from || !to) { console.error('usage: capture-fixture.mjs <child_id> <from> <to> [alias]'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: kid } = await sb.from('children').select('id,nickname,age_band,daycare').eq('id', cid).single();
const { data: rows, error } = await sb.from('meal_logs')
  .select('log_date,slot,menus,ingredients,refused,note,environment,place,ate_well,autonomy,texture,meal_time')
  .eq('child_id', cid).gte('log_date', from).lte('log_date', to).order('log_date');
if (error) { console.error(error); process.exit(1); }
const out = {
  id: alias, name: kid?.nickname || alias, attendsDaycare: !!kid?.daycare, base: to,
  captured: { from, to }, rows,
};
fs.writeFileSync(`tests/fixtures/real-${alias}.json`, JSON.stringify(out, null, 1));
console.log(`OK ${rows.length}행 → tests/fixtures/real-${alias}.json (base=${to})`);
