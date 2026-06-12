/**
 * scripts/lint-blocks.ts — 블록 풀 린트 러너 (npx tsx scripts/lint-blocks.ts)
 * C-19 린트 코어(lib/letterBlocks)를 CLI로 — C-20 블록 증식 절차의 검수 도구(테스트와 동일 기준).
 */
import { loadBlocks, lintBlockPool } from '../lib/letterBlocks';

const pool = loadBlocks();
const issues = lintBlockPool(pool);
console.log(`블록 ${pool.length}개 · 이슈 ${issues.length}건`);
for (const i of issues) console.log(`  ✗ ${i.id} :: ${i.rule}`);
process.exit(issues.length ? 1 : 0);
