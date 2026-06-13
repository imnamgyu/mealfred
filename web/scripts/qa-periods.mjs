/** 일회성 — 아린 period_summaries에 주/월/분기/반기/연이 적재됐는지 검증 */
import { createClient } from '@supabase/supabase-js';
const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('period_summaries').select('period_type,period_key,metrics,updated_at').eq('child_id', CID).order('period_key', { ascending: false });
const byType = {};
for (const p of data || []) (byType[p.period_type] ||= []).push(p);
for (const t of ['year', 'half', 'quarter', 'month', 'week']) {
  const rows = byType[t] || [];
  console.log(`\n[${t}] ${rows.length}개`);
  rows.slice(0, 3).forEach((p) => console.log(`  ${p.period_key}: ${JSON.stringify(p.metrics)}`));
}
