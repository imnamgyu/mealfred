/** 일회성 — learned_menus·points SQL 실행 확인 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const t of ['learned_menus', 'point_ledger', 'point_balance']) {
  const r = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log(`[${t}]`, r.error ? '❌ ' + r.error.message : `✅ 존재 (${r.count}행)`);
}
// learn_menu RPC 테스트(insert → 확인 → 삭제)
const r1 = await sb.rpc('learn_menu', { p_menu: '__qa_test__', p_ings: ['쌀'], p_processed: false, p_source: 'qa' });
console.log('[learn_menu RPC]', r1.error ? '❌ ' + r1.error.message : '✅ OK');
const chk = await sb.from('learned_menus').select('menu,ingredients,hits').eq('menu', '__qa_test__').maybeSingle();
console.log('  → 학습 확인:', chk.data ? JSON.stringify(chk.data) : '없음');
await sb.from('learned_menus').delete().eq('menu', '__qa_test__');
// earn_meal_point RPC 존재 확인(가짜 uuid → FK 에러여도 함수 존재 의미)
const r2 = await sb.rpc('earn_meal_point', { p_parent: '00000000-0000-0000-0000-000000000000', p_child: '00000000-0000-0000-0000-000000000000', p_date: '2026-05-31', p_slot: '__qa__', p_amount: 50 });
console.log('[earn_meal_point RPC]', r2.error ? (r2.error.message.includes('foreign key') || r2.error.message.includes('violates') ? '✅ 함수 존재(FK 에러는 정상 — 가짜 uuid)' : '❌ ' + r2.error.message) : `✅ OK (적립 ${r2.data})`);
