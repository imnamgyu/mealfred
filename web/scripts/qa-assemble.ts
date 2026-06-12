/**
 * scripts/qa-assemble.ts — 조립기 육안 QA (npx tsx scripts/qa-assemble.ts)
 * 실 블록 풀로 mode×유닛 샘플 편지 + 한 유닛 6일 통주를 출력한다(LLM 0콜·DB 0).
 * WBS D-12 DoD 증빙 + C-18 이후 풀 품질 눈검수용.
 */
import { assembleLetter, buildLetterCtx, collectBlockLedger } from '../lib/assembleLetter';
import { loadBlocks } from '../lib/letterBlocks';
import { UNITS, UNIT_IDS, type UnitId } from '../lib/curriculumUnits';
import type { DailyDecision } from '../lib/curriculum';
import type { FactCard } from '../lib/coachFacts';

const blocks = loadBlocks();
console.log(`블록 풀: ${blocks.length}개\n`);

const DIAG: FactCard = { key: 'env-week', text: '식사 환경: 7끼 중 5끼 화면', kind: 'diagnosis', prose: '최근 기록된 일곱 끼 가운데 다섯 끼가 화면과 함께한 식사였어요' };
const DAILY: FactCard = { key: 'env-y', text: '어제 끼니 환경: 저녁(식탁)', kind: 'daily', prose: '어제 저녁을 화면 없이 식탁에 앉아 먹었어요' };

const D = (unit: UnitId, mode: DailyDecision['mode'], step = 1): DailyDecision => ({ unit, step, mode, pivotTo: mode === 'pivot' ? unit : null });

console.log('═══ A. mode별 샘플(table-stage·아린) ═══');
for (const [mode, introNeeded] of [['advance', false], ['deepen', false], ['pivot', false], ['maintain', false], ['celebrate', false], ['observe', false], ['advance', true]] as const) {
  const out = assembleLetter({
    decision: D('table-stage', mode), unitDef: UNITS['table-stage'], factCards: [DAILY, DIAG],
    blocks, blockLedger: [], factsCited: [], name: '아린', daySeed: 20260612, cidHash: 7, introNeeded,
  });
  console.log(`\n[${introNeeded ? 'intro(주 첫 편지)' : mode}] ${out.usedBlocks.join(' + ')}${out.fallback ? ' ⚠️FALLBACK' : ''}${out.warnings.length ? ` ⚠️${out.warnings.join('|')}` : ''}`);
  console.log(`  ${out.letter}`);
  console.log(`  └ oneliner: ${out.oneliner} · fact=${out.factUsed ?? '-'}`);
}

console.log('\n═══ B. 전 유닛 × intro/advance/deepen 폴백·경고 스캔 ═══');
let fallbacks = 0, warns = 0;
for (const u of UNIT_IDS) {
  for (const mode of ['advance', 'deepen', 'observe'] as const) {
    for (let seed = 0; seed < 7; seed++) {
      const out = assembleLetter({
        decision: D(u, mode), unitDef: UNITS[u], factCards: [DAILY, DIAG], blocks,
        blockLedger: [], factsCited: [], name: '지호', daySeed: seed, cidHash: 3,
        food: ['exposure-savings', 'food-bridge', 'link-rhythm'].includes(u) ? '두부' : null,
      });
      if (out.fallback) { fallbacks++; console.log(`  ⚠️ 폴백: ${u}/${mode}/seed${seed}`); }
      if (out.warnings.length) { warns++; console.log(`  ⚠️ 경고: ${u}/${mode}/seed${seed}: ${out.warnings.join('|')}`); }
    }
  }
}
console.log(`폴백 ${fallbacks}건 · 경고 ${warns}건 (252회 조립)`);

console.log('\n═══ C. hunger-rhythm 6일 통주(원장 작동) ═══');
const ctxs: Array<Record<string, unknown>> = [];
let cited: string[] = [];
for (let d = 0; d < 6; d++) {
  const ledger = collectBlockLedger(ctxs.slice(-3));
  const decision = D('hunger-rhythm', d === 0 ? 'advance' : d % 2 ? 'deepen' : 'advance');
  const out = assembleLetter({
    decision, unitDef: UNITS['hunger-rhythm'], factCards: [DAILY, DIAG], blocks,
    blockLedger: ledger, factsCited: cited, name: '아린', daySeed: 100 + d, cidHash: 7, introNeeded: d === 0,
  });
  console.log(`\nD+${d} [${d === 0 ? 'intro' : decision.mode}] ${out.usedBlocks.join(' + ')}${out.fallback ? ' ⚠️FALLBACK' : ''}`);
  console.log(`  ${out.letter}`);
  const ctx = buildLetterCtx({ source: 'qa', out, decision, prevFactsCited: cited });
  cited = ctx.factsCited as string[];
  ctxs.push(ctx);
}
console.log(`\n진단 인용 원장: ${JSON.stringify(cited)}`);
