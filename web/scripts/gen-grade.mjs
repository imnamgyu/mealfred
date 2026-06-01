/**
 * gen-grade.mjs — 별등급 재계산 (등장 빈도 + 영양가) + 근거 한 줄 생성.
 *
 * 기준: 학교 급식 등장횟수(count)와 영양 밀도(nutrient-map.generated.json의 커버 영양소 수)를 각각 백분위로,
 *   ⭐⭐⭐ 필수 = 빈도 최상위(p≥0.84) **또는** 영양 최상위(p≥0.86)  ← '자주 등장 OR 영양 우수' (양파·콩 둘 다 구제)
 *   ⭐⭐ 권장  = 빈도 p≥0.52 또는 영양 p≥0.62
 *   ⭐ 핵심    = 그 외
 *   양념(마늘·파·참깨 등)은 도전 식재료가 아니라 제외(🔸 향신료).
 * 산출 → data_ingredient_pool_enriched.json(.pool) + public/ingredients-light.json 의 grade/grade_label/grade_reason.
 * 실행: cd web && node scripts/gen-grade.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
const ENR = '../data_ingredient_pool_enriched.json', LIGHT = 'public/ingredients-light.json', GEN = 'lib/nutrient-map.generated.json';
const enr = JSON.parse(readFileSync(ENR, 'utf8')); const pool = enr.pool;
const light = JSON.parse(readFileSync(LIGHT, 'utf8'));
const gen = JSON.parse(readFileSync(GEN, 'utf8'));
const SEASON = new Set(['마늘', '파', '대파', '쪽파', '생강', '고추', '청양고추', '풋고추', '홍고추', '마늘종', '참깨', '들깨', '고춧가루', '고추가루']);
const nutsOf = (nm) => gen[nm]?.n || [];
const gradable = pool.filter((p) => !SEASON.has(p.nm));
const sortedC = [...gradable.map((p) => p.count || 0)].sort((a, b) => a - b);
const sortedN = [...gradable.map((p) => nutsOf(p.nm).length)].sort((a, b) => a - b);
const pct = (v, arr) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo / Math.max(1, arr.length); };
const PRIO = ['단백질', '오메가3', '비타민D', '철', '칼슘', '비타민A', '비타민C', '식이섬유', '아연', '엽산', '비타민B12', '칼륨', '마그네슘', '비타민K', '비타민B2', '비타민B1', '니아신', '비타민B6', '요오드', '셀레늄'];
const topNuts = (nm) => { const ns = new Set(nutsOf(nm)); return PRIO.filter((x) => ns.has(x)).slice(0, 2); };
function grade(p) { const f = pct(p.count || 0, sortedC), nu = pct(nutsOf(p.nm).length, sortedN);
  if (f >= 0.84 || nu >= 0.86) return ['⭐⭐⭐', '필수', f, nu];
  if (f >= 0.52 || nu >= 0.62) return ['⭐⭐', '권장', f, nu];
  return ['⭐', '기본', f, nu]; }
const cnt = {};
for (const p of pool) {
  if (SEASON.has(p.nm)) { p.grade = '🔸'; p.grade_label = '향신료'; p.grade_reason = '양념·향신료 (도전 식재료 제외)'; cnt['향신료'] = (cnt['향신료'] || 0) + 1; continue; }
  const [g, lab, f, nu] = grade(p); const tn = topNuts(p.nm);
  p.grade = g; p.grade_label = lab;
  const freqTxt = p.count >= 200 ? `급식 자주 등장(${p.count}회)` : p.count >= 50 ? `급식 등장(${p.count}회)` : `급식엔 적지만(${p.count}회)`;
  const nutTxt = tn.length ? ` · ${tn.join('·')} 풍부` : '';
  const rescued = (nu >= 0.86 && f < 0.52) || (nu >= 0.62 && f < 0.52 && g === '⭐⭐');
  p.grade_reason = `${freqTxt}${nutTxt}${rescued ? ' (영양 우수)' : ''}`;
  cnt[lab] = (cnt[lab] || 0) + 1;
}
const byNm = Object.fromEntries(pool.map((p) => [p.nm, p]));
for (const it of light.ingredients) { const p = byNm[it.nm]; if (p) { it.grade = p.grade_label; it.grade_reason = p.grade_reason; } }
writeFileSync(ENR, JSON.stringify(enr));
writeFileSync(LIGHT, JSON.stringify(light));
console.log('재등급 분포:', JSON.stringify(cnt));
