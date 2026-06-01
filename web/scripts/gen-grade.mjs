/**
 * gen-grade.mjs — 도감 2축 등급 (v2).
 *
 * 축①  별 ⭐ = '초등 급식에 자주 나오는 정도'(빈도). 순수 급식 등장횟수(count) 절대 기준(풀 변화에 안정).
 *        ⭐⭐⭐ 자주(200회+) / ⭐⭐ 가끔(50회+) / ⭐ 드물게(50 미만; count=0=급식 기록없는 영양추가) / 🔸 향신료(양념=도전식재료 제외).
 *        의미: 자주 나오니 미리 친해두면 학교 급식 적응이 쉽다.  (영양으로 별을 'rescue'하던 v1 로직 폐기)
 * 축②  💪 몸튼튼 영양 배지(must_eat) = 흔하면서 영양 풍부 → '급식에 자주 안 나와도 꼭 챙길' 통째식품.
 *        영양 역할 기반 큐레이션(lib/must-eat.json). nuPct(매핑영양소 개수) 프록시는 가공식품을 부풀려 폐기.
 *        고등어·멸치·미역·콩처럼 별이 적어도 여기서 빛난다.
 * 산출 → data_ingredient_pool_enriched.json(.pool) + public/ingredients-light.json 의
 *        grade / grade_label / grade_reason / must_eat / must_eat_tier / must_eat_nutrient / must_eat_reason.
 * 실행: cd web && node scripts/gen-grade.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
const ENR = '../data_ingredient_pool_enriched.json', LIGHT = 'public/ingredients-light.json';
const enr = JSON.parse(readFileSync(ENR, 'utf8')); const pool = enr.pool;
const light = JSON.parse(readFileSync(LIGHT, 'utf8'));
const mustEat = JSON.parse(readFileSync('lib/must-eat.json', 'utf8'));
const SEASON = new Set(['마늘', '파', '대파', '쪽파', '생강', '고추', '청양고추', '풋고추', '홍고추', '마늘종', '참깨', '들깨', '고춧가루', '고추가루']);
// 별 = 급식 등장 빈도 (절대 기준 — 풀 구성이 바뀌어도 안정적, grade_reason 문구와 항상 일치)
function star(count) {
  if ((count || 0) >= 200) return ['⭐⭐⭐', '자주'];
  if ((count || 0) >= 50) return ['⭐⭐', '가끔'];
  return ['⭐', '드물게']; }
const cnt = {}; let meCnt = 0;
for (const p of pool) {
  // 축② 영양 배지
  const me = mustEat[p.nm];
  if (me && me.tier) {
    p.must_eat = true; p.must_eat_tier = me.tier; p.must_eat_nutrient = me.nutrient; p.must_eat_reason = me.reason; meCnt++;
  } else { delete p.must_eat; delete p.must_eat_tier; delete p.must_eat_nutrient; delete p.must_eat_reason; }
  // 축① 별(빈도)
  if (SEASON.has(p.nm)) {
    p.grade = '🔸'; p.grade_label = '향신료'; p.grade_reason = '양념·향신료 (도전 식재료 제외)';
    cnt['향신료'] = (cnt['향신료'] || 0) + 1; continue;
  }
  const [g, lab] = star(p.count);
  p.grade = g; p.grade_label = lab;
  const c = p.count || 0;
  p.grade_reason = c === 0 ? '급식 기록은 없지만 영양으로 챙기는 식재료'
    : c >= 200 ? `초등 급식에 자주 나와요 (${c}회 등장)`
    : c >= 50 ? `급식에 가끔 나와요 (${c}회 등장)`
    : `급식엔 드물게 나와요 (${c}회 등장)`;
  cnt[lab] = (cnt[lab] || 0) + 1;
}
// ingredients-light 동기화(클라: 홈·도감그리드·박스)
const byNm = Object.fromEntries(pool.map((p) => [p.nm, p]));
for (const it of light.ingredients) {
  const p = byNm[it.nm]; if (!p) continue;
  it.grade = p.grade_label; it.grade_reason = p.grade_reason;
  if (p.must_eat) { it.must_eat = true; it.must_eat_tier = p.must_eat_tier; it.must_eat_nutrient = p.must_eat_nutrient; it.must_eat_reason = p.must_eat_reason; }
  else { delete it.must_eat; delete it.must_eat_tier; delete it.must_eat_nutrient; delete it.must_eat_reason; }
}
writeFileSync(ENR, JSON.stringify(enr));
writeFileSync(LIGHT, JSON.stringify(light));
console.log('별(빈도) 분포:', JSON.stringify(cnt), '| 💪 몸튼튼 영양 배지:', meCnt, '종');
const miss = Object.keys(mustEat).filter((k) => k !== '_meta' && !byNm[k]);
if (miss.length) console.log('⚠️ must-eat.json에 있으나 풀에 없는 이름:', miss.join(', '));
console.log('샘플:');
for (const nm of ['당근', '콩(대두)', '고등어', '멸치', '미역', '돼지고기', '마늘']) {
  const p = byNm[nm]; if (p) console.log(`  ${nm}: ${p.grade}(${p.grade_label}) "${p.grade_reason}"${p.must_eat ? ` | 💪${p.must_eat_tier}·${p.must_eat_nutrient}` : ''}`);
}
