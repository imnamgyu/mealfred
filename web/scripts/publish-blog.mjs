#!/usr/bin/env node
/**
 * publish-blog.mjs — 발행된 블로그 .md를 앱(blog_posts 테이블)으로 발행.
 *
 * 마케팅 정적 블로그(_build.js → mealfred.com/blog/NNN.html)는 그대로 두고,
 * 같은 .md를 같은 md→html 로직으로 렌더해 Supabase blog_posts에 upsert.
 * → 앱 '팁' 탭/인앱 블로그(/blog/[slug])가 이 테이블을 읽는다.
 *
 * 메타데이터(트랙·Phase·발행일·후킹제목·반전팩트)는 _TOPICS.csv 행이 우선,
 * 본문/제목 폴백은 .md frontmatter. published = CSV 발행일이 YYYY-MM-DD인 행만.
 *
 * 사용:
 *   node --env-file=.env.local scripts/publish-blog.mjs 001 002      # 특정 편
 *   node --env-file=.env.local scripts/publish-blog.mjs --all        # CSV 발행일 채워진 전부(백필)
 *
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const BLOG_DIR = '/Users/ing/Desktop/편식극복키트/05_마케팅/blog_posts';
const CSV = path.join(BLOG_DIR, '_TOPICS.csv');

/* ───── _build.js에서 포팅한 md→html (동일 결과 유지) ───── */
function inline(s) {
  let out = s;
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  out = out.replace(/(?<!["'>=(])(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return out;
}
function md2html(md) {
  return md.split(/\n{2,}/).map((raw) => {
    const block = raw.trim();
    if (!block) return '';
    if (block.startsWith('## ')) return `<h2>${inline(block.slice(3))}</h2>`;
    if (block.startsWith('# ')) return `<h1>${inline(block.slice(2))}</h1>`;
    if (block.startsWith('▎')) return `<blockquote class="quote-mark">${inline(block.slice(1).trim())}</blockquote>`;
    if (block.split('\n').every((l) => l.trim().startsWith('- '))) {
      const items = block.split('\n').map((l) => `<li>${inline(l.trim().slice(2))}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    return `<p>${block.split('\n').map((l) => inline(l)).join('<br>')}</p>`;
  }).filter(Boolean).join('\n');
}
function splitBody(body) {
  const trimmed = body.trim();
  const m = trimmed.match(/([\s\S]+?밀프레드 드림\.?)\s*\n([\s\S]*)$/);
  if (!m) return { main: trimmed, after: '' };
  return { main: m[1], after: m[2].trim() };
}
function renderAfter(after) {
  if (!after) return '';
  const lines = after.split('\n').filter((l) => l.trim());
  const ps = [], citations = [], hashtags = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === '---' || t.startsWith('## ') || t.startsWith('### ') || t.startsWith('> ')) break;
    if (t.startsWith('P.S.') || t.startsWith('P.S') || t.startsWith('추신')) ps.push(t);
    else if (t.startsWith('#')) t.split(/\s+/).forEach((tag) => { if (tag.startsWith('#')) hashtags.push(tag); });
    else if (t.startsWith('- ')) citations.push(t.slice(2));
    else if (t.startsWith('출처') || t.startsWith('본문') || t.startsWith('링크') || t.startsWith('헤드라인')) citations.push(t);
    else if (t.length > 0 && !t.startsWith('---')) citations.push(t);
  }
  let html = '';
  if (ps.length) html += `<aside class="blog-ps">${ps.map((p) => `<p>${inline(p)}</p>`).join('')}</aside>`;
  if (citations.length) html += `<aside class="blog-citations"><h4>출처 · 인용</h4><ul>${citations.map((c) => `<li>${inline(c)}</li>`).join('')}</ul></aside>`;
  if (hashtags.length) html += `<div class="blog-hashtags">${hashtags.map((h) => `<span class="ht">${h}</span>`).join(' ')}</div>`;
  return html;
}
function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: content };
  const fm = {};
  m[1].split('\n').forEach((line) => { const i = line.indexOf(':'); if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim(); });
  return { fm, body: m[2] };
}
function parseCSVLine(line) {
  const f = []; let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { f.push(cur); cur = ''; continue; }
    cur += c;
  }
  f.push(cur); return f;
}
function parseCSV(content) {
  const lines = content.split('\n').filter((l) => l.length > 0);
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const fields = parseCSVLine(line); const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (fields[i] || '').trim(); });
    return row;
  });
}

/* ───── 한 편을 blog_posts 레코드로 ───── */
function buildRecord(num, csvRow) {
  const mdPath = path.join(BLOG_DIR, `${num}.md`);
  if (!fs.existsSync(mdPath)) return null;
  const { fm, body } = parseFrontmatter(fs.readFileSync(mdPath, 'utf-8'));
  const meta = { ...fm, ...(csvRow || {}) }; // CSV 우선
  const { main, after } = splitBody(body);
  // 본문 첫 H1(제목)은 페이지가 따로 보여주므로 제거
  const mainNoTitle = main.replace(/^\s*#\s+.+\n+/, '');
  const title = meta['후킹제목'] || meta['첫화면자막'] || `${parseInt(num, 10)}편`;
  const phaseNum = meta['Phase'] || '';
  const track = meta['트랙'] || (phaseNum === '0' ? '오프닝' : '정주행');
  const category = meta['카테고리'] || null;
  const topics = [track, category, meta['후킹타입']].filter(Boolean);
  return {
    slug: num,
    series_no: parseInt(num, 10),
    track,
    phase: phaseNum || null,
    phase_name: meta['Phase명'] || null,
    category,
    title,
    headline: meta['첫화면자막'] || null,
    excerpt: meta['반전팩트'] || null,
    body_html: md2html(mainNoTitle),
    after_html: renderAfter(after) || null,
    source: meta['근거출처'] || null,
    topics,
    ingredients: [],
    published_at: /^\d{4}-\d{2}-\d{2}$/.test(meta['발행일'] || '') ? meta['발행일'] : null,
    status: 'public',
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('❌ env 없음 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'); process.exit(1); }
  const db = createClient(url, key);

  const csvRows = parseCSV(fs.readFileSync(CSV, 'utf-8'));
  const byNum = {};
  csvRows.forEach((r) => { if (r['발행순서']) byNum[String(r['발행순서']).padStart(3, '0')] = r; });

  const args = process.argv.slice(2);
  let nums;
  if (args.includes('--all')) {
    nums = csvRows
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r['발행일'] || ''))
      .map((r) => String(r['발행순서']).padStart(3, '0'));
  } else {
    nums = args.filter((a) => !a.startsWith('--')).map((a) => String(parseInt(a, 10)).padStart(3, '0'));
  }
  if (!nums.length) { console.error('사용: publish-blog.mjs <num...> | --all'); process.exit(1); }

  const records = nums.map((n) => buildRecord(n, byNum[n])).filter(Boolean);
  if (!records.length) { console.error('❌ 발행할 .md 없음'); process.exit(1); }

  const { error } = await db.from('blog_posts').upsert(records, { onConflict: 'slug' });
  if (error) { console.error('❌ upsert 실패:', error.message); process.exit(1); }
  console.log(`✅ ${records.length}편 발행(앱):`);
  records.forEach((r) => console.log(`   /blog/${r.slug}  ${r.title}  ${r.published_at || '(발행일 없음)'}`));
}
main();
