/**
 * rls-audit.mjs — RLS 격리 회귀 감사 (결제 전·새 테이블 추가 후 돌려보기).
 *
 * 무엇을 검사하나:
 *   1) ⚠️ 키 위생: NEXT_PUBLIC_SUPABASE_ANON_KEY 가 sb_secret_/service 키면 즉시 경고
 *      (NEXT_PUBLIC_ 은 브라우저 번들에 박힘 → secret 키면 RLS 우회·전체 DB 노출).
 *   2) 🔒 격리: '미인증 유저키(anon/publishable)'로 각 사용자 테이블을 조회 → 0행이어야 정상.
 *      행이 보이면 RLS off/permissive = 누수.
 *
 * 실행: cd web && node scripts/rls-audit.mjs   (.env.local 의 URL·anon·service 키 사용)
 * 주의: 읽기 전용. 데이터 변경 없음.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = {};
readFileSync(join(__dir, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
});
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;

// 사용자 데이터(반드시 격리) vs 참조 데이터(공개 가능)
const USER_TABLES = [
  'children', 'meal_logs', 'growth_logs', 'coach_letters', 'daily_questions',
  'user_menu_overrides', 'point_ledger', 'point_balance', 'app_subscriptions',
  'app_referrals', 'app_referral_visits', 'period_summaries', 'kakao_messages',
  'ocr_logs', 'eval_results', 'enrich_queue', 'cron_runs',
];

const tag = (k) => (k?.startsWith('sb_secret_') ? 'SECRET(service)' : k?.startsWith('sb_publishable_') ? 'publishable(anon)' : k?.startsWith('eyJ') ? 'legacy-JWT' : '알수없음');

console.log('URL  :', URL);
console.log('ANON :', tag(ANON), '|', (ANON || '').slice(0, 18) + '…');
if (ANON?.startsWith('sb_secret_') || ANON === SVC) {
  console.log('\n🚨🚨 치명: NEXT_PUBLIC_SUPABASE_ANON_KEY 가 SECRET 키입니다 — 브라우저에 노출되면 RLS 우회·전체 DB 노출!');
  console.log('   → Supabase Settings→API의 publishable(anon) 키로 교체하세요(.env.local + Vercel env).\n');
}

const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const svc = createClient(URL, SVC, { auth: { persistSession: false } });

const leaks = [];
console.log('\nTABLE'.padEnd(23), '| 미인증 조회 | svc행 | 판정');
console.log('-'.repeat(60));
for (const t of USER_TABLES) {
  let a = '?', s = '?';
  try { const { data, error, count } = await anon.from(t).select('*', { count: 'exact' }).limit(1); a = error ? 'ERR' : (count ?? (data?.length ?? 0)); } catch { a = 'EX'; }
  try { const { count, error } = await svc.from(t).select('*', { count: 'exact', head: true }); s = error ? '—' : count; } catch { s = '—'; }
  let v = '✅ 격리';
  if (s === '—') v = '(테이블 없음)';
  else if (typeof a === 'number' && a > 0) { v = '🚨 누수 ' + a + '행'; leaks.push(t); }
  console.log(t.padEnd(23), '|', String(a).padStart(10), '|', String(s).padStart(5), '|', v);
}
console.log('\n' + (leaks.length ? `🚨 누수 테이블: ${leaks.join(', ')}` : '✅ 모든 사용자 테이블 격리됨(미인증 0행).'));
process.exit(leaks.length ? 1 : 0);
