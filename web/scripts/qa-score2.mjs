/** 일회성 — 아린 새 점수(computeDiversityScore) 검증 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const nDaysAgo = (n) => new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
const CATEGORY_GROUP = { '곡물_탄수': '곡물', '콩_콩제품': '콩류', '발효식품': '콩류', '유제품': '유제품', '고기': '고기생선', '생선': '고기생선', '갑각_조개': '고기생선', '가공식품': '고기생선', '계란': '계란', '잎채소': '비타민A채소', '뿌리채소': '비타민A채소', '십자화과': '비타민A채소', '열매채소': '기타채소', '기타채소': '기타채소', '해조류': '기타채소', '버섯': '기타채소', '과일': '과일', '곡류': '곡물', '콩제품': '콩류' };
const GROUP_TARGET = { '곡물': { green: 5, type: 'daily' }, '비타민A채소': { green: 5, type: 'daily' }, '기타채소': { green: 5, type: 'daily' }, '과일': { green: 5, type: 'daily' }, '유제품': { green: 5, type: 'daily' }, '고기생선': { green: 5, type: 'rotation' }, '계란': { green: 3, type: 'rotation' }, '콩류': { green: 2, type: 'rotation' } };
const ALL_GROUPS = Object.keys(GROUP_TARGET);
const ULTRA_RE = /짜파게티|짜파구리|짜장범벅|컵라면|봉지면|라면|핫도그|핫바|치킨너겟|너겟|너깃|돈가스|돈까스|까스|피자|군만두|탕수육|양념치킨|프라이드|감자튀김|프렌치프라이|즉석|인스턴트|시리얼|콘푸로스트|핫케이크|와플|도넛|도너츠|과자|스낵|젤리|사탕|초콜릿|초코바/;
const CURED_RE = /소시지|비엔나|후랑크|프랑크|햄(?!버그스테이크)|베이컨|어묵|오뎅|맛살|게맛살|크래미|떡갈비|la\s*갈비|엘에이\s*갈비|미트볼|함박|함바그|동그랑땡|스팸|런천|훈제/i;
const REPEAT_SKIP = new Set(['물', '국', '김', '우유', '생수', '보리차', '숭늉', '밥', '쌀밥', '흰밥', '흰쌀밥', '백미밥', '진밥', '쌀', '맨밥', '김치', '배추김치']);
const pool = JSON.parse(fs.readFileSync('public/ingredients-light.json', 'utf8')).ingredients;
const catMap = {}; pool.forEach((x) => (catMap[x.nm] = x.cat));
const groupOf = (ing) => CATEGORY_GROUP[catMap[ing]];
function groupSignals(byDay) {
  const totalDays = byDay.length || 1; const cover = {};
  byDay.forEach((day) => { const set = new Set(); day.forEach((i) => { const g = groupOf(i); if (g) set.add(g); }); set.forEach((g) => (cover[g] = (cover[g] || 0) + 1)); });
  return ALL_GROUPS.map((g) => { const d = cover[g] || 0; const w = Math.round((d / totalDays) * 7 * 10) / 10; const t = GROUP_TARGET[g]; const level = t.type === 'daily' ? (w >= t.green ? 'green' : w >= 2 ? 'yellow' : 'red') : (d === 0 ? 'red' : w >= t.green ? 'green' : 'yellow'); return { group: g, level, w }; });
}
const isProc = (n) => { const x = (n || '').replace(/\s/g, ''); if (ULTRA_RE.test(x)) return 'ultra'; if (CURED_RE.test(n || '')) return 'cured'; return null; };
function procPen(menusByMeal) {
  const meals = menusByMeal.filter((m) => m.length); if (!meals.length) return { penalty: 0, names: [] };
  let weighted = 0; const names = new Set();
  for (const meal of meals) { let w = 0; for (const mn of meal) { const k = isProc(mn); if (k) { w = Math.max(w, k === 'ultra' ? 1 : 0.7); names.add(mn); } } weighted += w; }
  return { penalty: Math.round((weighted / meals.length) * 22), names: [...names] };
}
function repPen(menusByMeal) {
  const freq = {}; menusByMeal.forEach((m) => m.forEach((mn) => { const k = (mn || '').replace(/\s/g, ''); if (k && !REPEAT_SKIP.has(k)) freq[k] = (freq[k] || 0) + 1; }));
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 4) return { penalty: 0, menu: null }; return { penalty: Math.min(12, (top[1] - 3) * 4), menu: top[0], count: top[1] };
}
function diversity(byDay, menusByMeal, apply, opts = {}) {
  const { yellowW = 55, excludeGroups = [] } = opts;
  let sig = groupSignals(byDay);
  if (excludeGroups.length) sig = sig.filter((s) => !excludeGroups.includes(s.group));
  const base = sig.length ? Math.round(sig.reduce((a, s) => a + (s.level === 'green' ? 100 : s.level === 'yellow' ? yellowW : 0), 0) / sig.length) : 0;
  const red = sig.filter((s) => s.level === 'red').map((s) => s.group);
  const cap = red.length ? Math.max(66, 90 - (red.length - 1) * 8) : 100;
  const meals = menusByMeal.filter((m) => m.length).length;
  const on = apply && meals >= 3;
  const pp = on ? procPen(menusByMeal) : { penalty: 0, names: [] };
  const rp = on ? repPen(menusByMeal) : { penalty: 0, menu: null };
  const score = Math.max(0, Math.min(100, Math.min(base, cap) - pp.penalty - rp.penalty));
  return { score, base, cap, red, proc: pp.penalty, procNames: pp.names, rep: rp.penalty, repMenu: rp.menu };
}
const { data: rows } = await sb.from('meal_logs').select('log_date,ingredients,menus,place').eq('child_id', CID).gte('log_date', nDaysAgo(6));
const homeByDate = {}, dcByDate = {}, homeMenus = [], dcMenus = [];
for (const r of rows || []) {
  const d = r.place === 'daycare' ? dcByDate : homeByDate; (d[r.log_date] ||= []).push(...(r.ingredients || []));
  if ((r.menus || []).length) (r.place === 'daycare' ? dcMenus : homeMenus).push(r.menus);
}
const homeDay = Object.values(homeByDate).filter((a) => a.length);
const dcDay = Object.values(dcByDate).filter((a) => a.length);
const gradeOf = (s) => (s >= 90 ? 'S' : s >= 70 ? 'A' : s >= 55 ? 'B' : s >= 40 ? 'C' : 'D');
function scenario(label, opts, dcOpts) {
  const h = diversity(homeDay, homeMenus, true, opts);
  const dc = diversity(dcDay, dcMenus, false, dcOpts);
  const final = Math.round(h.score * 0.7 + dc.score * 0.3);
  console.log(`\n[${label}]`);
  console.log(`  집 ${h.score} (base${h.base} cap${h.cap} 가공−${h.proc} red:${h.red.join('·') || '-'}) · 기관 ${dc.score} (base${dc.base} red:${dc.red.join('·') || '-'})`);
  console.log(`  ▶ 최종 ${final} → ${gradeOf(final)}`);
}
console.log(`아린 새 점수 시나리오 (이전: 100 S)`);
scenario('1. 현재 산식(yellow55, 기관 8군 전부)', {}, {});
scenario('2. 기관 점심only 보정(과일·유제품 제외)', {}, { excludeGroups: ['과일', '유제품'] });
scenario('3. 보정 + yellow 55→65(전반 완화)', { yellowW: 65 }, { yellowW: 65, excludeGroups: ['과일', '유제품'] });
