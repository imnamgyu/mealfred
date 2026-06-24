/**
 * institution_scores.score를 7축(axes) '가중 평균'으로 일괄 재계산(이사님 2026-06-24 확정).
 *   단일 산식 = lib/institutionScore.ts sevenAxisScore. 여기 AXIS_WEIGHTS는 그 상수의 복제 — 바꾸면 동기화.
 *   stored axes에서 바로 재계산(axes 자체는 computeSevenAxes 불변이라 메뉴 재독 불필요). axes 없는 옛 행은 rescore-standout.ts로.
 * 실행: cd web && node scripts/_fix-institution-scores.mjs [--apply]   (기본 dry-run)
 */
import fs from 'fs';

// ⭐ lib/institutionScore.ts AXIS_WEIGHTS와 동일하게 유지(단일 진실). 합 100.
const AXIS_WEIGHTS = { diversity: 24, kdri: 22, nova: 16, repeat: 14, season: 10, cuisine: 8, allergen: 6 };
function sevenAxisScore(axes) {
  let num = 0, den = 0;
  for (const k of Object.keys(AXIS_WEIGHTS)) {
    const w = AXIS_WEIGHTS[k], v = Number(axes?.[k]);
    if (!w || !Number.isFinite(v)) continue;
    num += v * w; den += w;
  }
  return den ? Math.round(num / den) : null;
}

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');

const rows = await (await fetch(`${URL}/rest/v1/institution_scores?select=id,score,axes&limit=100000`, { headers: H })).json();
let changed = 0, sumDelta = 0, noAxes = 0; const samples = [];
for (const r of rows) {
  if (!r.axes) { noAxes++; continue; }
  const ns = sevenAxisScore(r.axes);
  if (ns == null) { noAxes++; continue; }
  if (ns !== r.score) {
    changed++; sumDelta += ns - r.score;
    if (samples.length < 12) samples.push(`${r.score}→${ns}`);
    if (APPLY) await fetch(`${URL}/rest/v1/institution_scores?id=eq.${r.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ score: ns }) });
  }
}
console.log(`${rows.length}행 · 변경 ${changed}건${APPLY ? ' ✅ 적용됨' : ' (dry-run — --apply로 실제 반영)'} · 평균변화 ${changed ? (sumDelta / changed).toFixed(1) : 0}점 · axes없음 ${noAxes}행(rescore-standout 필요)`);
console.log(`예시(score→7축가중): ${samples.join('  ')}`);
