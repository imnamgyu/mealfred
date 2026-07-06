/**
 * 사촌 음식 추천 데이터 빌드(일회성·이사님 2026-07-06) — deploy/cousin-data.json 생성.
 * institution_menu_items(288k행) 전량 → 기관유형(어린이집/유치원)별 메뉴 등장빈도 집계
 * → 상위 메뉴를 결정론 매퍼(mapMenuLocal)로 식재료 분해 → 정적 JSON.
 * 실행: cd web && npx tsx scripts/_cousin_build.mts
 */
import { createClient } from '@supabase/supabase-js';
import { mapMenuLocal } from '../lib/menuMap';
import fs from 'fs';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const norm = (s: string) => s.replace(/[*＊]+/g, '').replace(/\s+/g, ' ').trim();
// 추천 후보에서 제외할 상시 기본 메뉴(사촌으로 추천해봤자 무의미)
const STOP = /^(백미밥|쌀밥|잡곡밥|현미밥|기장밥|보리밥|흑미밥|친환경.*밥|.*김치|깍두기|물|우유|백김치|요구르트|요거트)$/;

async function all<T>(pager: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>): Promise<T[]> {
  const first = await pager(0, 999);
  if (first.error) throw new Error(first.error.message);
  const rows: T[] = [...(first.data || [])];
  if (rows.length < 1000) return rows;
  const total = first.count ?? 0;
  const pages = Math.ceil(total / 1000);
  const CHUNK = 12;
  for (let p = 1; p < pages; p += CHUNK) {
    const batch = await Promise.all(Array.from({ length: Math.min(CHUNK, pages - p) }, (_, j) =>
      pager((p + j) * 1000, (p + j + 1) * 1000 - 1)));
    for (const b of batch) { if (b.error) throw new Error(b.error.message); rows.push(...(b.data || [])); }
    if ((p - 1) % 48 === 0) console.log(`  …${rows.length}행`);
  }
  return rows;
}

(async () => {
  console.log('1) 기관 유형 로드');
  const insts = await all<{ id: string; type: string }>((f, t) =>
    db.from('institutions').select('id,type', { count: 'exact' }).in('type', ['daycare', 'kindergarten']).order('id').range(f, t));
  const typeOf = new Map(insts.map((i) => [i.id, i.type]));
  console.log('   어린이집/유치원 기관:', insts.length);

  console.log('2) 기관-월 메뉴 로드');
  const menus = await all<{ id: string; institution_id: string }>((f, t) =>
    db.from('institution_menus').select('id,institution_id', { count: 'exact' }).order('id').range(f, t));
  const menuType = new Map<string, string>();
  for (const m of menus) { const ty = typeOf.get(m.institution_id); if (ty) menuType.set(m.id, ty); }
  console.log('   기관-월:', menus.length, '· 유형 매칭:', menuType.size);

  console.log('3) 식단 아이템 전량 순회(288k · keyset — 깊은 offset은 statement timeout)');
  const items: { institution_menu_id: string; menus: string[] | null }[] = [];
  let cursor = '';
  for (;;) {
    let q = db.from('institution_menu_items').select('id,institution_menu_id,menus').order('id').limit(1000);
    if (cursor) q = q.gt('id', cursor);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data as { id: string; institution_menu_id: string; menus: string[] | null }[]) items.push(r);
    cursor = (data[data.length - 1] as { id: string }).id;
    if (items.length % 50000 < 1000) console.log(`  …${items.length}행`);
    if (data.length < 1000) break;
  }
  console.log('   아이템 행:', items.length);

  const freq: Record<string, Record<string, number>> = { daycare: {}, kindergarten: {} };
  for (const it of items) {
    const ty = menuType.get(it.institution_menu_id);
    if (!ty || !it.menus) continue;
    for (const raw of it.menus) {
      const m = norm(raw);
      if (m.length < 2 || m.length > 22 || STOP.test(m)) continue;
      freq[ty][m] = (freq[ty][m] || 0) + 1;
    }
  }

  const TOP = 700;
  const out: { v: number; built: string; types: Record<string, Record<string, { f: number; i: string[] }>> } =
    { v: 1, built: new Date().toISOString().slice(0, 10), types: {} };
  for (const ty of ['daycare', 'kindergarten'] as const) {
    const top = Object.entries(freq[ty]).sort((a, b) => b[1] - a[1]).slice(0, TOP);
    const rec: Record<string, { f: number; i: string[] }> = {};
    for (const [name, f] of top) {
      const mapped = mapMenuLocal(name);
      const ings = (mapped?.ingredients || []).slice(0, 8);
      if (ings.length === 0) continue;                 // 식재료 미상 메뉴는 추천 근거를 못 대므로 제외
      rec[name] = { f, i: ings };
    }
    out.types[ty] = rec;
    console.log(`   ${ty}: 상위 ${top.length} → 식재료 확보 ${Object.keys(rec).length}메뉴`);
  }

  const path = new URL('../../cousin-data.json', import.meta.url).pathname;
  fs.writeFileSync(path, JSON.stringify(out));
  console.log('완료 →', path, Math.round(fs.statSync(path).size / 1024) + 'KB');
})();
