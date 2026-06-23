/**
 * (shim) 단일 진실은 lib/gridDateMapCore.ts. 이 파일은 scripts 하위호환용 re-export.
 * scripts는 tsx로 실행한다: `npx tsx scripts/grid-coverage.mjs` (node 아님 — .ts import 때문).
 */
export * from '../../lib/gridDateMapCore.ts';
