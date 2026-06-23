/**
 * institution_scores.score를 7축(axes) 평균으로 일괄 재계산 (학부모 daycare-eval total과 정합).
 *   penalty(computeDiversityScore) 이중계산 제거 — 점수/등수 모순 버그 수정(이사님 2026-06-23).
 * 실행: cd web && node scripts/_fix-institution-scores.mjs [--apply]   (기본 dry-run)
 */
import fs from 'fs';
const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');

const rows = await (await fetch(`${URL}/rest/v1/institution_scores?select=id,score,axes`, { headers: H })).json();
let changed = 0, sumDelta = 0; const samples = [];
for (const r of rows) {
  if (!r.axes) continue;
  const vals = Object.values(r.axes).filter((v) => typeof v === 'number');
  if (!vals.length) continue;
  const ns = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  if (ns !== r.score) {
    changed++; sumDelta += ns - r.score;
    if (samples.length < 12) samples.push(`${r.score}→${ns}`);
    if (APPLY) await fetch(`${URL}/rest/v1/institution_scores?id=eq.${r.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ score: ns }) });
  }
}
console.log(`${rows.length}행 · 변경 ${changed}건${APPLY ? ' ✅ 적용됨' : ' (dry-run — --apply로 실제 반영)'} · 평균변화 ${changed ? (sumDelta / changed).toFixed(1) : 0}점`);
console.log(`예시(score→7축평균): ${samples.join('  ')}`);
