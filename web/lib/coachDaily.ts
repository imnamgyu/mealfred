/**
 * lib/coachDaily.ts — 코칭 크론 공유 순수 함수.
 *
 * 컷오버 플래그 판정(v3/compare/brain 코호트), 주간 후보 신호 빌더(buildCandSignals),
 * 질문 답변 → evidence 파서(parseProbeAnswers). 전부 순수 함수·LLM 0콜 — 크론(H-02)이 호출한다.
 */
import { UNITS, type UnitId, type CRow, type ProbeAnswer } from './curriculumUnits';

const age = (today: string, d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 86400000);

// ── 컷오버 플래그(순수 판정 — 테스트 가능) ───────────────────────────────────────
// COACH_V3=1 → 전체 ON · COACH_V3_CHILDREN=id1,id2 → 카나리아. 미설정 = 기존 경로(즉시 롤백=env 끄기).
/** CSV 코호트 파싱 — split/trim/filter 관용구 단일 소스(v3Enabled·compareEnabled·brainEnabled 공유). */
function parseCohort(csv: string | undefined): string[] {
  return (csv || '').split(',').map((s) => s.trim()).filter(Boolean);
}
export function v3Enabled(env: { COACH_V3?: string; COACH_V3_CHILDREN?: string }, childId: string): boolean {
  if (env.COACH_V3 === '1') return true;
  return parseCohort(env.COACH_V3_CHILDREN).includes(childId);
}

// ── compare(A/B 2통 발행) 판정. 별도 env로 롤백 토글 1회. ─────────────────────────
// COACH_COMPARE=1 → 전체 ON(승격용) · COACH_COMPARE_CHILDREN(있으면) 또는 폴백 COACH_V3_CHILDREN 코호트.
//   ⚠️ COACH_COMPARE_CHILDREN이 '설정'되면(빈문자 제외) V3 폴백을 무시 — compare 명단이 단일 진실(E-01-8).
export function compareEnabled(
  env: { COACH_COMPARE?: string; COACH_COMPARE_CHILDREN?: string; COACH_V3_CHILDREN?: string },
  childId: string,
): boolean {
  if (env.COACH_COMPARE === '1') return true;
  const csv = (env.COACH_COMPARE_CHILDREN && env.COACH_COMPARE_CHILDREN.trim())
    ? env.COACH_COMPARE_CHILDREN : env.COACH_V3_CHILDREN;
  return parseCohort(csv).includes(childId);
}

// ── 7-A(이사님 2026-06-15) — 일간 두뇌(Sonnet 전술) A/B 카나리아 판정. v3Enabled와 동형. ──────────
// COACH_BRAIN=1 → 전체 ON · COACH_BRAIN_CHILDREN=id,.. → 카나리아. 미설정 = 두뇌 OFF(기존 결정론 시나리오).
//   라이브 영향 0(env 없으면 항상 false) — 켜는 건 ops 결정(env). QA용 ?brain=1은 라우트에서 OR로 별도 유지.
export function brainEnabled(env: { COACH_BRAIN?: string; COACH_BRAIN_CHILDREN?: string }, childId: string): boolean {
  if (env.COACH_BRAIN === '1') return true;
  return parseCohort(env.COACH_BRAIN_CHILDREN).includes(childId);
}

