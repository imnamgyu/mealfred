/**
 * 일회성(이사님 지시 2026-06-15) — 아린(43942d34) 편지를 '정본(현재) 엔진' 단일 편지로 환원.
 * coach_letters.context 에서 실험용 altLetter(Letter B·새 설계)를 제거 → 앱이 A/B 비교카드 대신
 * 단일 정본 편지(Letter A = v2 메인 = 현재 라이브 엔진)를 그린다. 메인 letter 본문은 손대지 않음.
 *
 * 실행: node --env-file=.env.local scripts/arin-decompare.mjs        (DRY: --dry)
 * ⚠️ 이건 '오늘까지 저장된 편지'의 표시만 고친다. 내일 새벽 크론이 다시 A/B를 붙이지 않게 하려면
 *    Vercel env 에서 COACH_COMPARE_CHILDREN·COACH_V3_CHILDREN 에서 아린 id 제거가 필요(이사님).
 */
import { createClient } from '@supabase/supabase-js';

const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const DRY = process.argv.includes('--dry');
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 표시창(최근 3일)을 포함해 잔여 실험 흔적을 넉넉히 제거 — altLetter 키가 있는 모든 최근 편지.
const { data, error } = await sb.from('coach_letters')
  .select('letter_date,context').eq('child_id', CID).order('letter_date', { ascending: false }).limit(20);
if (error) { console.error(error); process.exit(1); }

let changed = 0;
for (const row of (data || [])) {
  const ctx = row.context || {};
  if (!('altLetter' in ctx)) { continue; }
  const next = { ...ctx };
  delete next.altLetter;             // Letter B(새 설계) 제거 → 단일 카드
  next.compare = false;              // 명시적으로 비교모드 해제
  next.source = (ctx.source || 'cron') + '|decompare';
  console.log(`${row.letter_date}: altLetter 제거 (남은 keys ${Object.keys(next).length})`);
  if (!DRY) {
    const { error: e } = await sb.from('coach_letters').update({ context: next }).eq('child_id', CID).eq('letter_date', row.letter_date);
    if (e) { console.error(row.letter_date, e.message); process.exit(1); }
  }
  changed++;
}
console.log(`\n${DRY ? '(dry) ' : ''}altLetter 제거 ${changed}통 — 아린은 이제 단일 정본 편지만 표시됩니다.`);
console.log('남은 작업(이사님): Vercel env에서 COACH_COMPARE_CHILDREN·COACH_V3_CHILDREN의 아린 id 제거 → 내일 크론부터 A/B 미부착.');
