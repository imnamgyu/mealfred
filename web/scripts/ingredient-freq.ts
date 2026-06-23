/**
 * 실측 식재료 등장빈도 — institution_menu_items.menus 전부를 mapMenuLocal로 분해해 빈도 집계.
 * CATEGORY_ESSENTIALS의 must/rec를 '실제 급식 출현빈도' 순으로 재정렬해 paste-ready로 출력.
 * 실행: cd web && npx tsx scripts/ingredient-freq.ts
 */
import fs from 'fs';
import path from 'path';
import { mapMenuLocal } from '../lib/menuMap.ts';

function loadEnv() {
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
}
const { url: URL_, key: KEY } = loadEnv();
const H: Record<string, string> = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function fetchAll<T = unknown>(table: string, qs: string): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${table}?${qs}&offset=${off}&limit=1000`, { headers: H });
    const d = await r.json();
    if (!Array.isArray(d)) break;
    out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}

const CATEGORY_ESSENTIALS: Record<string, { must: string[]; rec: string[] }> = {
  '잎채소': { must: ['배추', '시금치', '상추', '쑥갓', '양상추', '미나리', '근대', '청경채', '아욱', '들깻잎'], rec: ['양배추', '얼갈이배추', '달래', '쑥', '참나물'] },
  '뿌리채소': { must: ['당근', '무'], rec: ['토마토', '연근', '우엉', '도라지', '더덕', '순무'] },
  '열매채소': { must: [], rec: ['호박', '오이', '가지', '파프리카', '피망'] },
  '곡물_탄수': { must: ['통밀빵', '감자', '고구마'], rec: ['현미', '옥수수', '찹쌀', '보리'] },
  '콩_콩제품': { must: ['두부', '검은콩'], rec: ['콩나물', '숙주나물', '완두콩', '땅콩'] },
  '생선': { must: ['멸치', '명태', '대구', '삼치', '고등어'], rec: ['오징어', '가자미', '갈치'] },
  '고기': { must: [], rec: ['소고기', '돼지고기', '닭고기', '오리고기'] },
  '계란': { must: ['달걀', '계란'], rec: ['메추리알'] },
  '유제품': { must: [], rec: ['우유', '치즈'] },
  '버섯': { must: [], rec: ['느타리버섯', '표고버섯', '팽이버섯', '양송이버섯'] },
  '과일': { must: [], rec: ['배', '바나나', '참외', '키위', '귤'] },
  '갑각_조개': { must: [], rec: ['새우', '바지락', '홍합', '조개'] },
  '견과_씨앗': { must: [], rec: ['아몬드', '호두'] },
  '기타채소': { must: ['양파', '부추'], rec: [] },
};

const baseOf = (n: string) => n.replace('(대두)', '').replace('버섯', '');

async function main() {
  const rows = await fetchAll<{ menus: string[] | null }>('institution_menu_items', 'select=menus');
  console.error(`institution_menu_items ${rows.length}행 집계`);
  const freq: Record<string, number> = {};
  let menuCount = 0;
  for (const r of rows) for (const menu of (r.menus || [])) {
    menuCount++;
    for (const ing of (mapMenuLocal(menu)?.ingredients || [])) freq[ing] = (freq[ing] || 0) + 1;
  }
  console.error(`메뉴 ${menuCount}건 분해 완료\n`);

  const f = (n: string) => freq[baseOf(n)] || 0;
  const byFreq = (a: string, b: string) => f(b) - f(a);

  console.log('// ── 실측 등장빈도 재정렬(이사님 2026-06-23) — institution_menu_items 기준. 괄호=빈도 ──');
  console.log('const CATEGORY_ESSENTIALS = {');
  for (const [cat, { must, rec }] of Object.entries(CATEGORY_ESSENTIALS)) {
    const sm = [...must].sort(byFreq), sr = [...rec].sort(byFreq);
    const ann = (arr: string[]) => arr.map((n) => `${n}·${f(n)}`).join(', ');
    const fmt = (arr: string[]) => arr.map((n) => `'${n}'`).join(', ');
    console.log(`  // ${cat}: must[${ann(sm)}] rec[${ann(sr)}]`);
    console.log(`  '${cat}': {em:'?', must:[${fmt(sm)}], rec:[${fmt(sr)}]},`);
  }
  console.log('};');
}
main().catch((e) => { console.error(e); process.exit(1); });
