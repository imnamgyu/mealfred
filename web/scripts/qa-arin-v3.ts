/**
 * scripts/qa-arin-v3.ts — I-04 실데이터 병행 검증 (npx tsx scripts/qa-arin-v3.ts)
 * 아린 실데이터 fixture로 v3 통주 → 14통 전문 출력(사람 정독용) + 전수 마커 스캐너 + I-06 게이트.
 * 4사고(복붙·뷔페 일반화·점심 모순·주제 수렴) 재현 여부를 기계+눈으로 확인한다.
 */
import { runV3Family, type ReplayFamily } from '../lib/replayRunner';
import { replayMetrics, cutoverGate } from '../lib/replayMetrics';
import { letterSimilarity } from '../lib/coach';
import FIX from '../tests/fixtures/real-arin.json';

const fam = FIX as unknown as ReplayFamily & { rows: ReplayFamily['rows'] };
const days = runV3Family(fam, { days: 14 });

console.log(`아린 v3 통주 — 발행 ${days.length}통\n`);
for (const d of days) {
  console.log(`── ${d.date} [${d.decision?.unit}·${d.decision?.step}단·${d.decision?.mode}]${d.fallback ? ' ⚠️FALLBACK' : ''} ${d.usedBlocks.join('+')}`);
  console.log(`   ${d.letter}\n`);
}

// ── 전수 마커 스캐너(6/11 교훈 — 출력 정독 터널비전 방지) ───────────────────────
const marks: string[] = [];
for (let i = 0; i < days.length; i++) {
  const L = days[i].letter;
  if (/뷔페|외식/.test(L)) marks.push(`${days[i].date}: 단발 이벤트 단어(뷔페·외식)`);
  if (/점심[^.]{0,8}(거르|건너|굶)/.test(L)) marks.push(`${days[i].date}: 점심 결식 단정`);
  if (/항상|매일|맨날|계속/.test(L)) marks.push(`${days[i].date}: 빈도 단정어`);
  if (/미션|과제|챌린지|단계|진도|수업/.test(L)) marks.push(`${days[i].date}: 내부 개념 노출`);
  if (/체중|몸무게|비만/.test(L)) marks.push(`${days[i].date}: 체중 단어`);
  if (i > 0) {
    const sim = letterSimilarity(L, days[i - 1].letter);
    if (sim >= 0.45) marks.push(`${days[i].date}: 전일 유사도 ${sim.toFixed(2)}(복붙 위험)`);
    if (L.slice(0, 25) === days[i - 1].letter.slice(0, 25)) marks.push(`${days[i].date}: 도입 25자 동일(주제 수렴)`);
  }
}
const m = replayMetrics(days);
const gate = cutoverGate(m);
console.log('═══ 마커 스캔 ═══');
console.log(marks.length ? marks.join('\n') : '마커 0 — 4사고 재현 없음');
console.log('\n═══ 지표 ═══');
console.log(JSON.stringify(m, null, 1));
console.log('\n═══ I-06 게이트 ═══');
console.log(gate.length ? gate.join('\n') : '✅ 전부 통과');
