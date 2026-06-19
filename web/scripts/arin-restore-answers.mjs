/**
 * 재생성 후 부모 답변 복원 — arin-reset.mjs가 /tmp/arin-answers.json에 스냅샷한 답변을
 * 재생성된 daily_questions 행(같은 q_date)에 다시 적재(커리큘럼/ICFQ 신호 보존).
 * 실행: node --env-file=.env.local scripts/arin-restore-answers.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let answers = [];
try { answers = JSON.parse(readFileSync('/tmp/arin-answers.json', 'utf8')); } catch { console.log('스냅샷 없음 — 복원 생략'); process.exit(0); }

let n = 0;
for (const a of answers) {
  const { data: row } = await sb.from('daily_questions').select('context').eq('child_id', CID).eq('q_date', a.q_date).maybeSingle();
  if (!row) { console.log(`  ${a.q_date}: 재생성 질문 없음(스킵)`); continue; }
  const { error } = await sb.from('daily_questions').update({ answer: a.answer }).eq('child_id', CID).eq('q_date', a.q_date);
  if (!error) { n++; console.log(`  ${a.q_date} → ${a.answer} 복원`); }
}
console.log(`답변 ${n}개 복원 완료.`);
