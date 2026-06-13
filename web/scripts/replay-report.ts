/** scripts/replay-report.ts — I-03 임계 보정 리포트 (npx tsx scripts/replay-report.ts) */
import { runV3Family, type ReplayFamily } from '../lib/replayRunner';
import { replayMetrics } from '../lib/replayMetrics';
import SYN from '../tests/fixtures/synthetic-families.json';

const fams = (SYN as { families: Array<ReplayFamily & { arc: string }> }).families;
const byArc: Record<string, ReturnType<typeof replayMetrics>[]> = {};
for (const f of fams) {
  const m = replayMetrics(runV3Family(f, { days: 14 }));
  (byArc[f.arc] ||= []).push(m);
}
for (const [arc, ms] of Object.entries(byArc)) {
  const sum = (k: keyof ReturnType<typeof replayMetrics>) => ms.reduce((n, m) => n + (m[k] as number), 0);
  const modes: Record<string, number> = {};
  ms.forEach((m) => Object.entries(m.modeDist).forEach(([k, v]) => { modes[k] = (modes[k] || 0) + v; }));
  console.log(`\n[${arc}] 가정 ${ms.length} · 편지 ${sum('letters')}`);
  console.log(`  mode: ${JSON.stringify(modes)}`);
  console.log(`  pivot 총 ${modes.pivot || 0} · 폴백 ${sum('fallbackCount')} · focus 최장 ${Math.max(...ms.map((m) => m.focusStreakMaxWeeks))}주`);
}
