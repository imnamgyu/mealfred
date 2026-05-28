/**
 * 메뉴→식재료 매핑 감사 — young-recipes(정답지) 90종을 mapMenuLocal에 넣어
 * 현재 룰+스캔이 정답 식재료를 얼마나 맞히는지/틀리는지 측정.
 *
 * 실행: cd web && node scripts/audit-menu.ts
 */
// @ts-expect-error mjs 데이터 (타입 없음)
import { RECIPES as R1 } from './young-recipes-data.mjs';
// @ts-expect-error
import { RECIPES as R2 } from './young-recipes-data-2.mjs';
// @ts-expect-error
import { RECIPES as R3 } from './young-recipes-data-3.mjs';
import { mapMenuLocal, canon } from '../lib/menuMap.ts';

type Recipe = { name: string; ings: string[] };
const all: Recipe[] = [...R1, ...R2, ...R3];

const normSet = (arr: string[]) => new Set(arr.map(canon).filter((x): x is string => !!x));

const SKIP_DICT = process.argv.includes('--no-dict');
let exact = 0, partial = 0, miss = 0, noMap = 0;
const problems: string[] = [];

for (const r of all) {
  const want = normSet(r.ings);
  const res = mapMenuLocal(r.name, { skipDict: SKIP_DICT });
  const got = res ? normSet(res.ingredients) : new Set<string>();
  const source = res?.source ?? 'NONE';

  const missing = [...want].filter((w) => !got.has(w));     // 정답인데 못 찾음
  const wrong = [...got].filter((g) => !want.has(g));       // 우리만 넣음(오탐 의심)

  if (!res) { noMap++; problems.push(`❓ [무매핑→LLM] ${r.name}  정답:{${[...want].join(',')}}`); continue; }
  if (missing.length === 0 && wrong.length === 0) { exact++; continue; }
  if (missing.length === 0) { partial++; }  // 정답은 다 맞췄고 추가만 있음
  else { miss++; }
  problems.push(`✗ [${source}] ${r.name}\n    정답:{${[...want].join(',')}}\n    출력:{${[...got].join(',')}}` +
    (missing.length ? `\n    누락:${missing.join(',')}` : '') +
    (wrong.length ? `\n    오탐?:${wrong.join(',')}` : ''));
}

console.log(`\n===== 메뉴→식재료 감사 (총 ${all.length}) =====`);
console.log(`✅ 완전일치 ${exact}  🟡 정답포함+추가 ${partial}  ❌ 정답누락 ${miss}  ❓ 무매핑(LLM행) ${noMap}`);
console.log(`정답누락 0 비율(=핵심 다 맞힘): ${Math.round((exact + partial) / all.length * 100)}%\n`);
console.log('----- 문제 케이스 -----');
console.log(problems.join('\n'));
