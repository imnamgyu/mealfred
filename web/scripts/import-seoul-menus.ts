/**
 * 서울 식단표 폴더 → OCR(live /api/ocr) → 기관 자동매칭 → 채점 → institution_scores 적재.
 * 폴더: /Users/ing/Downloads/서울/{구}/{어린이집|유치원}/{월}식단표.{pdf|jpg}
 * 매칭 3중: 폴더(구+유형) + 이미지 좌측상단 기관명(OCR) + 월(파일명/제목).
 * 실행: cd web && npx tsx scripts/import-seoul-menus.ts [--clear] [--limit=N] [--gu=광진구]
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { scoreInstitutionMonth, computeStandoutDims, buildMenuItemRows, type OcrMenuItem } from '../lib/institutionScore.ts';

const BASE = '/Users/ing/Downloads/서울';
const OCR_URL = 'https://app.mealfred.com/api/ocr';
const CONC = 4;
const TYPE: Record<string, string> = { '어린이집': 'daycare', '유치원': 'kindergarten' };
const NAME_RE = /([가-힣A-Za-z0-9·]+(?:어린이집|유치원))/;

const args = process.argv.slice(2);
const CLEAR = args.includes('--clear');
const LIMIT = parseInt((args.find(a => a.startsWith('--limit=')) || '').split('=')[1] || '0', 10);
const GU = (args.find(a => a.startsWith('--gu=')) || '').split('=')[1] || '';

function loadEnv() {
  const env: Record<string, string> = {};
  for (const l of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
}
const { url: URL_, key: KEY } = loadEnv();
const H: Record<string, string> = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const enc = encodeURIComponent;
async function rest(p: string) { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); return r.json(); }

// 월 파싱: OCR 제목('2025년 10월')·reason 우선 → 파일명 폴백 → bare 'N월'은 연도 추론(7~12=2025·1~6=2026)
function monthOf(ocrText: string, reason: string, filename: string): string | null {
  for (const s of [reason || '', ocrText || '', filename]) {
    let m = s.match(/(20\d{2})\s*[년\-.]\s*(\d{1,2})\s*월?/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    m = s.match(/\b(\d{2})\s*년\s*(\d{1,2})\s*월/); if (m) return `20${m[1]}-${m[2].padStart(2, '0')}`;
  }
  const m = filename.match(/(\d{1,2})\s*월/);
  if (m) { const mo = +m[1]; if (mo >= 1 && mo <= 12) return `${mo >= 7 ? 2025 : 2026}-${String(mo).padStart(2, '0')}`; }
  return null;
}

function toPng(file: string): string {
  const out = path.join(os.tmpdir(), 'imp_' + process.pid + '_' + Math.floor(Math.random() * 1e9));
  execSync(`pdftoppm -png -r 150 -f 1 -l 1 "${file}" "${out}"`, { stdio: 'ignore' });
  return out + '-1.png';
}

type OcrOut = { is_menu?: boolean; reason?: string; text?: string; items?: OcrMenuItem[] };
async function ocrFile(file: string): Promise<OcrOut> {
  let img = file, tmp: string | null = null;
  if (/\.pdf$/i.test(file)) { img = toPng(file); tmp = img; }
  try {
    const buf = fs.readFileSync(img);
    const fd = new FormData();
    fd.append('image', new Blob([buf], { type: img.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg' }), path.basename(img));
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 220000);
    try { const r = await fetch(OCR_URL, { method: 'POST', body: fd, signal: ctrl.signal }); return await r.json(); }
    finally { clearTimeout(t); }
  } finally { if (tmp) try { fs.unlinkSync(tmp); } catch { /* */ } }
}

async function matchInst(name: string, type: string, gu: string) {
  const norm = name.replace(/\s/g, '');
  let d = await rest(`institutions?select=id,name,type,sido,sigungu&type=eq.${type}&sigungu=eq.${enc(gu)}&name_norm=ilike.${enc('%' + norm + '%')}&limit=5`);
  let hit = (d || []).find((x: any) => x.name.replace(/\s/g, '') === norm) || (d || [])[0];
  if (hit) return hit;
  d = await rest(`institutions?select=id,name,type,sido,sigungu&type=eq.${type}&name_norm=ilike.${enc('%' + norm + '%')}&limit=8`);
  return (d || []).find((x: any) => x.name.replace(/\s/g, '') === norm) || (d || [])[0] || null;
}