// ── E-03 신호 빌더 — 주간 후보 산출용 CandidateSignals를 rows에서 계산(크론 H-02가 runWeeklyPlanning에 주입) ──
const SIG_PRESSURE_RE = /한\s?입만|다\s?먹어|먹어야|억지로|혼냈|먹이려/;
const SIG_BARGAIN_RE = /먹으면\s|줄게|사줄게|상으로|보상으로/;
const SIG_PREMEAL_RE = /(저녁|밥|끼니)\s?(직전|전)에?\s?(간식|우유|주스)/;
export function buildCandSignals(rows: CRow[], today: string, attendsDaycare: boolean): import('./curriculumUnits').CandidateSignals {
  const w7 = rows.filter((r) => { const a = age(today, r.log_date); return a >= 1 && a <= 7; });
  const env = w7.filter((r) => r.environment && r.place !== 'daycare');   // ⭐ 5-B(이사님 2026-06-15) 집 끼니만 — 식사환경은 부모 통제 가능한 집 기준(주간 종합 structuredSummary와 일관)
  const auto = w7.filter((r) => r.autonomy);
  const tex = w7.filter((r) => r.texture);
  const mt = w7.filter((r) => typeof r.meal_time === 'number');
  const memoDays = (re: RegExp) => new Set(w7.filter((r) => r.note && re.test(r.note)).map((r) => r.log_date)).size;
  const snackBy: Record<string, number> = {};
  w7.forEach((r) => { if ((r.slot || '').includes('snack')) snackBy[r.log_date] = (snackBy[r.log_date] || 0) + 1; });
  // 신규 식재료(28일 창 — food-bridge 트리거)
  const prior = rows.filter((r) => { const a = age(today, r.log_date); return a > 7 && a <= 28; });
  const seen = new Set(prior.flatMap((r) => r.menus || []));
  const newFoods = new Set(w7.flatMap((r) => r.menus || []).filter((m) => m && !seen.has(m)));
  const refusedAll = new Set<string>();
  const refusedDc = new Set<string>();
  rows.forEach((r) => String(r.refused || '').split(/[,，·]/).forEach((t) => {
    const k = t.trim();
    if (!k) return;
    refusedAll.add(k);
    if (r.place === 'daycare') refusedDc.add(k);
  }));
  return {
    envBadPct: env.length ? env.filter((r) => r.environment !== 'table').length / env.length : null, envCount: env.length,
    selfPct: auto.length ? auto.filter((r) => r.autonomy === 'self').length / auto.length : null, autoCount: auto.length,
    texLow: tex.length >= 3 && tex.filter((r) => r.texture === 'puree' || r.texture === 'mashed').length / tex.length > 0.5, texCount: tex.length,
    mtOver30Pct: mt.length ? mt.filter((r) => (r.meal_time as number) >= 30).length / mt.length : null, mtCount: mt.length,
    missingCount: 0,   // 영양 파이프라인 산출(크론이 fg.missing으로 덮음)
    refusedCount: refusedAll.size, dcRefusedCount: refusedDc.size,
    pressureMemoDays: memoDays(SIG_PRESSURE_RE), bargainMemoDays: memoDays(SIG_BARGAIN_RE),
    snackHeavyDays: Object.values(snackBy).filter((n) => n >= 3).length, preMealMemoDays: memoDays(SIG_PREMEAL_RE),
    newFoodCount: newFoods.size, attendsDaycare, eatenCount: new Set(rows.flatMap((r) => r.menus || [])).size,
  };
}

// ── G-04 — 답변 → evidence 파서(칩 정확 일치만 — '잘 모르겠어요'는 표본 미적립) ──
export function parseProbeAnswers(qs: Array<{ q_date: string; answer: string | null; context: Record<string, unknown> | null }>): ProbeAnswer[] {
  const out: ProbeAnswer[] = [];
  for (const q of qs || []) {
    const up = (q.context as { unitProbe?: { unit_id?: string; signal?: string; probeId?: string } } | null)?.unitProbe;
    if (!up?.unit_id || !up.signal) continue;
    const a = (q.answer || '').trim();
    if (!a || a === '잘 모르겠어요') continue;          // 무지 존중 — 미적립
    const def = UNITS[up.unit_id as UnitId];
    if (!def) continue;
    const probe = def.probes.find((pr) => pr.id === up.probeId);
    if (!probe || !probe.chips.includes(a)) continue;   // 자유 텍스트·미지 칩은 보수적 미적립
    out.push({ q_date: q.q_date, unit_id: up.unit_id, signal: up.signal, value: a });
  }
  return out;
}
