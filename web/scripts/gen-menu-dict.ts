/**
 * 레시피 사전 생성 — young-recipes 90종 name→ings를 표준명으로 정규화해 lib/menu-dict.json 출력.
 * 실행: cd web && node scripts/gen-menu-dict.ts
 */
// @ts-expect-error mjs 데이터
import { RECIPES as R1 } from './young-recipes-data.mjs';
// @ts-expect-error
import { RECIPES as R2 } from './young-recipes-data-2.mjs';
// @ts-expect-error
import { RECIPES as R3 } from './young-recipes-data-3.mjs';
import { canon } from '../lib/menuMap.ts';
import fs from 'fs';
import path from 'path';

type Recipe = { name: string; ings: string[] };
const all: Recipe[] = [...R1, ...R2, ...R3];

const dict: Record<string, string[]> = {};
for (const r of all) {
  const key = r.name.replace(/\s/g, '');
  const ings = [...new Set((r.ings || []).map(canon).filter((x): x is string => !!x))];
  if (!ings.length) continue;
  // 같은 메뉴명이 또 나오면 식재료 합집합
  dict[key] = dict[key] ? [...new Set([...dict[key], ...ings])] : ings;
}

const out = path.join(process.cwd(), 'lib', 'menu-dict.json');
fs.writeFileSync(out, JSON.stringify(dict, null, 0) + '\n', 'utf-8');
console.log(`menu-dict.json 생성: ${Object.keys(dict).length}개 메뉴`);
console.log('샘플:', Object.entries(dict).slice(0, 5).map(([k, v]) => `${k}→{${v.join(',')}}`).join('  '));
