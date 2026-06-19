/**
 * P0-D 졸업 데모 — 아린이 '환경 프로브에 매일 식탁에서 화면 없이 답한다'고 가정하고 1일차부터 인터리브 재생성.
 *   각 날 D: ① GET /api/cron/coach?child&force&date=D (질문·편지·advanceProgress 생성)
 *           ② 그날 질문이 환경/구조 유닛 프로브(unitProbe 존재)면 그 유닛의 '양성' 칩으로 answer 채움
 *              → 다음날 advanceProgress가 어제 답을 신호로 읽어 envTablePct 등 표본 축적.
 *   끝나면 curriculum_progress를 찍어 table-stage가 1단→2단 졸업했는지 확인(P0-D가 닫힌 루프임을 증명).
 * 전제: npm run dev(localhost:3000). 실행: node --env-file=.env.local scripts/arin-sim-graduate.mjs [시작] [끝]
 * ⚠️ 아린(테스트 픽스처) 전용 시뮬 — 답을 채우므로 이후 일반 재생성 전 arin-reset 권장.
 */
import { createClient } from '@supabase/supabase-js';

const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const BASE = process.env.REPLAY_BASE || 'http://localhost:3000';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const start = process.argv[2] || '2026-05-27';
const end = process.argv[3] || '2026-06-19';

// 유닛별 '양성 신호' 칩(프로브 1차 = passWhen 신호) — 부모가 '잘 하고 있다'고 답한 시뮬레이션
const POSITIVE = {
  'table-stage': '식탁에서 화면 없이',
  'autonomy-part': '스스로 먹었어요',
  'sensory-texture': '잘 먹었어요',
  'hunger-rhythm': '끼니 직전엔 안 줬어요',
  'parent-model': '같이 먹었어요',
  'no-bargain': '거래 없이 차렸어요',
  'pressure-off': '편안했어요',
};

const dates = [];
for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));
console.log(`P0-D 졸업 시뮬 ${dates.length}일: ${dates[0]} ~ ${dates[dates.length - 1]}\n`);

let answered = 0;
for (const d of dates) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), Number(process.env.REPLAY_TIMEOUT_MS) || 300000);
  try {
    const r = await fetch(`${BASE}/api/cron/coach?child=${CID}&force=1&date=${d}`, { signal: ctrl.signal });
    clearTimeout(to);
    const j = await r.json().catch(() => ({}));
    // 그날 질문에 unitProbe가 있으면 그 유닛 양성 칩으로 답을 채운다(다음날 신호로 읽힘)
    const { data: q } = await sb.from('daily_questions').select('context').eq('child_id', CID).eq('q_date', d).maybeSingle();
    const up = q?.context?.unitProbe;
    const chip = up?.unit_id ? POSITIVE[up.unit_id] : null;
    let tag = '';
    if (chip) { await sb.from('daily_questions').update({ answer: chip }).eq('child_id', CID).eq('q_date', d); answered++; tag = ` · ✍️${up.unit_id}="${chip}"`; }
    console.log(`✓ ${d}  letters=${j.letters ?? 0}${tag}`);
  } catch (e) {
    clearTimeout(to);
    console.log(`✗ ${d}  ${e instanceof Error ? e.message : e}`);
  }
}

// 최종 커리큘럼 진척 출력
const { data: prog } = await sb.from('curriculum_progress').select('unit_id,status,step,evidence').eq('child_id', CID).order('updated_at', { ascending: false });
console.log(`\n프로브 답 ${answered}일 채움. 최종 커리큘럼 진척:`);
for (const p of (prog || [])) {
  const ev = p.evidence || {};
  console.log(`  ${p.unit_id}: ${p.status}·${p.step}단  envTablePct=${ev.envTablePct7d ?? '-'} passStreak=${ev.passStreakDays ?? 0} stallStreak=${ev.stallStreakDays ?? 0}`);
}
