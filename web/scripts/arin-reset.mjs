/**
 * 아린(43942d34) 재생성 리셋 — 1일차부터 깨끗이 다시 쓰기 위한 생성물 전량 삭제.
 *   삭제: coach_letters · weekly_plans · curriculum_progress · llm_usage · daily_questions
 *   보존: meal_logs(원천) · 부모 답변(daily_questions.answer) → /tmp/arin-answers.json 스냅샷 후 복원용
 * 실행: node --env-file=.env.local scripts/arin-reset.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1) 부모 답변 스냅샷(복원용 — 커리큘럼/ICFQ 신호 보존)
const { data: dq } = await sb.from('daily_questions').select('q_date,answer,context').eq('child_id', CID);
const answers = (dq || []).filter((r) => r.answer && String(r.answer).trim()).map((r) => ({ q_date: r.q_date, answer: r.answer, icfq: r.context?.icfq ?? null }));
writeFileSync('/tmp/arin-answers.json', JSON.stringify(answers, null, 2));
console.log(`답변 ${answers.length}개 스냅샷 → /tmp/arin-answers.json`);

// 2) 생성물 전량 삭제
for (const t of ['coach_letters', 'weekly_plans', 'curriculum_progress', 'llm_usage', 'daily_questions']) {
  const { error, count } = await sb.from(t).delete({ count: 'exact' }).eq('child_id', CID);
  if (error) { console.error(`${t} 삭제 실패:`, error.message); process.exit(1); }
  console.log(`${t}: ${count ?? '?'}행 삭제`);
}
console.log('\n리셋 완료 — 이제 arin-replay.sh로 1일차부터 순차 재생성.');
