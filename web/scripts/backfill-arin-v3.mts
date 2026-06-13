/**
 * scripts/backfill-arin-v3.mts — 아린 편지 역사 v3 재작성 (이사님 지시 2026-06-13)
 * npx tsx --env-file=.env.local scripts/backfill-arin-v3.mts [--dry]
 *
 * 첫 기록일(5/26) 다음 날부터 오늘(6/13)까지를 '그날의 크론'처럼 v3로 재생성해 coach_letters를 덮어쓴다
 * (각 날짜는 그날 '이전' 데이터만 봄 — 미래 누수 0). 최종 진도(curriculum_progress)와 이번 주 닻 goals도 영속
 * → 내일 새벽 카나리아 크론이 정확히 이어서 쓴다. LLM 0콜·결정론(재실행 동일).
 */
import { createClient } from '@supabase/supabase-js';
import { runV3FamilyFull } from '../lib/replayRunner';
import { replayMetrics, cutoverGate } from '../lib/replayMetrics';
import type { CRow } from '../lib/curriculumUnits';

const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const TODAY = '2026-06-13';
const DRY = process.argv.includes('--dry');
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data: kid } = await sb.from('children').select('parent_id,nickname,daycare').eq('id', CID).single();
const { data: rows } = await sb.from('meal_logs')
  .select('log_date,slot,menus,refused,note,environment,place,ate_well,autonomy,texture,meal_time')
  .eq('child_id', CID).lte('log_date', TODAY).order('log_date');
const { data: anchor } = await sb.from('weekly_plans').select('week_key,mission_target,goals').eq('child_id', CID).order('week_key', { ascending: false }).limit(1).maybeSingle();

const first = rows![0].log_date;
const days = Math.round((Date.parse(TODAY) - Date.parse(first)) / 86400000);   // 첫날 다음 날 ~ 오늘
console.log(`아린: 기록 ${rows!.length}행(${first}~) · 편지 ${days}통(${new Date(Date.parse(TODAY) - (days - 1) * 86400000).toISOString().slice(0, 10)}~${TODAY}) · 타깃=${anchor?.mission_target}`);

const r = runV3FamilyFull(
  { id: CID, name: kid!.nickname, attendsDaycare: !!kid!.daycare, base: TODAY, rows: rows as unknown as CRow[] },
  { days, firstLogDate: first, foodTarget: anchor?.mission_target ?? null },
);

for (let i = 0; i < r.days.length; i++) {
  const d = r.days[i];
  console.log(`\n── ${d.date} [${d.decision?.unit}·${d.decision?.step}단·${d.decision?.mode}]${d.fallback ? ' ⚠️FALLBACK' : ''}`);
  console.log(`   ${d.letter}`);
}
const m = replayMetrics(r.days);
const gate = cutoverGate(m);
console.log('\n지표:', JSON.stringify(m));
console.log('게이트:', gate.length ? '❌ ' + gate.join(' | ') : '✅ 전부 통과');
console.log('최종 goals:', JSON.stringify(r.goals));
console.log('최종 진도:', Object.values(r.progress).map((p) => `${p!.unit_id}=${p!.status}/${p!.step}`).join(' '));

if (DRY) { console.log('\n(dry-run — DB 미반영)'); process.exit(0); }
if (gate.length) { console.error('게이트 미달 — 중단'); process.exit(1); }

// 1) 편지 upsert(역사 덮어쓰기 — 이사님 지시)
for (let i = 0; i < r.days.length; i++) {
  const d = r.days[i];
  const ctx = { ...r.ctxs[i], source: 'backfill(v3)' };
  const { error } = await sb.from('coach_letters').upsert({
    child_id: CID, parent_id: kid!.parent_id, letter_date: d.date,
    letter: d.letter, oneliner: d.oneliner || null,
    source_hash: `v3-backfill|${d.date}`, context: ctx,
  }, { onConflict: 'child_id,letter_date' });
  if (error) { console.error(d.date, error.message); process.exit(1); }
}
console.log(`\n편지 ${r.days.length}통 upsert 완료`);

// 2) 최종 진도 영속(내일 크론이 이어받음)
const progRows = Object.values(r.progress).map((p) => ({ ...p!, updated_at: new Date().toISOString() }));
if (progRows.length) {
  const { error } = await sb.from('curriculum_progress').upsert(progRows, { onConflict: 'child_id,unit_id' });
  if (error) { console.error('진도', error.message); process.exit(1); }
  console.log(`진도 ${progRows.length}행 upsert 완료`);
}

// 3) 이번 주 닻 goals 영속(focus 연속성)
if (anchor?.week_key && r.goals.length) {
  const { error } = await sb.from('weekly_plans').update({ goals: r.goals, updated_at: new Date().toISOString() }).eq('child_id', CID).eq('week_key', anchor.week_key);
  if (error) console.warn('닻 goals', error.message);
  else console.log(`닻 ${anchor.week_key} goals 갱신`);
}
console.log('\n백필 완료 — 어드민: https://app.mealfred.com/admin/' + CID);
