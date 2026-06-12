/**
 * scripts/gen-synthetic.mjs — 합성 가정 생성기 (WBS I-02)
 * node scripts/gen-synthetic.mjs → tests/fixtures/synthetic-families.json
 *
 * 30가정 × 28일 meal_logs 합성(결정론 시드 — 재실행해도 같은 산출).
 * 페르소나 축: 등원·기록률·환경(개선형/정체형/재발형)·자율성·질감·거부·메모 성향.
 * 리플레이(I-05)가 이 fixture로 v3 전체(판정→전개→조립)를 통주한다 — 매 배포의 리허설.
 */
import fs from 'node:fs';
import path from 'node:path';

// mulberry32 — 결정론 PRNG(시드 고정)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE = '2026-06-15';                  // 리플레이 '오늘'의 기준(테스트와 동일)
const DAYS = 28;                            // BASE-28 … BASE-1
const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

const MENUS = ['밥', '된장국', '계란말이', '두부조림', '김구이', '불고기', '미역국', '시금치나물', '감자볶음', '생선구이', '애호박전', '닭곰탕'];
const REFUSABLE = ['시금치', '두부', '생선', '버섯', '애호박'];
const TEX = ['puree', 'mashed', 'finger', 'table'];
const PRESSURE_NOTES = ['한 입만 더 먹자고 했어요', '다 먹어야 한다고 했더니 울었어요'];
const BARGAIN_NOTES = ['다 먹으면 줄게 했어요', '먹으면 사줄게라고 했어요'];
const PLAIN_NOTES = ['오늘은 기분 좋게 먹었어요', '반찬을 조금 남겼어요', '국만 먼저 먹었어요'];

function persona(i, r) {
  const arc = ['improving', 'flat', 'relapse'][i % 3];      // 환경 추세: 개선/정체/재발 — 전개 경로 3종을 고르게
  return {
    id: `fam${String(i + 1).padStart(2, '0')}`,
    arc,
    attendsDaycare: r() < 0.6,
    logRate: 0.55 + r() * 0.4,                              // 기록률 0.55~0.95(저기록 가정 = lowData 경로)
    envChipP: 0.4 + r() * 0.5,                              // env 칩 찍는 비율
    envBad0: 0.45 + r() * 0.45,                             // 시작 시점 화면·이동 비율
    autoSelfP: 0.15 + r() * 0.55,
    texLevel: Math.min(3, 1 + Math.floor(r() * 3)),
    refused: REFUSABLE.filter(() => r() < 0.3).slice(0, 2),
    pressureP: r() < 0.25 ? 0.25 : 0,                       // 일부 가정만 압박 메모 성향
    bargainP: r() < 0.2 ? 0.3 : 0,
    snackHeavyP: r() < 0.3 ? 0.5 : 0.1,                     // 그레이징 가정
  };
}

function envBadAt(p, dayIdx) {
  const t = dayIdx / DAYS;                                   // 0(과거)→1(현재)
  if (p.arc === 'improving') return Math.max(0.15, p.envBad0 - 0.5 * t);
  if (p.arc === 'relapse') return t < 0.7 ? Math.max(0.2, p.envBad0 - 0.4 * t) : Math.min(0.95, p.envBad0 + 0.2);
  return p.envBad0;                                          // flat = 정체(피벗 경로)
}

function genFamily(i) {
  const r = rng(20260615 + i * 7919);
  const p = persona(i, r);
  const rows = [];
  for (let d = 0; d < DAYS; d++) {
    const date = addD(BASE, -(DAYS - d));                    // 과거→어제
    if (r() > p.logRate) continue;                           // 통째 미기록일
    const envBad = envBadAt(p, d);
    const slots = ['breakfast', 'lunch', 'dinner'];
    for (const slot of slots) {
      if (slot === 'breakfast' && r() < 0.25) continue;
      const daycare = slot === 'lunch' && p.attendsDaycare;
      const menus = [MENUS[Math.floor(r() * MENUS.length)], MENUS[Math.floor(r() * MENUS.length)]];
      const refusedPick = !daycare && p.refused.length && r() < 0.3 ? p.refused[Math.floor(r() * p.refused.length)] : null;
      const note = r() < (p.pressureP || 0) ? PRESSURE_NOTES[Math.floor(r() * PRESSURE_NOTES.length)]
        : r() < (p.bargainP || 0) ? BARGAIN_NOTES[Math.floor(r() * BARGAIN_NOTES.length)]
        : r() < 0.15 ? PLAIN_NOTES[Math.floor(r() * PLAIN_NOTES.length)] : null;
      rows.push({
        log_date: date, slot, menus,
        refused: refusedPick, note,
        environment: !daycare && r() < p.envChipP ? (r() < envBad ? (r() < 0.7 ? 'screen' : 'roaming') : 'table') : null,
        place: daycare ? 'daycare' : 'home',
        ate_well: r() < 0.75,
        autonomy: !daycare && r() < 0.5 ? (r() < p.autoSelfP ? 'self' : 'fed') : null,
        texture: !daycare && r() < 0.4 ? TEX[Math.max(0, Math.min(3, p.texLevel - (r() < 0.2 ? 1 : 0)))] : null,
        meal_time: r() < 0.4 ? Math.round(15 + r() * 30) : null,
      });
    }
    const snacks = r() < p.snackHeavyP ? 3 : r() < 0.5 ? 1 : 0;
    for (let s = 0; s < snacks; s++) rows.push({
      log_date: date, slot: 'snack', menus: ['과일'], refused: null,
      note: snacks >= 3 && s === 0 && r() < 0.4 ? '저녁 직전에 간식을 달라고 해서 줬어요' : null,
      environment: null, place: 'home', ate_well: true, autonomy: null, texture: null, meal_time: null,
    });
  }
  return { ...p, base: BASE, rows };
}

const families = Array.from({ length: 30 }, (_, i) => genFamily(i));
const out = { generated: BASE, count: families.length, days: DAYS, families };
const dest = path.join(process.cwd(), 'tests', 'fixtures', 'synthetic-families.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
const totalRows = families.reduce((n, f) => n + f.rows.length, 0);
console.log(`OK ${families.length}가정 · ${totalRows}행 → ${dest}`);
console.log('arc 분포:', families.reduce((m, f) => ({ ...m, [f.arc]: (m[f.arc] || 0) + 1 }), {}));
