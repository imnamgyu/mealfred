/**
 * deprecate-docs.mjs — v1 대청소: 폐기 문서 상단에 'deprecated' 배너를 주입(비파괴).
 * 파일은 지우지 않고, <body> 바로 뒤에 sticky 배너를 끼워 한눈에 '지난 자료'임을 표시한다.
 * 사용: node scripts/deprecate-docs.mjs a.html b.html ...
 *   (이미 배너가 있으면 건너뜀 — 멱등)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const BANNER = `<div class="v1-deprecated-banner" style="position:sticky;top:0;z-index:99999;background:#FFF4E5;border-bottom:2px solid #FFB74D;color:#8a5a00;padding:9px 16px;font-family:'Pretendard Variable',Pretendard,-apple-system,sans-serif;font-size:13px;font-weight:600;line-height:1.5;text-align:center">📦 이 문서는 <b>v1 이전 자료(deprecated)</b>입니다 — 최신 정보는 <a href="/docs.html" style="color:#C45A00;font-weight:800;text-decoration:underline">문서 허브</a>를 보세요</div>`;

const files = process.argv.slice(2);
let done = 0, skip = 0, miss = 0;
for (const f of files) {
  const path = `/Users/ing/Desktop/dev/web/landing_page/deploy/${f}`;
  if (!existsSync(path)) { console.log(`  ✗ 없음 ${f}`); miss++; continue; }
  let html = readFileSync(path, 'utf8');
  if (html.includes('v1-deprecated-banner')) { skip++; continue; }
  const m = html.match(/<body[^>]*>/i);
  if (!m) { console.log(`  ✗ <body> 없음 ${f}`); miss++; continue; }
  html = html.replace(m[0], `${m[0]}\n${BANNER}`);
  writeFileSync(path, html);
  done++;
}
console.log(`배너 주입: ${done}건 · 이미있음 ${skip} · 누락 ${miss}`);
