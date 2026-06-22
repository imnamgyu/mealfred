/**
 * 전체 institution_menus를 '저장된 menu_items'에서 재구성 → scoreInstitutionMonth + computeStandoutDims 재계산
 * → institution_scores 갱신(③ 재채점 + ① standout_dims 채움 = '빛나는 강점' 켜기). 결정론·노이즈 0(재OCR 없음).
 * ⚠️ standout_dims 컬럼이 있어야 함 — 먼저 SQL: alter table institution_scores add column if not exists standout_dims jsonb default '{}';
 * 실행: cd web && npx tsx scripts/rescore-standout.ts [--dry]
 */
import fs from 'fs';
import path from 'path';
import { scoreInstitutionMonth, computeStandoutDims, computeSevenAxes, type OcrMenuItem } from '../lib/institutionScore.ts';

function loadEnv(): { url: string; key: string } {
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
}
const { url: URL_, key: KEY } = loadEnv();
const H: Record<string, string> = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const DRY = process.argv.includes('--dry');

async function fetchAll<T = any>(table: string, qs: string): Promise<T[]> {
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

async function main() {
  const probe = await fetch(`${URL_}/rest/v1/institution_scores?select=standout_dims&limit=1`, { headers: H });
  if (!probe.ok) {
    const t = await probe.text();
    console.error('❌ standout_dims 컬럼이 없습니다 — ALTER 먼저 적용하세요.\n  ', t.slice(0, 200));
    process.exit(2);
  }

  const menus = await fetchAll<{ id: string; institution_id: string; month: string }>('institution_menus', 'select=id,institution_id,month');
  console.log(`institution_menus ${menus.length}건 재채점${DRY ? ' (dry-run)' : ''}\n`);

  let updated = 0, miss = 0; const scores: number[] = [];
  for (const m of menus) {
    const rows = await fetchAll<{ menu_date: string | null; slot: string; menus: string[] | null }>('institution_menu_items', `select=menu_date,slot,menus&institution_menu_id=eq.${m.id}`);
    const items: OcrMenuItem[] = [];
    for (const r of rows) for (const menu of (r.menus || [])) items.push({ date: r.menu_date, slot: r.slot, menu });
    if (!items.length) { miss++; continue; }

    const sc = scoreInstitutionMonth(items);
    const dims = computeStandoutDims(items, m.month);
    const axes = computeSevenAxes(items, m.month);
    scores.push(sc.score);
    if (DRY) { console.log(`  ${m.institution_id.slice(0, 8)} ${m.month}: ${sc.score}점 (${sc.dayCount}일) fish${dims.fishFrequency} 콩${dims.legumeFrequency} 채소${dims.vegVariety}`); continue; }

    const patch = {
      score: sc.score, diversity_base: sc.diversityBase, gate_cap: sc.gateCap,
      processed: sc.processed, repeat_pen: sc.repeat, red_groups: sc.redGroups,
      day_count: sc.dayCount, item_count: sc.itemCount, standout_dims: dims, axes,
      computed_at: new Date().toISOString(),
    };
    const r = await fetch(`${URL_}/rest/v1/institution_scores?institution_id=eq.${m.institution_id}&month=eq.${encodeURIComponent(m.month)}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
    });
    if (r.ok) updated++; else console.error(`  PATCH 실패 ${m.institution_id.slice(0, 8)} ${m.month}:`, (await r.text()).slice(0, 120));
  }

  if (scores.length) {
    const s = [...scores].sort((a, b) => a - b); const n = s.length;
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    console.log(`\n점수 분포: min ${s[0]} · 중앙값 ${s[Math.floor(n / 2)]} · max ${s[n - 1]} · 평균 ${mean.toFixed(1)} (n=${n})`);
  }
  console.log(`\n━━━ ${DRY ? 'dry-run' : '완료'}: ${updated}건 갱신 · 빈 menus ${miss}건 ━━━`);
}
main().catch((e) => { console.error(e); process.exit(1); });
