/**
 * P0 — 결정론 그리드 전수 커버리지 깨끗한 측정 (빌드플랜 P0-1).
 *   그동안 전수테스트가 ① 파일명 중복(같은 이름 다른 기관) ② CLOVA 난타 레이트리밋(429)로 오염 → 진짜 % 모름.
 *   여기선: 전체경로(zip index=1:1) dedup + CLOVA 캐시·쓰로틀 + 레이아웃별 실패 분류 → 깨끗한 커버리지 표.
 *
 *   분류: no_table(CLOVA 표0) · table_no_date(표는 되는데 날짜0=P1입력) · week_fallback(주차폴백 성공) · real_date(실날짜 성공)
 *   denom(정직) = baseline(Sonnet) is_menu=true 파일. grid 성공 = real_date ∪ week_fallback.
 *
 * 실행: cd web && node scripts/grid-coverage.mjs [--limit=N] [--only=jpg|pdf] [--maxpages=3] [--fresh]
 * 산출: /tmp/sikdan_grid/_coverage.json (per-file) + 콘솔 요약표 + 0-date 목록.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { parseImageTables, ymFromName } from './lib/gridParse.mjs';
import { clovaTables } from './lib/clovaGrid.mjs';

const ZIP = '/Users/ing/Downloads/식단표.zip';
const EXT_DIR = '/tmp/sikdan';            // 추출된 미디어 (NN.ext)
const BASE_DIR = '/tmp/sikdan_ocr';       // 라이브 OCR(Sonnet) 베이스라인 결과
const PNG_DIR = '/tmp/sikdan_grid_png';   // 그리드 측정용 래스터(이 하네스 전용·멱등)
const CACHE_DIR = '/tmp/sikdan_grid';     // CLOVA 표응답 캐시 + 산출물
const OUT = path.join(CACHE_DIR, '_coverage.json');

fs.mkdirSync(PNG_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

const args = process.argv.slice(2);
const LIMIT = +(args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0;
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const MAXPAGES = +(args.find((a) => a.startsWith('--maxpages=')) || '').split('=')[1] || 3;
const FRESH = args.includes('--fresh');

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
const CLOVA = { url: env.CLOVA_OCR_URL, secret: env.CLOVA_OCR_SECRET, cacheDir: FRESH ? null : CACHE_DIR, throttleMs: 1200 };

// ── 매니페스트: zip index → 풀패스(구/유형/월/파일) → 추출파일. (전체경로 dedup의 단일 진실) ──
function manifest() {
  const py = [
    'import zipfile, os, json',
    `z=zipfile.ZipFile(${JSON.stringify(ZIP)})`,
    'rows=[]',
    'for i,info in enumerate(z.infolist()):',
    '    if info.is_dir(): continue',
    '    try: name=info.filename.encode("cp437").decode("cp949")',
    '    except: name=info.filename',
    '    ext=os.path.splitext(name)[1].lower()',
    '    if ext not in (".jpg",".jpeg",".png",".pdf"): continue',
    `    f="${EXT_DIR}/%02d%s"%(i,ext)`,
    '    if not os.path.exists(f): continue',
    '    parts=name.split("/")',
    '    gu=parts[1] if len(parts)>2 else ""',
    '    typ=parts[2] if len(parts)>3 else (parts[1] if len(parts)>1 else "")',
    '    rows.append({"idx":i,"name":name,"gu":gu,"type":typ,"ext":ext,"file":f})',
    'print(json.dumps(rows, ensure_ascii=False))',
  ].join('\n');
  const pyFile = path.join(CACHE_DIR, '_manifest.py');
  fs.writeFileSync(pyFile, py);
  return JSON.parse(execSync(`python3 ${pyFile}`, { encoding: 'utf8', maxBuffer: 1 << 24 }));
}

// PDF → PNG 페이지(멱등, MAXPAGES 캡·초과 페이지는 로깅). jpg/png은 그대로.
function pages(entry) {
  if (entry.ext !== '.pdf') return { imgs: [entry.file], dropped: 0 };
  const base = path.join(PNG_DIR, String(entry.idx).padStart(2, '0'));
  let existing = fs.readdirSync(PNG_DIR).filter((f) => f.startsWith(path.basename(base) + '-') && f.endsWith('.png')).sort();
  if (!existing.length) {
    try { execSync(`pdftoppm -png -r 150 -f 1 -l ${MAXPAGES} "${entry.file}" "${base}"`, { stdio: 'ignore' }); } catch { return { imgs: [], dropped: 0 }; }
    existing = fs.readdirSync(PNG_DIR).filter((f) => f.startsWith(path.basename(base) + '-') && f.endsWith('.png')).sort();
  }
  // 실제 총 페이지 수 — 캡으로 누락된 게 있으면 로깅(무음 절단 금지)
  let total = existing.length;
  try { const info = execSync(`pdfinfo "${entry.file}" 2>/dev/null | grep -i '^Pages:'`, { encoding: 'utf8' }); const m = info.match(/Pages:\s*(\d+)/); if (m) total = +m[1]; } catch { /* pdfinfo 없으면 무시 */ }
  return { imgs: existing.map((f) => path.join(PNG_DIR, f)), dropped: Math.max(0, total - MAXPAGES) };
}

