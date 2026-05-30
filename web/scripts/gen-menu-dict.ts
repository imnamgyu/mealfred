/**
 * 레시피 사전 생성 — menu→ings를 표준명으로 정규화해 lib/menu-dict.json 출력.
 *  (1) young-recipes 90종 = 정답지(audit 기준) — 권위, 절대 변경 X.
 *  (2) 편식극복키트 B_레시피DB(영아·유아·월별식단·아동) = 대량 보강 — 신규 메뉴만 추가.
 *      농진청 식재료명을 base 추출 → canon → CANON_VOCAB(실식재료)만 채택, 양념·노이즈 drop.
 * 실행: cd web && node scripts/gen-menu-dict.ts
 */
// @ts-expect-error mjs 데이터
import { RECIPES as R1 } from './young-recipes-data.mjs';
// @ts-expect-error
import { RECIPES as R2 } from './young-recipes-data-2.mjs';
// @ts-expect-error
import { RECIPES as R3 } from './young-recipes-data-3.mjs';
import { canon, CANON_VOCAB, MENU_MAP } from '../lib/menuMap.ts';
import fs from 'fs';
import path from 'path';

type Recipe = { name: string; ings: string[] };
const dict: Record<string, string[]> = {};

// ── (1) young-recipes 90 — 권위(정답지) ──
const young: Recipe[] = [...R1, ...R2, ...R3];
for (const r of young) {
  const key = r.name.replace(/\s/g, '');
  const ings = [...new Set((r.ings || []).map(canon).filter((x): x is string => !!x))];
  if (ings.length) dict[key] = dict[key] ? [...new Set([...dict[key], ...ings])] : ings;
}
const youngKeys = new Set(Object.keys(dict));

// ── (2) 편식극복키트 레시피DB 보강 ──
const KIT_DIR = '/Users/ing/Desktop/편식극복키트/01_참고자료/B_레시피DB';
const KIT_FILES = ['영아기_레시피DB.json', '영아기_레시피DB_추가.json', '유아기_레시피DB.json', '유아기_레시피DB_추가.json', '유아기_월별식단_레시피DB.json', '아동기_레시피DB.json'];

// 농진청 식재료명 → base (콤마/언더바/괄호 앞 첫 토큰)
function baseOf(raw: string): string { return (raw || '').split(/[,_(]/)[0].replace(/\s+/g, '').trim(); }
// 메뉴명 정리: 선행 (간식)/(반찬)/(...제외), 괄호주석, 알레르겐 동그라미숫자, 공백 제거
function cleanMenu(raw: string): string {
  return (raw || '').replace(/\([^)]*\)/g, '').replace(/[①-⑳➀-➓]/g, '').replace(/\s/g, '').trim();
}

let kitAdded = 0, kitFiles = 0, kitRecipes = 0;
for (const fn of KIT_FILES) {
  let rows: { name?: string; ingredients?: { name?: string }[] }[] = [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(KIT_DIR, fn), 'utf-8'));
    rows = Array.isArray(d) ? d : (Object.values(d).find((v) => Array.isArray(v)) as typeof rows) || [];
    kitFiles++;
  } catch { continue; }
  for (const r of rows) {
    kitRecipes++;
    if (!r.name) continue;
    const key = cleanMenu(r.name);
    if (key.length < 2 || youngKeys.has(key) || MENU_MAP[key]) continue;   // 권위 90·큐레이션 룰 보존(dict가 rule을 가리지 않게)
    const ings: string[] = [];
    for (const ing of r.ingredients || []) {
      const c = canon(baseOf(ing.name || ''));
      if (c && CANON_VOCAB.has(c) && !ings.includes(c)) ings.push(c);   // 실식재료만(양념·노이즈 drop)
    }
    if (!ings.length) continue;
    if (dict[key]) dict[key] = [...new Set([...dict[key], ...ings])];   // kit끼리 중복은 합집합
    else { dict[key] = ings; kitAdded++; }
  }
}

const out = path.join(process.cwd(), 'lib', 'menu-dict.json');
fs.writeFileSync(out, JSON.stringify(dict, null, 0) + '\n', 'utf-8');
const bytes = fs.statSync(out).size;
console.log(`menu-dict.json: 총 ${Object.keys(dict).length}개 메뉴 (young 90 권위 + kit 신규 ${kitAdded}) · ${(bytes / 1024).toFixed(0)}KB · kit파일 ${kitFiles}/${KIT_FILES.length}, 레시피 ${kitRecipes}`);
console.log('kit 샘플:', Object.entries(dict).filter(([k]) => !youngKeys.has(k)).slice(0, 6).map(([k, v]) => `${k}→{${v.join(',')}}`).join('  '));
