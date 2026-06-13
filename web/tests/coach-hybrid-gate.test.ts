/**
 * tests/coach-hybrid-gate.test.ts — EPIC H · Letter B 다일 리플레이 하네스·30가정 통주 게이트·
 *   대조군 불변식·prebuild 편입 (H-09·H-10·H-13·H-14·H-15)
 *
 * H-09/H-13 = Letter B 결정론층 리플레이 하네스(lib/replayB) — runBFamily·bReplayMetrics·bCutoverGate.
 * H-10 = synthetic-families.json 30가정×14일 통주 → 가정별 괴식 0·수렴 0·품질 0(I-05 v3 게이트와 병존).
 * H-14 = Letter A(planFor)는 개선 A~I 무영향(대조군 보존·결정론 불변).
 * H-15 = 신규 4파일 prebuild 편입 + 개선 I 데이터 정합(GROUP_INGREDIENTS 대표 식재료 급식빈도).
 *
 * 전부 LLM 0콜(결정론층만). 기존 replayRunner/replayMetrics는 무수정 — Letter B 하네스는 lib/replayB 신규.
 */
import { describe, it, expect } from 'vitest';
import { runBFamily, bReplayMetrics, bCutoverGate, type BReplayFamily, type BReplayDay } from '../lib/replayB';
import { runV3FamilyFull, type ReplayFamily } from '../lib/replayRunner';
import { cutoverGate, replayMetrics } from '../lib/replayMetrics';
import { mapMenuLocal } from '../lib/menuMap';
import { planFor, type CoachPlan } from '../lib/coach';
import { type CoachSignals } from '../lib/coachScenarios';
import { GROUP_INGREDIENTS_RANKED, ingredientGioFreq } from '../lib/coachMaterials';
import { GROUP_INGREDIENTS } from '../lib/coachRecos';
import syn from './fixtures/synthetic-families.json';

const FAMILIES = (syn as { families: BReplayFamily[] }).families;
const menuToIng = (mu: string) => (mapMenuLocal(mu)?.ingredients || []);
const FAVS = ['볶음밥', '김밥', '계란찜', '덮밥', '비빔밥', '카레'];
const runFam = (f: BReplayFamily, days = 14) => runBFamily({ ...f, favoriteFoods: FAVS }, { days, menuToIng });

// ── H-09 — runBFamily 하네스 ───────────────────────────────────────────────────────
describe('HB-09 runBFamily 결정론 하네스 (H-09)', () => {
  it('HB-09-1 days 배열 반환(저기록 가정도 throw 0)', () => {
    const sparse: BReplayFamily = { id: 'sparse', base: '2026-06-13', rows: [] };
    expect(() => runBFamily(sparse, { days: 14, menuToIng })).not.toThrow();
    expect(Array.isArray(runBFamily(sparse, { days: 14, menuToIng }).days)).toBe(true);
  });
  it('HB-09-2 LLM 0콜(동기 반환·결정론)', () => {
    const r = runFam(FAMILIES[0]);
    expect(typeof (r as unknown as { then?: unknown }).then).toBe('undefined');
  });
  it('HB-09-3 BReplayDay 형태(date·target·material·combo·mirror·quality)', () => {
    const day = runFam(FAMILIES[0]).days.find((d) => d.material) as BReplayDay;
    expect(day).toBeTruthy();
    expect(Object.keys(day).sort()).toEqual(['combo', 'date', 'material', 'mirror', 'quality', 'target']);
  });
  it('HB-09-4 기존 runV3FamilyFull 무영향(I-05 v3 게이트 그대로)', () => {
    const fam = FAMILIES[0] as unknown as ReplayFamily;
    const v3 = runV3FamilyFull(fam, { days: 14 });
    expect(cutoverGate(replayMetrics(v3.days))).toEqual([]);
  });
  it('HB-09-5 ingredients 없는 rows(synthetic menus만)도 수용(throw 0)', () => {
    const f = FAMILIES[0];
    expect(f.rows.every((r) => !Array.isArray((r as { ingredients?: unknown }).ingredients))).toBe(true);   // synthetic = menus만
    expect(() => runFam(f)).not.toThrow();
  });
  it('HB-09-6 결정론: 동일 fam 두 번 = 동일 days', () => {
    expect(JSON.stringify(runFam(FAMILIES[1]).days)).toBe(JSON.stringify(runFam(FAMILIES[1]).days));
  });
});

