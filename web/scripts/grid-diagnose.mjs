/**
 * 캐시된 CLOVA 표응답에서 셀을 덤프 + 파서 진단 (네트워크 0 — /tmp/sikdan_grid 캐시만 사용).
 *   P0 분류 적대검증 + P1 0-date 레이아웃 진단용. "표는 되는데 날짜0"이 왜 0인지 셀 표기로 확인.
 * 실행: cd web && node scripts/grid-diagnose.mjs <idx...> [--rows=8]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { cellsOf, gridToItems, ymFromName } from './lib/gridParse.mjs';

const EXT_DIR = '/tmp/sikdan';
const PNG_DIR = '/tmp/sikdan_grid_png';
const CACHE_DIR = '/tmp/sikdan_grid';
const COV = path.join(CACHE_DIR, '_coverage.json');

const args = process.argv.slice(2);
const ROWS = +(args.find((a) => a.startsWith('--rows=')) || '').split('=')[1] || 8;
const IDXS = args.filter((a) => !a.startsWith('--')).map(Number);

const cov = fs.existsSync(COV) ? JSON.parse(fs.readFileSync(COV, 'utf8')).results : [];
const nameOf = (idx) => (cov.find((r) => r.idx === idx) || {}).name || '';

const hashFile = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

function imgsFor(idx) {
  const p2 = String(idx).padStart(2, '0');
  const direct = fs.readdirSync(EXT_DIR).filter((f) => f.startsWith(p2 + '.') && /\.(jpg|jpeg|png)$/i.test(f));
  if (direct.length) return direct.map((f) => path.join(EXT_DIR, f));   // jpg 단일
  if (fs.existsSync(PNG_DIR)) return fs.readdirSync(PNG_DIR).filter((f) => f.startsWith(p2 + '-') && f.endsWith('.png')).sort().map((f) => path.join(PNG_DIR, f));
  return [];
}

function loadCache(img) {
  const cf = path.join(CACHE_DIR, hashFile(img) + '.json');
  if (!fs.existsSync(cf)) return null;
  try { return JSON.parse(fs.readFileSync(cf, 'utf8')); } catch { return null; }
}

for (const idx of IDXS) {
  const name = nameOf(idx);
  console.log(`\n════ idx${idx} ${name} ════`);
  const imgs = imgsFor(idx);
  if (!imgs.length) { console.log('  (이미지/페이지 없음)'); continue; }
  const ym = ymFromName(name);
  const fileItems = [];
  for (const img of imgs) {
    const image = loadCache(img);
    if (!image) { console.log(`  ${path.basename(img)} — 캐시없음(먼저 grid-coverage 실행)`); continue; }
    const tables = image.tables || [];
    console.log(`  ── ${path.basename(img)} · tables=${tables.length} · fields=${(image.fields || []).length}`);
    tables.forEach((t, ti) => {
      const cells = cellsOf(t);
      const rows = {}; for (const c of cells) (rows[c.r] = rows[c.r] || []).push(c);
      const rk = Object.keys(rows).map(Number).sort((a, b) => a - b);
      const maxCol = Math.max(0, ...cells.map((c) => c.col));
      console.log(`     table#${ti}: 행 ${rk.length} · 최대열 ${maxCol} · 셀 ${cells.length}`);
      for (const r of rk.slice(0, ROWS)) {
        console.log('      r' + r + ': ' + rows[r].sort((a, b) => a.col - b.col).map((c) => `[${c.col}${c.cs > 1 ? 'x' + c.cs : ''}]${c.txt || '·'}`).join(' ').slice(0, 220));
      }
      const { items, method, warns } = gridToItems(cells, ym);
      fileItems.push(...items);
      console.log(`     → method=${method} · items=${items.length}${warns.length ? ' · warns=' + warns.slice(0, 2).join(';') : ''}`);
    });
  }
  // 파일 전체 날짜 분포 — 가짜 날짜(영업일 초과·합성 과다) 진단
  const byD = {}; for (const it of fileItems) (byD[it.date] ||= []).push(it.menu);
  const real = Object.keys(byD).filter((d) => /^\d+$/.test(d)).sort((a, b) => +a - +b);
  const syn = Object.keys(byD).filter((d) => !/^\d+$/.test(d));
  console.log(`  ▶ 날짜 분포: 실날짜 ${real.length}개 [${real.map((d) => `${d}(${byD[d].length})`).join(' ')}]${syn.length ? ` · 합성 ${syn.length}개 [${syn.slice(0, 12).join(' ')}]` : ''}`);
}
