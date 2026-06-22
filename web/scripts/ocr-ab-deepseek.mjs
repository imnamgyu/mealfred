/**
 * OCR 비전 A/B — 동일 입력(CLOVA 텍스트 + 원본 이미지 + 동일 프롬프트)으로
 *   Sonnet(현재) vs DeepSeek-OCR-2 / DeepSeek-VL2 의 '날짜 매핑' 성능 비교.
 * 기준 진실 = Sonnet(현재 채택). DeepSeek가 Sonnet의 (날짜·끼니·메뉴) 매핑을 얼마나 재현하나.
 * 실행: cd web && node scripts/ocr-ab-deepseek.mjs <img...> [--models=ocr2,vl2] [--verbose]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
const { ANTHROPIC_API_KEY, DEEPINFRA_API_KEY, CLOVA_OCR_URL, CLOVA_OCR_SECRET } = env;

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const MODELS_ARG = (args.find((a) => a.startsWith('--models=')) || '--models=ocr,janus,qwen').split('=')[1].split(',');
const LIST = (args.find((a) => a.startsWith('--list=')) || '').split('=')[1];
let IMGS = args.filter((a) => !a.startsWith('--'));
if (LIST) IMGS = fs.readFileSync(LIST, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const DS_MODEL = {
  ocr: 'deepseek-ai/DeepSeek-OCR',            // DeepSeek 전사 OCR
  janus: 'deepseek-ai/Janus-Pro-7B',          // DeepSeek 비전언어(VLM)
  qwen: 'Qwen/Qwen3-VL-30B-A3B-Instruct',     // 저가 강력 VLM 대안
  qwenbig: 'Qwen/Qwen3-VL-235B-A22B-Instruct',// 최강 VLM 대안
};

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['is_menu', 'items'],
  properties: {
    is_menu: { type: 'boolean' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'day', 'slot', 'menu'], properties: { date: { type: 'string' }, day: { type: 'string' }, slot: { type: 'string' }, menu: { type: 'string' } } } },
  },
};

const PROMPT = `첨부한 **이미지**는 어린이집·유치원·학교 급식 식단표(달력)이고, 아래 [OCR 추출 텍스트]는 그 이미지를 네이버 OCR로 읽은 것입니다. 표의 열은 날짜/요일(월화수목금), 행은 끼니(오전간식·점심·오후간식)입니다.
- **메뉴명 글자**는 [OCR 추출 텍스트]를 신뢰(이미지보다 글자 정확).
- **각 메뉴가 어느 날짜(요일 열)에 속하는지는 반드시 이미지의 표 칸 위치로 판단**. OCR 텍스트는 빈 칸이 무너져 날짜가 밀릴 수 있으니 날짜는 이미지로 정합.
날짜 매핑 규칙:
A. 각 메뉴를 이미지에서 그 메뉴가 놓인 요일 열 맨 위 날짜 숫자에 매핑.
B. 급식 없는 날(공휴일·잔반없는날 등 빈 칸)은 건너뛰고, 빈 칸 무시한 채 오른쪽 칸 메뉴를 왼쪽으로 당기지 말 것.
C. item의 day가 date의 헤더 요일과 일치하는지 교차검증.
규칙: 실제 메뉴만. 알레르겐 숫자코드 무시. 칼로리·원산지·공휴일표기 제외. 메뉴 하나당 item 하나(콤마로 합치지 말 것). slot은 오전간식/점심/오후간식.
**오직 JSON만 출력**: {"is_menu":true, "items":[{"date":"날짜숫자 1~31","day":"요일","slot":"오전간식|점심|오후간식","menu":"메뉴명"}...]}. 식단표 아니면 {"is_menu":false,"items":[]}.`;

function toPng(file) {
  const out = path.join(os.tmpdir(), 'ab_' + process.pid + '_' + Math.floor(Math.random() * 1e9));
  execSync(`pdftoppm -png -r 150 -f 1 -l 1 "${file}" "${out}"`, { stdio: 'ignore' });
  return out + '-1.png';
}

function reconstructText(clova) {
  const image = clova?.images?.[0]; if (!image) return '';
  let out = '';
  for (const tbl of image.tables || []) {
    const rows = {};
    for (const c of tbl.cells || []) {
      const r = typeof c.rowIndex === 'number' ? c.rowIndex : 0, col = typeof c.columnIndex === 'number' ? c.columnIndex : 0;
      const txt = (c.cellTextLines || []).map((ln) => (ln.cellWords || []).map((w) => w.inferText || '').join(' ')).join(' ').trim();
      (rows[r] = rows[r] || []).push({ col, txt });
    }
    for (const r of Object.keys(rows).map(Number).sort((a, b) => a - b)) out += rows[r].sort((a, b) => a.col - b.col).map((x) => x.txt).join('\t') + '\n';
  }
  if (!out.trim()) for (const f of image.fields || []) out += (f.inferText || '') + (f.lineBreak ? '\n' : ' ');
  return out.trim();
}

async function clovaOcr(base64, format) {
  for (const td of [true, false]) {
    const body = { version: 'V2', requestId: 'ab' + Date.now(), timestamp: Date.now(), lang: 'ko', images: [{ format, name: 'm', data: base64 }] };
    if (td) body.enableTableDetection = true;
    const r = await fetch(CLOVA_OCR_URL, { method: 'POST', headers: { 'X-OCR-SECRET': CLOVA_OCR_SECRET, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return reconstructText(await r.json());
    const t = await r.text();
    if (!(t.includes('0028') || t.includes('Table detection disabled'))) throw new Error(`CLOVA ${r.status} ${t.slice(0, 120)}`);
  }
  return '';
}

function parseItems(raw) {
  if (!raw) return null;
  let txt = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  try { return JSON.parse(txt); } catch {}
  const m = txt.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

async function sonnet(base64, media, clovaText) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8192, output_config: { format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data: base64 } }, { type: 'text', text: `${PROMPT}\n\n[OCR 추출 텍스트]\n${clovaText}` }] }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Sonnet ${r.status} ${JSON.stringify(d).slice(0, 150)}`);
  const tb = (d.content || []).find((b) => b.type === 'text');
  return { items: parseItems(tb?.text)?.items || [], raw: tb?.text || '', usage: d.usage };
}

async function deepseek(model, base64, media, clovaText) {
  const r = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${DEEPINFRA_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${media};base64,${base64}` } }, { type: 'text', text: `${PROMPT}\n\n[OCR 추출 텍스트]\n${clovaText}` }] }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`${model} ${r.status} ${JSON.stringify(d).slice(0, 200)}`);
  const content = d.choices?.[0]?.message?.content || '';
  return { items: parseItems(content)?.items || [], raw: content, usage: d.usage };
}

// 반찬 토큰 단위 비교(모델이 끼니를 통째로 안 쪼개도 공정). 주식(밥·김치·우유 등)은 매일 나와 날짜 의미 없어 제외.
const STAPLE = new Set(['백미밥','잡곡밥','흰밥','현미밥','찹쌀밥','기장밥','수수밥','쌀밥','보리밥','오곡밥','콩밥','흑미밥','배추김치','깍두기','김치','우유','요구르트','요거트','단무지','보리차','둥굴레차','메밀차','옥수수차','생수','물','오이김치','열무김치','총각김치','나박김치']);
const tok = (s) => (s || '').replace(/\([^)]*\)/g, '').replace(/[①-⑳]/g, '').replace(/[0-9.,]/g, '').replace(/\s/g, '').trim();
function dishMap(items) {
  const m = new Map();
  for (const it of items) {
    const date = String(it.date || '').replace(/\D/g, '');
    for (const raw of String(it.menu || '').split(/[\s,，/]+/)) {
      const k = tok(raw);
      if (k && k.length >= 2 && !STAPLE.has(k)) m.set(k, date);   // 비-주식 반찬만(날짜 의미있음)
    }
  }
  return m;
}
function compare(gold, test) {
  const gm = dishMap(gold), tm = dishMap(test);
  let both = 0, sameDate = 0;
  for (const [k, gd] of gm) if (tm.has(k)) { both++; if (gd && tm.get(k) === gd) sameDate++; }
  return { goldN: gm.size, testN: tm.size, both, sameDate, menuRecall: gm.size ? +(both / gm.size).toFixed(2) : 0, dateAgree: both ? +(sameDate / both).toFixed(2) : 0 };
}

async function main() {
  if (!IMGS.length) { console.log('이미지 경로를 인자로 주세요'); return; }
  const agg = {};
  for (const file of IMGS) {
    let img = file, tmp = null;
    if (/\.pdf$/i.test(file)) { img = toPng(file); tmp = img; }
    const media = img.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const base64 = fs.readFileSync(img).toString('base64');
    console.log(`\n━━━ ${path.basename(file)} ━━━`);
    try {
      const clovaText = await clovaOcr(base64, media === 'image/png' ? 'png' : 'jpg');
      const gold = await sonnet(base64, media, clovaText);
      console.log(`  Sonnet: ${gold.items.length}개 item (in${gold.usage?.input_tokens} out${gold.usage?.output_tokens})`);
      for (const mk of MODELS_ARG) {
        const model = DS_MODEL[mk]; if (!model) continue;
        try {
          const t0 = Date.now();
          const res = await deepseek(model, base64, media, clovaText);
          const cmp = compare(gold.items, res.items);
          (agg[mk] ||= []).push(cmp);
          console.log(`  ${mk}(${model.split('/')[1]}): ${res.items.length}개 · 메뉴재현 ${(cmp.menuRecall * 100).toFixed(0)}% · 날짜일치 ${(cmp.dateAgree * 100).toFixed(0)}% (공통 ${cmp.both}개 중 ${cmp.sameDate}개 동일날짜) ${((Date.now() - t0) / 1000).toFixed(0)}s`);
          if (VERBOSE || res.items.length === 0) console.log(`     raw[0:400]: ${res.raw.slice(0, 400).replace(/\n/g, ' ')}`);
        } catch (e) { console.log(`  ${mk}: ❌ ${String(e.message).slice(0, 160)}`); }
      }
    } catch (e) { console.log(`  ❌ ${String(e.message).slice(0, 160)}`); }
    finally { if (tmp) try { fs.unlinkSync(tmp); } catch {} }
  }
  console.log('\n━━━━━━ 종합 ━━━━━━');
  for (const mk of Object.keys(agg)) {
    const xs = agg[mk]; const avg = (f) => (xs.reduce((a, b) => a + f(b), 0) / xs.length);
    console.log(`  ${mk}: n=${xs.length} · 평균 메뉴재현 ${(avg((x) => x.menuRecall) * 100).toFixed(0)}% · 평균 날짜일치 ${(avg((x) => x.dateAgree) * 100).toFixed(0)}%`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