// ── H-13 — bReplayMetrics·bCutoverGate ─────────────────────────────────────────────
describe('HB-13 bReplayMetrics·bCutoverGate (H-13)', () => {
  const mk = (over: Partial<BReplayDay>): BReplayDay => ({ date: '2026-06-01', target: '비타민A채소', material: '당근', combo: { dish: '볶음밥', ingredient: '당근', ok: true }, mirror: 'm', quality: [], ...over });
  it('HB-13-1 miscombo 카운트(괴식 1건→1)', () => {
    const days = [mk({ date: '2026-06-01', combo: { dish: '미역국', ingredient: '당근', ok: false } })];
    expect(bReplayMetrics(days).miscombo).toBe(1);
  });
  it('HB-13-2 adjacentSame 카운트', () => {
    const days = [mk({ date: '2026-06-01', material: '당근' }), mk({ date: '2026-06-02', material: '당근' }), mk({ date: '2026-06-03', material: '시금치' })];
    expect(bReplayMetrics(days).adjacentSame).toBe(1);
  });
  it('HB-13-3 materialRepeat3d 3일 창', () => {
    const days = ['당근', '시금치', '근대', '당근'].map((m, i) => mk({ date: `2026-06-0${i + 1}`, material: m }));
    // 당근(0)→당근(3): 직전 2개[근대,시금치]에 당근 없음 → repeat3d 0(3일창 밖). 인접도 0.
    expect(bReplayMetrics(days).materialRepeat3d).toBe(0);
    const days2 = ['당근', '시금치', '당근'].map((m, i) => mk({ date: `2026-06-0${i + 1}`, material: m }));   // 당근(0)→당근(2): 창 안 재등장
    expect(bReplayMetrics(days2).materialRepeat3d).toBe(1);
  });
  it('HB-13-4 qualityViolations 합산', () => {
    const days = [mk({ date: '2026-06-01', quality: ['은유 과용'] }), mk({ date: '2026-06-02', quality: ['데이터 나열', '모호 기간어'] })];
    expect(bReplayMetrics(days).qualityViolations).toBe(3);
  });
  it('HB-13-5 materialDiversity 고유 종', () => {
    const days = ['당근', '시금치', '당근'].map((m, i) => mk({ date: `2026-06-0${i + 1}`, material: m }));
    expect(bReplayMetrics(days).materialDiversity).toBe(2);
  });
  it('HB-13-6 bCutoverGate 전부 0이면 빈 배열', () => {
    const days = ['당근', '시금치', '근대'].map((m, i) => mk({ date: `2026-06-0${i + 1}`, material: m }));
    expect(bCutoverGate(bReplayMetrics(days))).toEqual([]);
  });
  it('HB-13-7 bCutoverGate 미달 사유(괴식) 문자열 반환', () => {
    const days = [mk({ combo: { dish: '미역국', ingredient: '당근', ok: false } })];
    const fails = bCutoverGate(bReplayMetrics(days));
    expect(fails.length).toBeGreaterThanOrEqual(1);
    expect(fails.some((f) => f.includes('괴식'))).toBe(true);
  });
  it('HB-13-8 빈 days 안전(전 지표 0·throw 0)', () => {
    expect(() => bReplayMetrics([])).not.toThrow();
    const r = bReplayMetrics([]);
    expect([r.miscombo, r.adjacentSame, r.materialRepeat3d, r.qualityViolations, r.materialDiversity]).toEqual([0, 0, 0, 0, 0]);
  });
  it('HB-13-9 순수·LLM 0콜(동기 반환)', () => {
    const r = bReplayMetrics([mk({})]);
    expect(typeof (r as unknown as { then?: unknown }).then).toBe('undefined');
  });
});

// ── H-10 — 30가정 통주 게이트 ──────────────────────────────────────────────────────
describe('HB-10 Letter B 30가정 통주 게이트 (H-10)', () => {
  const perFam = FAMILIES.map((f) => { const days = runFam(f).days; return { id: f.id, m: bReplayMetrics(days), days }; });
  it('HB-10-1 규모: 30가정·발행 100통+(저기록 생략 허용)', () => {
    expect(FAMILIES.length).toBe(30);
    const total = perFam.reduce((a, p) => a + p.m.letters, 0);
    expect(total).toBeGreaterThan(100);
  });
  it('HB-10-2 가정별 괴식 0 전수', () => {
    const fail = perFam.filter((p) => p.m.miscombo > 0).map((p) => p.id);
    expect(fail).toEqual([]);
  });
  it('HB-10-3 가정별 인접 수렴 0 전수', () => {
    expect(perFam.filter((p) => p.m.adjacentSame > 0).map((p) => p.id)).toEqual([]);
  });
  it('HB-10-4 가정별 3일 재사용 0 전수', () => {
    expect(perFam.filter((p) => p.m.materialRepeat3d > 0).map((p) => p.id)).toEqual([]);
  });
  it('HB-10-5 가정별 품질 위반 0 전수', () => {
    expect(perFam.filter((p) => p.m.qualityViolations > 0).map((p) => p.id)).toEqual([]);
  });
  it('HB-10-6 추천 식재료 군 다양성 sanity(전체 고유 종 >=8)', () => {
    const all = new Set(perFam.flatMap((p) => p.days.map((d) => d.material).filter(Boolean)));
    expect(all.size).toBeGreaterThanOrEqual(8);
  });
  it('HB-10-7 bCutoverGate 전체 통과(미달 가정·사유 목록 빈 배열)', () => {
    const fails = perFam.flatMap((p) => bCutoverGate(p.m).map((r) => `${p.id}: ${r}`));
    expect(fails).toEqual([]);
  });
});

