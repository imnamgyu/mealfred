/**
 * 실데이터 매핑 튜닝 puller — /mealfred-food-mapping 스킬 A2.
 * 소스(2026-06-29 보강): 부모 입력(meal_logs) + ⭐OCR 식단표(institution_menu_items·최대 코퍼스)
 *   + ⭐크론 학습(learned_menus·hits 빈도) + 엄마 교정(user_menu_overrides).
 * 각 메뉴를 mapMenuLocal과 대조 → 무매핑/빈약/교정충돌을 빈도·소스 태그로 출력.
 * 무매핑은 양념·음료·OCR노이즈(소스·차·식혜·후기·칼슘…)를 걸러 '진짜 식재료 갭'만 우선.
 *
 * 실행: cd web && npx tsx scripts/pull-menus.ts
 */
import fs from 'fs';
import path from 'path';
import { mapMenuLocal, canon } from '../lib/menuMap.ts';

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const txt = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* noop */ }
  return env;
}
const env = loadEnv();
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('❌ SUPABASE_URL / SERVICE_ROLE_KEY 없음 (.env.local 확인)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(pathq: string): Promise<any[]> {
  const r = await fetch(`${URL}/rest/v1/${pathq}`, { headers: H });
  if (!r.ok) { console.error(`REST ${pathq} → ${r.status}`); return []; }
  return r.json();
}
// 큰 테이블 전수 페이지네이션
async function restAll(table: string, qs: string): Promise<any[]> {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL}/rest/v1/${table}?${qs}&offset=${off}&limit=1000`, { headers: H });
    if (!r.ok) { console.error(`REST ${table} → ${r.status}`); break; }
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) break;
    out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}

const norm = (s: string) => (s || '').replace(/\s/g, '');
const sameSet = (a: string[], b: string[]) => {
  const A = new Set(a.map(canon).filter(Boolean));
  const B = new Set(b.map(canon).filter(Boolean));
  return A.size === B.size && [...A].every((x) => B.has(x as string));
};
// 무매핑 후보에서 거를 양념·음료·간식·OCR노이즈(식재료로 사전화할 게 아님)
const NOISE = /^(소스|양념장?|쌈장|저염쌈장|초장|드레싱|마요네즈|머스타드|간장|케첩|케찹|고춧가루|참깨|깨소금|소금|설탕|물엿)$|차$|주스|에이드|식혜|수정과|미숫|음료|후기|제공|행사|체험|숲|칼슘|에너지|^단백질$|^비타민[^가-힣]?$|국산|원산지|이유식|유아식|^중기$|쿠키|약과|젤리|사탕|초콜|아이스크림|빙수|키즈|데이$|제철|특식|생일|기념|^\(|^\*|단무지|새참|있습니다|소떡|^코코아$|식이섬유|비타플러스|^반찬|가능한$|맛을$|^[0-9·\-\s]+$/;

(async () => {
  const t0 = Date.now();
  const meals = await rest('meal_logs?select=menus&order=log_date.desc&limit=1000') as { menus: string[] | null }[];
  const inst = await restAll('institution_menu_items', 'select=menus') as { menus: string[] | null }[];           // ⭐ OCR 식단표
  const learned = await restAll('learned_menus', 'select=menu,hits') as { menu: string; hits: number }[];          // ⭐ 크론 학습
  const overrides = await rest('user_menu_overrides?select=menu,ingredients&order=updated_at.desc&limit=1000') as { menu: string; ingredients: string[] }[];

  // 전 소스 메뉴 빈도 집계 + 소스 태그
  const freq: Record<string, number> = {}, disp: Record<string, string> = {}, src: Record<string, Set<string>> = {};
  const add = (menu: string, n: number, s: string) => { const k = norm(menu); if (!k) return; freq[k] = (freq[k] || 0) + n; disp[k] = disp[k] || menu; (src[k] = src[k] || new Set()).add(s); };
  meals.forEach((m) => (m.menus || []).forEach((mn) => add(mn, 1, '부모')));
  inst.forEach((r) => (r.menus || []).forEach((mn) => add(mn, 1, '식단표')));
  learned.forEach((r) => r.menu && add(r.menu, r.hits || 1, '학습'));

  const menus = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  const uncovered: { n: string; f: number; s: string; noise: boolean }[] = [];
  const weak: string[] = [];
  for (const k of menus) {
    const res = mapMenuLocal(disp[k]);
    if (!res || !res.ingredients.length) { uncovered.push({ n: disp[k], f: freq[k], s: [...src[k]].join('+'), noise: NOISE.test(disp[k]) }); continue; }
    const compound = disp[k].length >= 5 || /[ +]/.test(disp[k]);
    if (res.ingredients.length <= 1 && compound) weak.push(`${disp[k]} (×${freq[k]}, ${[...src[k]].join('+')}) → [${res.source}] ${res.ingredients.join(',') || '∅'}`);
  }
  const realGap = uncovered.filter((u) => !u.noise);
  const noiseN = uncovered.length - realGap.length;

  // 교정 충돌 (엄마 교정 ≠ 전역 매핑)
  const conflicts: string[] = [];
  const ovByMenu: Record<string, string[][]> = {};
  overrides.forEach((o) => (ovByMenu[o.menu] = ovByMenu[o.menu] || []).push(o.ingredients || []));
  for (const [menu, lists] of Object.entries(ovByMenu)) {
    const res = mapMenuLocal(menu);
    const cur = res ? res.ingredients : [];
    const dis = lists.filter((l) => !sameSet(l, cur));
    if (dis.length) conflicts.push(`${menu} (${lists.length}명)\n    현재:[${cur.join(',') || '∅'}]\n    교정:[${dis.slice(0, 3).map((l) => l.map(canon).filter(Boolean).join(',')).join(' / ')}]`);
  }

  console.log(`\n===== 실데이터 매핑 튜닝 후보 (멀티소스) =====`);
  console.log(`소스: 부모 meal_logs ${meals.length}행 · ⭐OCR 식단표 ${inst.length}행 · ⭐학습 learned_menus ${learned.length} · 교정 ${overrides.length}건`);
  console.log(`전 소스 통합 고유메뉴 ${menus.length}\n`);
  console.log(`🔴 무매핑 — 진짜 식재료 갭 [${realGap.length}] (양념·음료·노이즈 ${noiseN}건 제외) · 빈도순 TOP 50`);
  realGap.slice(0, 50).forEach((u) => console.log(`  ${String(u.f).padStart(5)}  ${u.n}  〔${u.s}〕`));
  console.log(`\n🟠 교정 충돌 — 엄마 교정 ≠ 전역 매핑 [${conflicts.length}]`);
  console.log(conflicts.length ? '  ' + conflicts.join('\n  ') : '  (없음)');
  console.log(`\n🟡 빈약 의심 — 복합메뉴인데 1개만 [${weak.length}] · TOP 30`);
  console.log(weak.length ? '  ' + weak.slice(0, 30).join('\n  ') : '  (없음)');

  console.log(`\n── 집계 ──`);
  console.log(`🔍 통합 고유메뉴 ${menus.length} (부모 ${meals.length}행 + 식단표 ${inst.length}행 + 학습 ${learned.length}) · 교정 ${overrides.length}`);
  console.log(`🚩 후보 ${realGap.length + conflicts.length + weak.length}건 (무매핑식재료 ${realGap.length} / 노이즈제외 ${noiseN} / 교정충돌 ${conflicts.length} / 빈약 ${weak.length})`);
  console.log(`⏱ pull 소요 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})();
