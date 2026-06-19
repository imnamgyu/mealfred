/**
 * 아린(43942d34) 편지 1일차부터 순차 재생성(라이브 로직 = 로컬 dev 크론).
 *   각 날짜 D에 대해 GET /api/cron/coach?child=CID&force=1&date=D 를 '순차'로 호출
 *   (각 날은 직전 날들의 편지·ledger·커리큘럼 진척에 의존하므로 반드시 순서대로).
 * 전제: npm run dev 가 localhost:3000 에서 떠 있어야 함(미배포 코드를 로컬에서 실행).
 * 실행: node --env-file=.env.local scripts/arin-replay.mjs [시작일] [종료일]
 *   기본: 2026-05-27 ~ 2026-06-18(아린 가입~오늘)
 */
const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const BASE = process.env.REPLAY_BASE || 'http://localhost:3000';
const start = process.argv[2] || '2026-05-27';
const end = process.argv[3] || '2026-06-18';

const dates = [];
for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));

console.log(`재생성 ${dates.length}일: ${dates[0]} ~ ${dates[dates.length - 1]}\n`);
let ok = 0, fail = 0;
for (const d of dates) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 180000);   // 180s — 편지+재생성+주간 Sonnet 여유
    const r = await fetch(`${BASE}/api/cron/coach?child=${CID}&force=1&date=${d}`, { signal: ctrl.signal });
    clearTimeout(to);
    const j = await r.json().catch(() => ({}));
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (j.ok) { ok++; console.log(`✓ ${d}  ${dt}s  letters=${j.letters ?? 0} reused=${j.reused ?? 0} err=${j.errors ?? 0}${j.processed === 0 ? '  (미처리)' : ''}`); }
    else { fail++; console.log(`✗ ${d}  ${dt}s  ${JSON.stringify(j).slice(0, 200)}`); }
  } catch (e) {
    fail++; console.log(`✗ ${d}  EXC ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`\n완료: 성공 ${ok} · 실패 ${fail}`);
