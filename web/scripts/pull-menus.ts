/**
 * 실데이터 매핑 튜닝 puller — /milfred-mapping 스킬의 1단계.
 * meal_logs(실제 입력 메뉴)·user_menu_overrides(엄마 교정)를 가져와
 * 현재 mapMenuLocal 결과와 대조 → 튜닝 후보를 우선순위로 출력.
 *
 * 실행: cd web && node scripts/pull-menus.ts
 */
import fs from 'fs';
import path from 'path';
import { mapMenuLocal, canon } from '../lib/menuMap.ts';

// .env.local에서 Supabase 키 로드 (node 직접 실행 — Next 자동로드 없음)
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

async function rest(pathq: string): Promise<unknown[]> {
  const r = await fetch(`${URL}/rest/v1/${pathq}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) { console.error(`REST ${pathq} → ${r.status}`); return []; }
  return r.json();
}

const sameSet = (a: string[], b: string[]) => {
  const A = new Set(a.map(canon).filter(Boolean));
  const B = new Set(b.map(canon).filter(Boolean));
  return A.size === B.size && [...A].every((x) => B.has(x as string));
};

(async () => {
  const t0 = Date.now();
  const meals = await rest('meal_logs?select=menus,ingredients,log_date&order=log_date.desc&limit=500') as
    { menus: string[] | null; ingredients: string[] | null }[];
  const overrides = await rest('user_menu_overrides?select=menu,ingredients,updated_at&order=updated_at.desc&limit=500') as
    { menu: string; ingredients: string[] }[];

  // 메뉴 빈도 집계
  const freq: Record<string, number> = {};
  meals.forEach((m) => (m.menus || []).forEach((mn) => {
    const k = (mn || '').replace(/\s/g, ''); if (k) freq[k] = (freq[k] || 0) + 1;
  }));
  const menus = Object.entries(freq).sort((a, b) => b[1] - a[1]);

  const uncovered: string[] = [];   // 룰/스캔/사전 다 못 잡음 → LLM행 (사전화 1순위)
  const weak: string[] = [];        // 1개만 매핑된 복합 메뉴(2어절+) → 빈약 의심
  for (const [menu, n] of menus) {
    const res = mapMenuLocal(menu);
    if (!res) { uncovered.push(`${menu} (×${n})`); continue; }
    const compound = menu.length >= 5 || /[ +]/.test(menu);
    if (res.ingredients.length <= 1 && compound) weak.push(`${menu} (×${n}) → [${res.source}] ${res.ingredients.join(',') || '∅'}`);
  }

  // 교정 충돌: 엄마가 확정한 ings ≠ 현재 전역 매핑 → 전역 사전 반영 후보
  const conflicts: string[] = [];
  const ovByMenu: Record<string, string[][]> = {};
  overrides.forEach((o) => (ovByMenu[o.menu] = ovByMenu[o.menu] || []).push(o.ingredients || []));
  for (const [menu, lists] of Object.entries(ovByMenu)) {
    const res = mapMenuLocal(menu);
    const cur = res ? res.ingredients : [];
    const disagree = lists.filter((l) => !sameSet(l, cur));
    if (disagree.length) {
      conflicts.push(`${menu} (${lists.length}명 교정)\n    현재:[${cur.join(',') || '∅'}]\n    교정예:[${disagree.slice(0, 3).map((l) => l.map(canon).filter(Boolean).join(',')).join(' / ')}]`);
    }
  }

  console.log(`\n===== 실데이터 매핑 튜닝 후보 =====`);
  console.log(`meal_logs ${meals.length}행 · 고유메뉴 ${menus.length} · overrides ${overrides.length}건\n`);
  console.log(`🔴 무매핑(LLM행) — 사전화 1순위 [${uncovered.length}]`);
  console.log(uncovered.length ? '  ' + uncovered.join('\n  ') : '  (없음)');
  console.log(`\n🟠 교정 충돌 — 엄마 교정 ≠ 전역 매핑 [${conflicts.length}]`);
  console.log(conflicts.length ? '  ' + conflicts.join('\n  ') : '  (없음)');
  console.log(`\n🟡 빈약 의심 — 복합메뉴인데 1개만 [${weak.length}]`);
  console.log(weak.length ? '  ' + weak.join('\n  ') : '  (없음)');

  // 마무리 리포트용 집계 (스킬 5단계가 읽는다)
  const lookups = menus.length + overrides.length;   // 실데이터 룩업(고유메뉴 + 교정)
  console.log(`\n── 집계 ──`);
  console.log(`🔍 실데이터 룩업 ${lookups}건 (고유메뉴 ${menus.length} + 교정 ${overrides.length}) · meal_logs ${meals.length}행`);
  console.log(`🚩 후보 ${uncovered.length + conflicts.length + weak.length}건 (무매핑 ${uncovered.length} / 교정충돌 ${conflicts.length} / 빈약 ${weak.length})`);
  console.log(`⏱ pull 소요 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})();
