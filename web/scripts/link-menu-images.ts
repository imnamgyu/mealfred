/**
 * 원본 식단표 이미지 → Supabase storage 업로드 + institution_menus.image_url 연결(어드민 상세 사진용).
 * 재OCR 안 함 — 폴더(구/유형) + 파일명 월로 기존 (institution, month) 매칭해 이미지만 붙임. PDF는 1쪽 PNG 변환.
 * ⚠️ image_url 컬럼 필요: alter table institution_menus add column if not exists image_url text;
 * 실행: cd web && npx tsx scripts/link-menu-images.ts [--dry]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const BASE = '/Users/ing/Downloads/서울';
const TYPE: Record<string, string> = { '어린이집': 'daycare', '유치원': 'kindergarten' };
const DRY = process.argv.includes('--dry');
const NFC = (s: string) => s.normalize('NFC');

function loadEnv() {
  const env: Record<string, string> = {};
  for (const l of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
}
const { url: URL_, key: KEY } = loadEnv();
const H: Record<string, string> = { apikey: KEY, authorization: `Bearer ${KEY}` };

function monthOf(fn: string): string | null {
  let m = fn.match(/(20\d{2})\s*[년\-.]?\s*(\d{1,2})\s*월/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = fn.match(/\b(\d{2})\s*년\s*(\d{1,2})\s*월/); if (m) return `20${m[1]}-${m[2].padStart(2, '0')}`;
  m = fn.match(/(\d{1,2})\s*월/); if (m) { const mo = +m[1]; if (mo >= 1 && mo <= 12) return `${mo >= 7 ? 2025 : 2026}-${String(mo).padStart(2, '0')}`; }
  return null;
}
function toPngAll(file: string): string[] {
  const out = path.join(os.tmpdir(), 'lk_' + process.pid + '_' + Math.floor(Math.random() * 1e9));
  execSync(`pdftoppm -png -r 150 "${file}" "${out}"`, { stdio: 'ignore' });   // 전 페이지(다페이지 식단표)
  const dir = path.dirname(out), base = path.basename(out);
  return fs.readdirSync(dir).filter((f) => f.startsWith(base + '-') && /\.png$/i.test(f)).sort().map((f) => path.join(dir, f));
}

async function fetchAll(table: string, qs: string): Promise<any[]> {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${table}?${qs}&offset=${off}&limit=1000`, { headers: { ...H, 'content-type': 'application/json' } });
    const d = await r.json(); if (!Array.isArray(d)) break; out.push(...d); if (d.length < 1000) break;
  }
  return out;
}

async function main() {
  // (sigungu|type|month) → institution_id (institution_scores 기준)
  const scores = await fetchAll('institution_scores', 'select=institution_id,month,sigungu,type');
  const key2inst: Record<string, string> = {};
  for (const s of scores) key2inst[`${s.sigungu}|${s.type}|${s.month}`] = s.institution_id;
  console.log(`적재된 (구·유형·월) ${Object.keys(key2inst).length}개 매칭표 구축`);

  let linked = 0, skip = 0; const skips: string[] = [];
  for (const guRaw of fs.readdirSync(BASE)) {
    const gu = NFC(guRaw); const guPath = path.join(BASE, guRaw);
    if (!fs.statSync(guPath).isDirectory()) continue;
    for (const tyRaw of fs.readdirSync(guPath)) {
      const type = TYPE[NFC(tyRaw)]; if (!type) continue;
      const tyPath = path.join(guPath, tyRaw); if (!fs.statSync(tyPath).isDirectory()) continue;
      for (const fnRaw of fs.readdirSync(tyPath)) {
        if (!/\.(pdf|jpe?g|png)$/i.test(fnRaw)) continue;
        const fn = NFC(fnRaw); const month = monthOf(fn);
        const inst = month ? key2inst[`${gu}|${type}|${month}`] : null;
        if (!inst) { skip++; skips.push(`${gu}/${tyRaw}/${fn} → 월 ${month || '?'} 매칭없음`); continue; }
        const file = path.join(tyPath, fnRaw);
        let imgs: string[]; const tmps: string[] = [];
        if (/\.pdf$/i.test(file)) { try { imgs = toPngAll(file); tmps.push(...imgs); } catch { skip++; continue; } }
        else imgs = [file];
        const urls: string[] = [];
        if (!DRY) {
          for (let pi = 0; pi < imgs.length; pi++) {
            const img = imgs[pi]; const isPng = img.toLowerCase().endsWith('.png');
            const objPath = `eval-photos/inst_${inst}_${month}_p${pi + 1}.${isPng ? 'png' : 'jpg'}`;
            const buf = fs.readFileSync(img);
            const up = await fetch(`${URL_}/storage/v1/object/eval-uploads/${objPath}`, { method: 'POST', headers: { ...H, 'content-type': isPng ? 'image/png' : 'image/jpeg', 'x-upsert': 'true' }, body: buf });
            if (up.ok || up.status === 200) urls.push(`${URL_}/storage/v1/object/public/eval-uploads/${objPath}`);
            else console.log(`  업로드 실패 ${objPath}: ${up.status}`);
          }
          const pat = await fetch(`${URL_}/rest/v1/institution_menus?institution_id=eq.${inst}&month=eq.${encodeURIComponent(month!)}`, {
            method: 'PATCH', headers: { ...H, 'content-type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ image_urls: urls }),
          });
          if (!pat.ok) { console.log(`  PATCH 실패: ${pat.status} ${(await pat.text()).slice(0, 100)}`); }
        }
        for (const t of tmps) try { fs.unlinkSync(t); } catch { /* */ }
        linked++;
        if (linked % 10 === 0 || DRY) console.log(`  ✓ ${gu}/${type === 'daycare' ? '어' : '유'} ${month} → ${imgs.length}쪽`);
      }
    }
  }
  console.log(`\n━━━ ${DRY ? 'dry-run' : '완료'}: ${linked}개 연결 · 스킵 ${skip} ━━━`);
  skips.slice(0, 12).forEach((s) => console.log('   skip:', s));
}
main().catch((e) => { console.error(e); process.exit(1); });
