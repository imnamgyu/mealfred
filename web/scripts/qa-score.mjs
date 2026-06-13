/** 일회성 — 아린 home/daycare 영양 점수 + 가중 final 확인 (로직 인라인 복제) */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const nDaysAgo = (n) => new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
const GEN = JSON.parse(fs.readFileSync('lib/nutrient-map.generated.json', 'utf8'));
const KEY_NUTRIENTS = ['단백질', '칼슘', '철', '비타민A', '비타민C', '비타민D', '오메가3', '식이섬유', '아연', '엽산', '비타민B12', '요오드', '칼륨', '마그네슘', '비타민K'];
const nutrientsOf = (ing) => GEN[ing]?.n || [];   // 정확맵만(빗대기 생략 → 보수적, 실제는 이보다 높거나 같음)
// computeSignals 복제: d>=3 || ratio>=0.5 → green / d>0 → yellow / else red
function computeSignals(byDay) {
  const totalDays = byDay.length || 1;
  const coverDays = {}; KEY_NUTRIENTS.forEach((n) => (coverDays[n] = 0));
  for (const day of byDay) { const covered = new Set(); for (const ing of day) nutrientsOf(ing).forEach((n) => covered.add(n)); covered.forEach((n) => { if (n in coverDays) coverDays[n]++; }); }
  return KEY_NUTRIENTS.map((n) => { const d = coverDays[n], ratio = d / totalDays; const level = d >= 3 || ratio >= 0.5 ? 'green' : d > 0 ? 'yellow' : 'red'; return { nutrient: n, d, level }; });
}
const score = (sig) => Math.round(sig.reduce((a, s) => a + (s.level === 'green' ? 100 : s.level === 'yellow' ? 50 : 0), 0) / sig.length);
const { data: rows } = await sb.from('meal_logs').select('log_date,ingredients,place').eq('child_id', CID).gte('log_date', nDaysAgo(6));
const homeByDate = {}, dcByDate = {};
for (const r of rows || []) { const d = r.place === 'daycare' ? dcByDate : homeByDate; (d[r.log_date] ||= []).push(...(r.ingredients || [])); }
const homeSig = computeSignals(Object.values(homeByDate).filter((a) => a.length));
const dcSig = computeSignals(Object.values(dcByDate).filter((a) => a.length));
const h = score(homeSig), d = score(dcSig);
console.log(`\n총 끼니 ${rows?.length || 0}건 (최근 7일)`);
console.log(`집(home) 점수: ${h}  (${Object.keys(homeByDate).length}일 기록)`);
console.log(`기관(daycare) 점수: ${d}  (${Object.keys(dcByDate).length}일 기록)`);
console.log(`가중 final = ${h}×0.7 + ${d}×0.3 = ${Math.round(h * 0.7 + d * 0.3)}`);
console.log('\n[집 신호등] (d=노출일수, green=d>=3)');
console.log(homeSig.map((s) => `${s.nutrient}:${s.level}(${s.d}d)`).join('  '));