function baselineIsMenu(idx) {
  const f = path.join(BASE_DIR, `${String(idx).padStart(2, '0')}.json`);
  if (!fs.existsSync(f)) return null;
  try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return (d.pages || []).some((p) => p.is_menu); } catch { return null; }
}

async function main() {
  let man = manifest().filter((e) => !ONLY || e.ext === '.' + ONLY);
  if (LIMIT) man = man.slice(0, LIMIT);
  console.log(`전수 측정: ${man.length}개 파일 (maxpages=${MAXPAGES} · throttle=${CLOVA.throttleMs}ms · cache=${FRESH ? 'off' : CACHE_DIR})\n`);

  const results = [];
  const seenHash = new Map();   // 콘텐츠 해시 dedup (실측엔 없지만 정직하게 확인)
  let n = 0, liveCalls = 0, droppedPages = 0;
  for (const e of man) {
    n++;
    const { imgs, dropped } = pages(e);
    droppedPages += dropped;
    const all = []; const warns = []; let tableCount = 0; let best = 'none'; let anyFail = false; let pagesUsed = 0;
    for (const img of imgs) {
      const res = await clovaTables(img, CLOVA);
      if (!res.fromCache && res.status !== 'fail') liveCalls++;
      if (res.status === 'fail') { anyFail = true; continue; }
      pagesUsed++;
      tableCount += res.tables.length;
      if (res.tables.length) {
        const { items, warns: w, method } = parseImageTables(res.image, ymFromName(e.name));
        all.push(...items); warns.push(...w);
        if (method === 'real') best = 'real'; else if (method === 'fallback' && best !== 'real') best = 'fallback';
      }
    }
    // 파일 내 dedup
    const seen = new Set(); const uniq = [];
    for (const it of all) { const k = `${it.date}|${it.slot}|${it.menu}`; if (seen.has(k)) continue; seen.add(k); uniq.push(it); }
    const realDates = [...new Set(uniq.filter((i) => /^\d+$/.test(i.date)).map((i) => i.date))];
    const synDates = [...new Set(uniq.filter((i) => !/^\d+$/.test(i.date)).map((i) => i.date))];

    let cls;
    if (tableCount === 0) cls = anyFail && pagesUsed === 0 ? 'clova_fail' : 'no_table';
    else if (best === 'real') cls = 'real_date';
    else if (best === 'fallback') cls = 'week_fallback';
    else if (best === 'colspan') cls = 'colspan';
    else cls = 'table_no_menu';      // 표는 있는데 메뉴 0 (진짜 실패)

    const mismatch = warns.filter((w) => w.includes('≠')).length;
    const rec = { idx: e.idx, gu: e.gu, type: e.type, ext: e.ext.slice(1), name: e.name, baseMenu: baselineIsMenu(e.idx), cls, items: uniq.length, realDays: realDates.length, synDays: synDates.length, tableCount, mismatch, droppedPages: dropped };
    results.push(rec);
    const tag = { real_date: '✅실날짜', week_fallback: '🟡주차폴백', colspan: '🟦칸분산', table_no_menu: '🔴메뉴0', no_table: '⬛표없음', clova_fail: '❌CLOVA실패' }[cls];
    console.log(`[${n}/${man.length}] ${tag} ${e.gu}/${e.type} ${path.basename(e.name).slice(0, 30)} · item ${uniq.length} · 실${realDates.length}일${synDates.length ? '/합' + synDates.length : ''}${mismatch ? ' ⚠️요일' + mismatch : ''}`);
  }

  // ── 집계 ── 성공 = 메뉴 추출(실날짜∪주차폴백∪칸분산). 날짜는 best-effort.
  const OK = ['real_date', 'week_fallback', 'colspan'];
  const order = ['real_date', 'week_fallback', 'colspan', 'table_no_menu', 'no_table', 'clova_fail'];
  const label = { real_date: '✅ 실날짜(캘린더 보너스)', week_fallback: '🟡 주차합성', colspan: '🟦 칸분산', table_no_menu: '🔴 표O 메뉴0', no_table: '⬛ CLOVA 표0', clova_fail: '❌ CLOVA 실패' };
  const cnt = (rs, c) => rs.filter((r) => r.cls === c).length;
  const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';

  const denom = results.filter((r) => r.baseMenu === true);  // 정직 분모: Sonnet이 메뉴로 인정한 파일
  const gridOk = (rs) => rs.filter((r) => OK.includes(r.cls)).length;

  const section = (title, rs) => {
    console.log(`\n── ${title} (n=${rs.length}) ──`);
    for (const c of order) { const k = cnt(rs, c); if (k) console.log(`  ${label[c].padEnd(22)} ${String(k).padStart(3)}  ${pct(k, rs.length)}`); }
    console.log(`  ${'★ 메뉴추출 성공(실+합성+칸)'.padEnd(20)} ${String(gridOk(rs)).padStart(3)}  ${pct(gridOk(rs), rs.length)}`);
  };

  console.log('\n════════════ 결과 ════════════');
  section('전체', results);
  section('정직 분모: Sonnet=메뉴 인정 파일', denom);
  // 유형별
  for (const t of ['어린이집', '유치원']) section(`유형=${t}`, results.filter((r) => r.type === t));
  // 확장자별
  for (const x of ['jpg', 'pdf']) section(`확장자=${x}`, results.filter((r) => r.ext === x));

  // 잔여 실패 목록 = 메뉴 0 (표는 있으나 추출 0 + 표없음 + CLOVA실패)
  const fail = results.filter((r) => r.cls === 'table_no_menu' || r.cls === 'no_table' || r.cls === 'clova_fail')
    .sort((a, b) => a.cls.localeCompare(b.cls));
  console.log(`\n── 잔여 실패(메뉴0) · ${fail.length}건 ──`);
  for (const r of fail) console.log(`  [${r.cls}] idx${r.idx} ${r.gu}/${r.type} ${path.basename(r.name).slice(0, 36)} (표${r.tableCount}, base_menu=${r.baseMenu})`);

  // 요일 불일치(real_date인데 셀요일≠실제) = 밀림 의심
  const mm = results.filter((r) => r.cls === 'real_date' && r.mismatch);
  if (mm.length) console.log(`\n⚠️ 요일불일치 real_date ${mm.length}건(밀림 의심): ${mm.map((r) => 'idx' + r.idx).join(' ')}`);

  if (droppedPages) console.log(`\n📄 MAXPAGES=${MAXPAGES} 캡으로 누락된 PDF 페이지 합계: ${droppedPages} (메뉴가 뒤페이지면 P1에서 캡 상향 검토)`);
  console.log(`\n라이브 CLOVA 호출: ${liveCalls} · 캐시 적중 나머지`);

  fs.writeFileSync(OUT, JSON.stringify({ generatedFrom: man.length, maxpages: MAXPAGES, results, summary: { total: results.length, denom: denom.length, gridOkAll: gridOk(results), gridOkDenom: gridOk(denom) } }, null, 2));
  console.log(`\n저장: ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
