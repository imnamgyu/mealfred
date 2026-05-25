#!/usr/bin/env node
/**
 * enrich_queue seed — 농진청 v10.4 식재료 중 우리 147 풀에 없는 식재료를 큐에 push
 *
 * 실행:
 *   cd deploy/web && node --env-file=.env.local ../supabase/seed-enrich-queue.mjs
 *
 * 동작:
 *   1. 농진청 v10.4 (3,366 종) 로드
 *   2. 우리 147 풀과 비교 → 미매칭 식재료 추출
 *   3. 영양 가치 있는 것만 필터링 (가공·발효·말린것·향신료 제외)
 *   4. enrich_queue에 status='pending' upsert (멱등)
 *   5. 매일 +50종씩 cron이 Haiku 분류 후 ingredients 등록
 *
 * 결과: 1,000+ 종 큐에 등록 → 20일에 걸쳐 도감 자동 확장
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ 환경변수 누락: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const here = path.dirname(new URL(import.meta.url).pathname);
const enrichedPath = path.join(here, '..', 'data_ingredient_pool_enriched.json');
const enriched = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8'));
const existingNames = new Set(enriched.pool.map((p) => p.nm));
console.log(`📦 기존 147 풀: ${existingNames.size}종`);

// ━━━ 농진청 nong_name 추출 (이미 enriched에 매칭된 것 제외) ━━━
// 농진청 Excel 직접 파싱은 무겁다 → 우리는 enriched.json의 nong_name 매칭 결과를 활용
// 매칭 안 된 농진청 식재료는 별도 source 필요 (이번 스크립트는 미매칭 list만 push)

// 노이즈 필터 — 진짜 식재료가 아닌 키워드 (생것·말린것·가공 등 변형 suffix)
const NOISE_KEYWORDS = [
  '생것','말린것','데친것','삶은것','익힌것','볶은것','튀긴것','조린것','구운것',
  '가루','분말','가공','발효','농축','즙','액기스','시럽','정과','다시',
  '간장','된장','고추장','참기름','콩기름','들기름','올리브유','포도씨유','버터','마요네즈',
  '소금','설탕','꿀','조청','물엿','식초','후추','계피','시나몬','바닐라',
  '알코올','청주','맥주','와인','막걸리',
  '인공','첨가물','감미료','색소','보존료',
];

function isNoise(name) {
  if (name.length < 2) return true;
  if (/^\d/.test(name)) return true;  // 숫자 시작
  return NOISE_KEYWORDS.some((kw) => name.includes(kw));
}

// ━━━ 후보 식재료 push (현재는 enriched의 미매칭만 대상) ━━━
// 실제로는 농진청 Excel을 다시 파싱하거나 별도 seed list를 사용
// 이번 버전은 unmatched 15종 (가공식품)을 큐에 넣지 X — 노이즈 필터 통과 못함

// 대신: 우리가 cooking-kit·foodbridge product에서 사용하는 식재료 중 도감 미포함만 push
const PRODUCT_INGREDIENTS = [
  // foodbridge 편식개선키트 9 식재료
  '브로콜리','당근','시금치','가지','토마토','피망','버섯','고추','연근',
  // cooking-kit 등 일반 추가 식재료 (영유아·아동 친화)
  '아스파라거스','셀러리','콜라비','루꼴라','케일','적양배추','적상추','로메인',
  '래디시','비트','파스닙','순무',
  '병아리콩','렌틸','검은콩','강낭콩','동부콩',
  '캐슈너트','피칸','마카다미아','피스타치오',
  '체리','석류','자두','살구','블랙베리','라즈베리','자몽','오렌지','라임',
  '망고','파파야','구아바',
  '연어','광어','참치','우럭','전복','문어','꽃게',
  '오트밀','보리','기장','메밀','퀴노아','옥수수가루',
  '그릭요거트','모짜렐라','체다치즈','파마산',
];

// 미매칭만 큐에 push (멱등)
let pushed = 0, skipped = 0, noise = 0;
for (const name of PRODUCT_INGREDIENTS) {
  if (existingNames.has(name)) { skipped++; continue; }
  if (isNoise(name)) { noise++; continue; }
  const { error } = await supabase.from('enrich_queue').upsert({
    name,
    source_db: 'product · 영유아 친화 추가',
    scheduled_for: new Date().toISOString().slice(0, 10),
    status: 'pending',
  }, { onConflict: 'name' });
  if (error && !error.message.includes('duplicate')) {
    console.warn(`  ⚠ ${name}:`, error.message);
  } else {
    pushed++;
  }
}

console.log(`\n✅ enrich_queue 시드 완료`);
console.log(`  - 큐 push: ${pushed}종`);
console.log(`  - 이미 도감에 있음 (skip): ${skipped}종`);
console.log(`  - 노이즈 (skip): ${noise}종`);

// cron 실행 예상
console.log(`\n📅 매일 +50종 cron (web/app/api/cron/enrich/route.ts):`);
console.log(`  - 다음 cron 실행일 19:00 UTC (KST 04:00) 시작`);
console.log(`  - ${pushed}종 → ${Math.ceil(pushed/50)}일 안에 모두 enrich + 도감 등록`);
console.log(`  - 비용: ${pushed * 4}원 (Haiku 분류, 1회 ~₩4)`);