async function main() {
  const hasStandout = (await fetch(`${URL_}/rest/v1/institution_scores?select=standout_dims&limit=1`, { headers: H })).ok;
  console.log(`standout_dims 컬럼: ${hasStandout ? '있음(직접 저장)' : '없음(백필 JSON 덤프)'} · clear=${CLEAR}`);

  if (CLEAR) {
    await fetch(`${URL_}/rest/v1/institution_menus?id=not.is.null`, { method: 'DELETE', headers: H });
    await fetch(`${URL_}/rest/v1/institution_scores?id=not.is.null`, { method: 'DELETE', headers: H });
    console.log('기존 institution_menus/scores 전체 삭제(깨끗이)');
  }

  // 파일 수집 — ⭐macOS 한글 파일명은 NFD(분해형) → 비교/표시는 NFC 정규화, 파일 접근은 raw 사용.
  const files: { file: string; gu: string; type: string; fn: string }[] = [];
  const NFC = (s: string) => s.normalize('NFC');
  const guWant = GU ? NFC(GU) : '';
  for (const guRaw of fs.readdirSync(BASE)) {
    const gu = NFC(guRaw);
    if (guWant && gu !== guWant) continue;
    const guPath = path.join(BASE, guRaw); if (!fs.statSync(guPath).isDirectory()) continue;
    for (const tyRaw of fs.readdirSync(guPath)) {
      const type = TYPE[NFC(tyRaw)]; if (!type) continue;
      const tyPath = path.join(guPath, tyRaw); if (!fs.statSync(tyPath).isDirectory()) continue;
      for (const fnRaw of fs.readdirSync(tyPath)) {
        if (!/\.(pdf|jpe?g|png)$/i.test(fnRaw)) continue;
        files.push({ file: path.join(tyPath, fnRaw), gu, type, fn: NFC(fnRaw) });
      }
    }
  }
  const targets = LIMIT ? files.slice(0, LIMIT) : files;
  console.log(`대상 ${targets.length}개 파일 (전체 ${files.length})`);

  // OCR (동시 CONC)
  const results: any[] = []; let done = 0;
  const q = [...targets];
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (q.length) {
      const f = q.shift()!;
      try {
        const d = await ocrFile(f.file);
        const reason = d.reason || '', text = d.text || '';
        const name = (reason.match(NAME_RE) || [])[1] || (text.match(NAME_RE) || [])[1] || null;
        results.push({ ...f, isMenu: !!d.is_menu, name, month: monthOf(text, reason, f.fn), items: Array.isArray(d.items) ? d.items : [] });
      } catch (e) { results.push({ ...f, error: String(e).slice(0, 80) }); }
      done++; if (done % 8 === 0 || done === targets.length) console.log(`  OCR ${done}/${targets.length}`);
    }
  }));

  // 폴더(구+유형)별 기관 확정 → 월별 채점·적재
  const byFolder: Record<string, any[]> = {};
  for (const r of results) (byFolder[`${r.gu}|${r.type}`] ||= []).push(r);
  const standoutDump: Record<string, unknown> = {};
  let inserted = 0; const insts = new Set<string>(); const skip: string[] = [];

  for (const k of Object.keys(byFolder)) {
    const [gu, type] = k.split('|'); const rs = byFolder[k];
    const nameCount: Record<string, number> = {};
    for (const r of rs) if (r.name) nameCount[r.name] = (nameCount[r.name] || 0) + 1;
    const repName = Object.entries(nameCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!repName) { skip.push(`${k}: 기관명 추출 실패(${rs.length}파일)`); continue; }
    const inst = await matchInst(repName, type, gu);
    if (!inst) { skip.push(`${k}: '${repName}' 디렉터리 매칭 실패`); continue; }
    insts.add(inst.id);

    const byMonth: Record<string, OcrMenuItem[]> = {};
    for (const r of rs) if (r.isMenu && r.month && r.items.length) (byMonth[r.month] ||= []).push(...r.items);
    for (const month of Object.keys(byMonth)) {
      const items = byMonth[month];
      const sc = scoreInstitutionMonth(items);
      if (sc.dayCount < 3) { skip.push(`${inst.name} ${month}: 표본<3일`); continue; }
      const dims = computeStandoutDims(items, month);
      standoutDump[`${inst.id}|${month}`] = dims;
      const mr = await (await fetch(`${URL_}/rest/v1/institution_menus?on_conflict=institution_id,month`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ institution_id: inst.id, month, source: 'seoul_import', updated_at: new Date().toISOString() }) })).json();
      const menuId = mr?.[0]?.id; if (!menuId) { skip.push(`${inst.name} ${month}: menus upsert 실패`); continue; }
      await fetch(`${URL_}/rest/v1/institution_menu_items?institution_menu_id=eq.${menuId}`, { method: 'DELETE', headers: H });
      const rows = buildMenuItemRows(items, month, menuId);
      if (rows.length) await fetch(`${URL_}/rest/v1/institution_menu_items`, { method: 'POST', headers: H, body: JSON.stringify(rows) });
      const score: Record<string, unknown> = { institution_id: inst.id, month, type, sido: inst.sido, sigungu: inst.sigungu, score: sc.score, diversity_base: sc.diversityBase, gate_cap: sc.gateCap, processed: sc.processed, repeat_pen: sc.repeat, red_groups: sc.redGroups, day_count: sc.dayCount, item_count: sc.itemCount, computed_at: new Date().toISOString() };
      if (hasStandout) score.standout_dims = dims;
      await fetch(`${URL_}/rest/v1/institution_scores?on_conflict=institution_id,month`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(score) });
      inserted++;
      console.log(`  ✓ ${inst.name}(${gu}·${type === 'daycare' ? '어' : '유'}) ${month} → ${sc.score}점 (${sc.dayCount}일)`);
    }
  }
  if (!hasStandout) { fs.writeFileSync(path.join(process.cwd(), 'scripts', '_standout_backfill.json'), JSON.stringify(standoutDump)); console.log(`\nstandout 백필 덤프: scripts/_standout_backfill.json (${Object.keys(standoutDump).length}개월)`); }
  console.log(`\n━━━ 완료: ${inserted}개월 적재 / ${insts.size}개 기관 / 스킵 ${skip.length} ━━━`);
  skip.forEach(s => console.log('   skip:', s));
}
main().catch((e) => { console.error(e); process.exit(1); });
