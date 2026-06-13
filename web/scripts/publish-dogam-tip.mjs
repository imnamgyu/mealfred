#!/usr/bin/env node
/**
 * publish-dogam-tip.mjs — 식재료 도감 글을 앱 '팁' 피드(app.mealfred.com/tips)에 발행.
 *
 * 소스: blog_posts/_DOGAM_KAKAO.md 「연재 로그」의 각 ### 엔트리(날짜·식재료·멘트).
 * → Supabase blog_posts 테이블에 track='도감'으로 upsert(멱등, onConflict slug).
 *   편식 블로그와 한 피드에 날짜순으로 섞여 '도감' 배지로 노출된다.
 *
 * 카톡 복붙은 더 이상 안 한다(2026-06-06 제거). 도감 = 앱 팁 콘텐츠 라이브러리 전용.
 * 마케팅 정적 블로그(mealfred.com/blog)·git·_build.js 와는 무관 = 정적 사이트 비배포.
 *
 * 전체 발행(라이브러리 채우기) + 미래 날짜 가드: published_at은 오늘로 캡(피드 최신순이
 *   미래글로 꼬이지 않게). 멱등 upsert라 매번 재실행 안전.
 *
 * 사용:
 *   node --env-file=.env.local scripts/publish-dogam-tip.mjs            # 전체 발행
 *   node --env-file=.env.local scripts/publish-dogam-tip.mjs --today=2026-06-06
 *
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const LOG = '/Users/ing/Desktop/편식극복키트/05_마케팅/blog_posts/_DOGAM_KAKAO.md';

function linkify(s) {
  return s.replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

/* 멘트(코드블록 본문) → 팁 본문 HTML. 첫 줄(🥕 제목)은 title로 빠지므로 제외. */
function mentToHtml(ment) {
  const lines = ment.split('\n');
  const body = lines.slice(1); // 🥕 [오늘의 식재료 도감] … 줄 제거
  const out = [];
  let li = [];
  const flush = () => { if (li.length) { out.push(`<ul>${li.map((x) => `<li>${linkify(x)}</li>`).join('')}</ul>`); li = []; } };
  for (const raw of body) {
    const l = raw.trim();
    if (!l) { flush(); continue; }
    if (l.startsWith('·')) { li.push(linkify(l.replace(/^·\s*/, ''))); continue; }
    flush();
    out.push(`<p>${linkify(l)}</p>`);
  }
  flush();
  return out.join('\n');
}

/* _DOGAM_KAKAO.md 「연재 로그」 파싱 → [{date, ingredient, grade, ment}] */
function parseLog(md) {
  const idx = md.indexOf('# 연재 로그');
  const region = idx >= 0 ? md.slice(idx) : md;
  const re = /###\s+(\d{4}-\d{2}-\d{2})\s+·\s+(\S+)([^\n]*)\n```\n([\s\S]*?)\n```/g;
  const entries = [];
  let m;
  while ((m = re.exec(region))) {
    entries.push({ date: m[1], ingredient: m[2].trim(), grade: (m[3] || '').trim(), ment: m[4].trim() });
  }
  return entries;
}

function buildRecord(e, now, today) {
  const lines = e.ment.split('\n');
  const excerpt = (lines[1] || '').trim() || null; // 효능 한 줄
  return {
    slug: `dogam-${e.ingredient}`,
    series_no: Number(e.date.replace(/-/g, '')), // 날짜 기반 고유값(YYYYMMDD) — 블로그 발행순서(1~)와 충돌 없음
    track: '도감',
    phase: null,
    phase_name: '도감',
    category: '식재료',
    title: `식재료 도감 · ${e.ingredient}`,
    headline: e.grade || null,
    excerpt,
    body_html: mentToHtml(e.ment),
    after_html: null,
    source: `app.mealfred.com/foods/${e.ingredient}`,
    topics: ['도감', e.ingredient],
    ingredients: [e.ingredient],
    published_at: e.date > today ? today : e.date, // 미래 날짜는 오늘로 캡
    status: 'public',
    updated_at: now,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('❌ env 없음 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'); process.exit(1); }
  const db = createClient(url, key);

  const args = process.argv.slice(2);
  const todayArg = (args.find((a) => a.startsWith('--today=')) || '').split('=')[1];
  const today = todayArg || new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const entries = parseLog(fs.readFileSync(LOG, 'utf-8'));
  if (!entries.length) { console.error('❌ 로그에서 도감 엔트리를 못 찾음'); process.exit(1); }

  const records = entries.map((e) => buildRecord(e, now, today));
  const { error } = await db.from('blog_posts').upsert(records, { onConflict: 'slug' });
  if (error) { console.error('❌ upsert 실패:', error.message); process.exit(1); }

  console.log(`✅ 도감 ${records.length}편 앱 팁 발행 (published_at 오늘 캡=${today}):`);
  records.forEach((r) => console.log(`   /blog/${r.slug}  ${r.title}  ${r.published_at}`));
}

main();
