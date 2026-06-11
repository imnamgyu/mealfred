#!/usr/bin/env node
/**
 * 실아동 스냅샷 → 리플레이 fixture 캡처 (복리 자산 파이프의 입구).
 * 사고가 난 가정의 데이터 창을 익명화해 tests/fixtures/에 박제한다 — 이후 영구 회귀 검증.
 *
 * 사용: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/capture-fixture.mjs <child_id> <from> <to> <fixture-name>
 * 예:   node scripts/capture-fixture.mjs 43942d34-... 2026-06-01 2026-06-11 incident-2026-06-11
 */
import { writeFileSync, mkdirSync } from 'fs';

const [cid, from, to, name] = process.argv.slice(2);
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!cid || !from || !to || !name || !URL_ || !KEY) {
  console.error('usage: SUPABASE_URL=.. SUPABASE_SERVICE_KEY=.. node scripts/capture-fixture.mjs <child_id> <from> <to> <name>');
  process.exit(1);
}

const res = await fetch(`${URL_}/rest/v1/meal_logs?child_id=eq.${cid}&log_date=gte.${from}&log_date=lte.${to}&select=log_date,slot,menus,ingredients,refused,note,environment,autonomy,texture,meal_time,place,ate_well&order=log_date.asc`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const rows = await res.json();
if (!Array.isArray(rows)) { console.error('fetch 실패:', rows); process.exit(1); }

// 익명화 — 자녀 식별자 제거(메뉴·메모는 코칭 재현에 필요해 유지. 리포 외부 반출 금지)
const fixture = { name, capturedFrom: 'anonymized', window: { from, to }, rows };
mkdirSync(new URL('../tests/fixtures/', import.meta.url), { recursive: true });
const path = new URL(`../tests/fixtures/${name}.json`, import.meta.url);
writeFileSync(path, JSON.stringify(fixture, null, 1));
console.log(`fixture 저장: tests/fixtures/${name}.json (rows=${rows.length}) — replay.test.ts에서 로드해 불변식 검증에 사용`);
