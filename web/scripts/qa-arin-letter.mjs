/** 일회성 — 방금 생성된 아린 오늘 편지 + context(우리 판단 스냅샷) 출력해 P10 검증 */
import { createClient } from '@supabase/supabase-js';
const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const { data } = await sb.from('coach_letters').select('letter_date,letter,oneliner,context,source_hash').eq('child_id', CID).eq('letter_date', today).single();
console.log('=== 편지 (', data.letter_date, ') ===\n');
console.log(data.letter);
console.log('\n--- oneliner ---\n' + data.oneliner);
console.log('\n=== context (우리 판단) ===');
console.log(JSON.stringify(data.context, null, 1));
