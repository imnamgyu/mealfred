/**
 * 읽기 전용 — 누적 코호트 상위% 분포 진단(신규 고객이 얼마나 박하게 뜨는지).
 * 현재 공개/어드민 게이트: 표본>=5 && 상위%<=50 일 때만 '상위 X%' 노출, 그 외엔 따뜻한 중립문구.
 * 실행: cd web && node scripts/_analyze-rank-distribution.mjs
 */
import fs from 'fs';
const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const rows = await (await fetch(`${URL}/rest/v1/institution_scores?select=type,score&limit=100000`, { headers: H })).json();
const byType = {};
for (const r of rows) (byType[r.type] ||= []).push(r.score);

const TH_SHOW = 29;   // 신규 게이트(이사님 2026-06-24): 상위 29% 이내만 실제 % 노출
function topPercentOf(score, pool) { const rank = pool.filter((s) => s > score).length + 1; return Math.max(1, Math.round((rank / pool.length) * 100)); }
function pctile(arr, p) { const s = [...arr].sort((a, b) => a - b); return s[Math.floor((p / 100) * (s.length - 1))]; }

for (const [type, pool] of Object.entries(byType)) {
  const n = pool.length;
  const min = Math.min(...pool), max = Math.max(...pool), med = pctile(pool, 50);
  console.log(`\n■ ${type} (n=${n}) — 점수 ${min}~${max}, 중앙값 ${med}`);
  // 각 점수가 받는 상위%
  const tps = pool.map((s) => topPercentOf(s, pool));
  const shown = tps.filter((t) => t <= TH_SHOW).length;       // '상위 X%' 노출되는 비율
  const hidden = n - shown;
  console.log(`  · 게이트(<=${TH_SHOW}%) 노출 ${shown}건 / 숨김 ${hidden}건`);
  // 점수→상위% 대표 매핑
  const samples = [...new Set(pool)].sort((a, b) => b - a);
  console.log('  · 점수→상위%:', samples.slice(0, 12).map((s) => `${s}점=${topPercentOf(s, pool)}%`).join('  '));
  // "박한 구간": 노출되는데 상위 35~50% (애매하게 안 좋아 보이는 번호)
  const meh = tps.filter((t) => t > 35 && t <= 50).length;
  console.log(`  · ⚠️ 애매구간(상위 36~50% 노출) ${meh}건 — 신규가 이 점수대면 '상위 50%'처럼 박하게 보임`);
}