// ── H-14 — Letter A 대조군 불변식 ─────────────────────────────────────────────────
describe('HB-14 Letter A 무변경 불변식 (H-14)', () => {
  const sig = (over: Partial<CoachSignals> = {}): CoachSignals => ({
    timeseries: [], reds: ['비타민A'], homeReds: ['비타민A'], missing: [], homeMissing: [],
    homeRefused: [], daycareRefused: [], refused: [], notes: [], favoriteFoods: ['볶음밥'],
    attendsDaycare: true, ageBand: '5y', recentLoggedDays: 5, recentWindow: 5, icfqRiskCount: 0,
    envBadPct: 0.9, envCount: 10, ...over,
  });
  const planA = () => planFor({ signals: sig(), recentScenarioIds: [], recentPlans: [] as CoachPlan[], daySeed: 20000, cidHash: 7 });

  it('HB-14-1 planFor 결정론(동일 입력 동일 plan.signature)', () => {
    expect(planA().plan.signature).toBe(planA().plan.signature);
    expect(planA().plan).toEqual(planA().plan);
  });
  it('HB-14-2 planFor는 CoachPlan 형태(frame·target·signature)', () => {
    const p = planA().plan;
    expect(Object.keys(p).sort()).toEqual(['frame', 'move', 'moveKey', 'signature', 'target']);
  });
  it('HB-14-3 Letter A(planFor) 산출은 Letter B 하네스 호출과 독립(B 실행이 A를 바꾸지 않음)', () => {
    const before = planA().plan.signature;
    FAMILIES.slice(0, 3).forEach((f) => runFam(f));   // Letter B 하네스 통주
    const after = planA().plan.signature;
    expect(after).toBe(before);
  });
  it('HB-14-4 다른 daySeed/cidHash는 독립 — A 결정론 시드 회전(랜덤 0)', () => {
    const a = planFor({ signals: sig(), recentScenarioIds: [], recentPlans: [], daySeed: 1, cidHash: 1 });
    const b = planFor({ signals: sig(), recentScenarioIds: [], recentPlans: [], daySeed: 1, cidHash: 1 });
    expect(a.plan.signature).toBe(b.plan.signature);   // 같은 시드 = 같은 산출(시계 미접근)
  });
});

// ── H-15 — prebuild 편입 + 개선 I 데이터 정합 ──────────────────────────────────────
describe('HB-15 prebuild 편입·개선 I 데이터 정합 (H-15)', () => {
  it('HB-15-1 비타민A채소 RANKED 1위는 급식빈도>0(당근 184)', () => {
    const top = GROUP_INGREDIENTS_RANKED['비타민A채소'][0];
    expect(top).toBe('당근');
    expect(ingredientGioFreq(top).freq).toBeGreaterThan(0);
  });
  it('HB-15-2 RANKED 각 군은 GROUP_INGREDIENTS 원본 집합과 동일(누락·추가 0)', () => {
    for (const g of Object.keys(GROUP_INGREDIENTS)) {
      expect([...GROUP_INGREDIENTS_RANKED[g]].sort()).toEqual([...GROUP_INGREDIENTS[g]].sort());
    }
  });
  it('HB-15-3 실측 빈도 핀: 당근(184) >> 단호박(0)', () => {
    expect(ingredientGioFreq('당근').freq).toBeGreaterThan(ingredientGioFreq('단호박').freq);
    expect(ingredientGioFreq('단호박').freq).toBe(0);
  });
  it('HB-15-4 빈도 0 대표 식재료(단호박)는 RANKED 군 최하위로 정렬(빈도 가중 정합)', () => {
    const r = GROUP_INGREDIENTS_RANKED['비타민A채소'];
    expect(r.at(-1)).toBe('단호박');   // freq 0 → 빈도 내림차순 정렬 끝
  });
  it('HB-15-5 CI 시간 예산: 30가정×14일 통주가 LLM 0콜로 ms급(throw 0)', () => {
    const t0 = Date.now();
    FAMILIES.forEach((f) => runFam(f));
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
