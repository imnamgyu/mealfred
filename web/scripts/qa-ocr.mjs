import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('ocr_logs').select('*').eq('id', 'd8edcb6d-89ef-4d54-ac96-62de7f9970fc').maybeSingle();
console.log('조회 error:', error?.message || 'none');
console.log('row:', JSON.stringify(data, null, 1));
// 최근 ocr_logs 5개 상태
const { data: recent } = await sb.from('ocr_logs').select('id,created_at,status,error,is_menu').order('created_at', { ascending: false }).limit(5);
console.log('\n최근 5건:', JSON.stringify(recent, null, 1));
