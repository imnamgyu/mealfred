/**
 * grid(CLOVA 결정론) vs Sonnet 비전 — 정확도 비교 (이사님 2026-06-23).
 *   "Sonnet 비전을 빼고 grid만 써도 영양평가가 같은가?"를 3단계로 검증:
 *     ① 메뉴 텍스트 집합 precision/recall  ② 식재료 집합 P/R(mapMenuLocal·영양평가 입력)  ③ 영양점수(scoreInstitutionMonth) 차이
 *   날짜는 무시(점수 변별력 0). grid = 재구축 파서 + 캐시된 CLOVA. Sonnet = 라이브 OCR 베이스라인(/tmp/sikdan_ocr).
 * 실행: cd web && npx tsx scripts/grid-vs-sonnet.ts [--worst=12]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseImageTables, ymFromName } from './lib/gridParse.mjs';
import { mapMenuLocal } from '../lib/menuMap.ts';
import { scoreInstitutionMonth } from '../lib/institutionScore.ts';

const EXT_DIR = '/tmp/sikdan', PNG_DIR = '/tmp/sikdan_grid_png', CACHE_DIR = '/tmp/sikdan_grid', BASE = '/tmp/sikdan_ocr';
const WORST = +(process.argv.find((a) => a.startsWith('--worst=')) || '').split('=')[1] || 10;
const cov = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, '_coverage.json'), 'utf8')).results as { idx: number; name: string; type: string; baseMenu: boolean | null }[];

type Item = { date?: string; day?: string; slot?: string; menu?: string };
const hashFile = (f: string) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

function imgsFor(idx: number): string[] {
  const p2 = String(idx).padStart(2, '0');
  const direct = fs.readdirSync(EXT_DIR).filter((f) => f.startsWith(p2 + '.') && /\.(jpg|jpeg|png)$/i.test(f));
  if (direct.length) return direct.map((f) => path.join(EXT_DIR, f));
  if (fs.existsSync(PNG_DIR)) return fs.readdirSync(PNG_DIR).filter((f) => f.startsWith(p2 + '-') && f.endsWith('.png')).sort().map((f) => path.join(PNG_DIR, f));
  return [];
}
function loadCache(img: string): any {
  const cf = path.join(CACHE_DIR, hashFile(img) + '.json');
  if (!fs.existsSync(cf)) return null;
  try { return JSON.parse(fs.readFileSync(cf, 'utf8')); } catch { return null; }
}
function gridItems(idx: number, name: string): Item[] {
  const all: Item[] = [];
  for (const img of imgsFor(idx)) { const image = loadCache(img); if (!image) continue; all.push(...parseImageTables(image, ymFromName(name)).items); }
  const seen = new Set<string>(); const uniq: Item[] = [];
  for (const it of all) { const k = `${it.date}|${it.slot}|${it.menu}`; if (seen.has(k)) continue; seen.add(k); uniq.push(it); }
  return uniq;
}
function sonnetItems(idx: number): Item[] {
  const f = path.join(BASE, `${String(idx).padStart(2, '0')}.json`);
  if (!fs.existsSync(f)) return [];
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return (d.pages || []).flatMap((p: any) => p.items || []);
}

const normMenu = (m?: string) => (m || '').replace(/\([^)]*\)/g, '').replace(/[0-9.\s①-⑳★☆※&·]/g, '').toLowerCase();
const menuSet = (items: Item[]) => new Set(items.map((it) => normMenu(it.menu)).filter((x) => x.length >= 2));
const ingSet = (items: Item[]) => { const s = new Set<string>(); for (const it of items) { const r = mapMenuLocal(String(it.menu || '')); for (const g of (r?.ingredients || [])) s.add(g); } return s; };
function pr(gold: Set<string>, pred: Set<string>) {
  const inter = [...pred].filter((x) => gold.has(x)).length;
  return { recall: gold.size ? [...gold].filter((x) => pred.has(x)).length / gold.size : 1, precision: pred.size ? inter / pred.size : 1, gold: gold.size, pred: pred.size };
}

const denom = cov.filter((r) => r.baseMenu === true);
const rows = denom.map((r) => {
  const g = gridItems(r.idx, r.name), s = sonnetItems(r.idx);
  const mp = pr(menuSet(s), menuSet(g));            // gold=sonnet
  const ip = pr(ingSet(s), ingSet(g));
  const SG = scoreInstitutionMonth(g as any) as any, SS = scoreInstitutionMonth(s as any) as any;
  const sg = SG.score, ss = SS.score;
  return { idx: r.idx, type: r.type, name: path.basename(r.name).slice(0, 30), gN: g.length, sN: s.length, mp, ip, sg, ss, diff: sg - ss, SG, SS };
});

const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const fmt = (x: number) => (100 * x).toFixed(1) + '%';

console.log(`\n════ grid(CLOVA 결정론) vs Sonnet 비전 — ${rows.length}파일(정직분모) ════\n`);
console.log('① 메뉴 텍스트 집합 (정확매칭, grid=CLOVA원문이라 표기차 불리):');
console.log(`   recall ${fmt(avg(rows.map((r) => r.mp.recall)))} · precision ${fmt(avg(rows.map((r) => r.mp.precision)))}`);
console.log('② 식재료 집합 (mapMenuLocal — 영양평가 입력, 표기차 흡수):');
console.log(`   recall ${fmt(avg(rows.map((r) => r.ip.recall)))} · precision ${fmt(avg(rows.map((r) => r.ip.precision)))}`);
console.log('③ 영양점수 (scoreInstitutionMonth · daycareMode):');
const absdiff = rows.map((r) => Math.abs(r.diff));
console.log(`   평균 절대차 ${avg(absdiff).toFixed(2)}점 · 중앙값 ${absdiff.slice().sort((a, b) => a - b)[Math.floor(absdiff.length / 2)]}점`);
console.log(`   |diff|=0: ${fmt(rows.filter((r) => r.diff === 0).length / rows.length)} · ≤3점: ${fmt(rows.filter((r) => Math.abs(r.diff) <= 3).length / rows.length)} · ≤5점: ${fmt(rows.filter((r) => Math.abs(r.diff) <= 5).length / rows.length)} · ≤10점: ${fmt(rows.filter((r) => Math.abs(r.diff) <= 10).length / rows.length)}`);
console.log(`   grid 평균점수 ${avg(rows.map((r) => r.sg)).toFixed(1)} vs Sonnet ${avg(rows.map((r) => r.ss)).toFixed(1)}`);

console.log(`\n── 식재료 recall 낮은 ${WORST}건(grid가 Sonnet 식재료를 못 잡은) ──`);
for (const r of rows.slice().sort((a, b) => a.ip.recall - b.ip.recall).slice(0, WORST))
  console.log(`  idx${r.idx} ${r.type} ${r.name} · ing R ${fmt(r.ip.recall)} P ${fmt(r.ip.precision)} (S ${r.ip.gold}종/G ${r.ip.pred}종) · 점수 g${r.sg}/s${r.ss}(${r.diff > 0 ? '+' : ''}${r.diff})`);

console.log(`\n── 영양점수 차이 큰 ${WORST}건 (분해: base=다양성 cap=게이트 proc=가공패널티 rep=반복패널티 days=날수 items=메뉴수) ──`);
for (const r of rows.slice().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, WORST)) {
  console.log(`  idx${r.idx} ${r.type} ${r.name} · 점수 g${r.sg}/s${r.ss}(${r.diff > 0 ? '+' : ''}${r.diff}) ingR ${fmt(r.ip.recall)}`);
  console.log(`        base g${r.SG.diversityBase}/s${r.SS.diversityBase} · cap g${r.SG.gateCap}/s${r.SS.gateCap} · proc g${r.SG.processed}/s${r.SS.processed} · rep g${r.SG.repeat}/s${r.SS.repeat} · days g${r.SG.dayCount}/s${r.SS.dayCount} · items g${r.SG.itemCount}/s${r.SS.itemCount}`);
}

// 항목별 평균 차이 — 어느 요소가 점수를 깎나
const dAvg = (sel: (x: any) => number) => avg(rows.map((r) => sel(r.SG) - sel(r.SS)));
console.log(`\n── 점수 항목별 평균차(grid - sonnet) — 음수=grid가 손해 ──`);
console.log(`  diversityBase ${dAvg((x) => x.diversityBase).toFixed(1)} · gateCap ${dAvg((x) => x.gateCap).toFixed(1)} · processed ${dAvg((x) => x.processed).toFixed(1)} · repeat ${dAvg((x) => x.repeat).toFixed(1)} · dayCount ${dAvg((x) => x.dayCount).toFixed(1)} · itemCount ${dAvg((x) => x.itemCount).toFixed(1)}`);

fs.writeFileSync(path.join(CACHE_DIR, '_vs_sonnet.json'), JSON.stringify(rows, null, 2));
console.log(`\n저장: ${CACHE_DIR}/_vs_sonnet.json`);
