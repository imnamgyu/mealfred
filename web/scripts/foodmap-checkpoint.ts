/**
 * foodmap-checkpoint.ts — /mealfred-food-mapping 증분 체크포인트.
 *
 * 목적: 스킬을 마지막으로 돌린 시점을 기록해두고, 다음 호출 때 "그 사이 신규 유입된 메뉴"만
 *       골라 식재료 분해(매핑) 상태를 정독한다. (치킨 사례처럼 복합 메뉴의 누락 재료를 잡기 위함)
 *
 * 체크포인트 파일: web/lib/foodmap-checkpoint.json
 *   { last_run, high_water_created_at, learned_menus_count, notes }
 *   - high_water_created_at = 직전 처리한 learned_menus.created_at 최대값(증분 기준)
 *
 * 모드:
 *   (기본) status  — 체크포인트 + 현재 코퍼스 수 + 신규 메뉴 건수 요약
 *   --new          — 신규(created_at > high_water) 메뉴를 매핑·정밀 누락감사해 '분해 후보' 출력
 *                    (무매핑 + 이름엔 있으나 출력서 빠진 표준 식재료)
 *   --commit       — 지금을 체크포인트로 기록(high_water=현재 최대 created_at, 수, 날짜)
 *
 * 실행: cd web && npx tsx scripts/foodmap-checkpoint.ts [--new|--commit]
 */
import fs from 'fs';
import path from 'path';
import { createMapper } from '../lib/menuMapCore.ts';
import pool from '../public/ingredients-light.json' with { type: 'json' };

const CKPT = path.join(process.cwd(), 'lib/foodmap-checkpoint.json');
const mode = process.argv.includes('--commit') ? 'commit' : process.argv.includes('--new') ? 'new' : 'status';

function env(): Record<string, string> {
  const e: Record<string, string> = {};
  for (const l of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return e;
}
const E = env();
const URL = E.NEXT_PUBLIC_SUPABASE_URL, KEY = E.SUPABASE_SERVICE_ROLE_KEY || E.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const rest = async (q: string) => {
  const r = await fetch(`${URL}/rest/v1/${q}`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`REST ${r.status} ${await r.text()}`);
  return r.json();
};

function readCkpt(): { last_run: string | null; high_water_created_at: string | null; learned_menus_count: number; notes?: string } {
  try { return JSON.parse(fs.readFileSync(CKPT, 'utf-8')); }
  catch { return { last_run: null, high_water_created_at: null, learned_menus_count: 0 }; }
}

async function pullAll(filter = ''): Promise<{ menu: string; created_at: string }[]> {
  const rows: { menu: string; created_at: string }[] = [];
  for (let off = 0; off < 40000; off += 1000) {
    const j = await rest(`learned_menus?select=menu,created_at&order=created_at.asc&limit=1000&offset=${off}${filter}`) as any[];
    if (!j.length) break; rows.push(...j);
  }
  return rows;
}

const poolNames: string[] = (pool as any).ingredients.map((x: any) => x.nm);
const m = createMapper(poolNames);

(async () => {
  const ck = readCkpt();
  const all = await pullAll();
  const maxCreated = all.reduce((a, r) => (r.created_at > a ? r.created_at : a), '');
  const sinceFilter = ck.high_water_created_at ? `&created_at=gt.${encodeURIComponent(ck.high_water_created_at)}` : '';
  const newRows = ck.high_water_created_at ? all.filter((r) => r.created_at > ck.high_water_created_at!) : all;

  if (mode === 'status') {
    console.log('📍 foodmap 체크포인트');
    console.log('  last_run        :', ck.last_run || '(없음 — 최초)');
    console.log('  high_water       :', ck.high_water_created_at || '(없음)');
    console.log('  지난 기록 코퍼스 :', ck.learned_menus_count);
    console.log('  현재 코퍼스      :', all.length, `(현재 max created_at: ${maxCreated})`);
    console.log('  ⭐ 신규 유입 메뉴 :', newRows.length, '건 → `--new`로 분해 후보 확인');
    return;
  }

  if (mode === 'new') {
    const seen = new Set<string>();
    const unmapped: string[] = []; const undermap: { menu: string; out: string[]; missing: string[] }[] = [];
    for (const r of newRows) {
      if (!r.menu || seen.has(r.menu)) continue; seen.add(r.menu);
      const res = m.mapMenu(r.menu);
      if (!res) { unmapped.push(r.menu); continue; }
      const out = new Set(res.ingredients);
      const missing = m.scanIngredients(r.menu).filter((s) => !out.has(s));
      if (missing.length) undermap.push({ menu: r.menu, out: res.ingredients, missing });
    }
    console.log(`🆕 신규 유입(체크포인트 이후) 고유 메뉴: ${seen.size}`);
    console.log(`🔴 무매핑(LLM행) ${unmapped.length}:`, unmapped.slice(0, 40).join(' · ') || '(없음)');
    console.log(`🟡 이름엔 있으나 출력 누락(분해 후보) ${undermap.length}:`);
    undermap.slice(0, 60).forEach((d) => console.log(`   ${d.menu} [${d.out.join(',')}] ✗[${d.missing.join(',')}]`));
    console.log('\n→ 이 후보를 Part A3(검토·미세조정)에서 MENU_MAP/LEXICON에 반영 후 `--commit`.');
    return;
  }

  // commit
  const now = new Date().toISOString();
  const next = { last_run: now, high_water_created_at: maxCreated || ck.high_water_created_at, learned_menus_count: all.length,
    notes: '스킬 1회 완료 시점 — 다음 호출은 이 이후 created_at 메뉴만 신규로 본다' };
  fs.writeFileSync(CKPT, JSON.stringify(next, null, 2) + '\n');
  console.log('✅ 체크포인트 기록:', JSON.stringify(next));
})().catch((e) => { console.error(e.message || e); process.exit(1); });
