/**
 * 결정론 CLOVA 그리드 날짜매핑 프로토타입 — 비전(Sonnet) 없이 columnIndex+요일헤더로 메뉴→날짜.
 * 파서 본체는 lib/gridParse.mjs(단일 진실). 이 파일은 CLI 래퍼(CLOVA 호출 + 출력)만.
 * 실행: cd web && node scripts/grid-date-map.mjs <img...> [--verbose]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { parseImageTables, ymFromName } from './lib/gridParse.mjs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
const { CLOVA_OCR_URL, CLOVA_OCR_SECRET } = env;
const VERBOSE = process.argv.includes('--verbose');
const IMGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function toPng(file) { if (!/\.pdf$/i.test(file)) return [file]; const o = path.join(os.tmpdir(), 'gd' + process.pid + '_' + Math.floor(Math.random() * 1e9)); try { execSync(`pdftoppm -png -r 150 "${file}" "${o}"`, { stdio: 'ignore' }); } catch { return []; } const d = path.dirname(o), b = path.basename(o); return fs.readdirSync(d).filter((f) => f.startsWith(b + '-') && /\.png$/.test(f)).sort().map((f) => path.join(d, f)); }

async function clova(img) {
  const b64 = fs.readFileSync(img).toString('base64');
  const fmt = img.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
  const r = await fetch(CLOVA_OCR_URL, { method: 'POST', headers: { 'X-OCR-SECRET': CLOVA_OCR_SECRET, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 'V2', requestId: 'gd', timestamp: Date.now(), lang: 'ko', enableTableDetection: true, images: [{ format: fmt, name: 'm', data: b64 }] }) });
  return r.ok ? r.json() : null;
}

async function main() {
  for (const file of IMGS) {
    console.log(`\n━━━ ${path.basename(file)} ━━━`);
    const ymStr = ymFromName(file);
    const pages = toPng(file);
    const all = []; const allWarns = [];
    for (const img of pages) {
      const d = await clova(img); if (!d?.images?.[0]) continue;
      const { items, warns } = parseImageTables(d.images[0], ymStr);
      all.push(...items); allWarns.push(...warns);
    }
    // dedup (페이지 간)
    const seen = new Set(); const uniq = [];
    for (const it of all) { const k = `${it.date}|${it.slot}|${it.menu}`; if (seen.has(k)) continue; seen.add(k); uniq.push(it); }
    const dates = [...new Set(uniq.map((i) => i.date))].sort((a, b) => +a - +b);
    console.log(`  결정론 그리드: ${uniq.length}개 item · ${dates.length}일 (날짜 ${dates.slice(0, 12).join(',')}${dates.length > 12 ? '…' : ''})`);
    if (allWarns.length) console.log(`  ⚠️ 요일불일치: ${allWarns.slice(0, 3).join(' / ')}`);
    if (VERBOSE) uniq.slice(0, 14).forEach((it) => console.log(`     ${it.date}(${it.wd}) ${it.slot}: ${it.menu}`));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
