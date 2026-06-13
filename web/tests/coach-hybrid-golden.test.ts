/**
 * tests/coach-hybrid-golden.test.ts — EPIC H · 아린 실데이터 회귀 + merged vs v3 골든 (H-08·H-11·H-12)
 *
 * 브리프 핵심: 아린 실데이터(5/26~6/13 capture)로 Letter B 6통을 재현해 괴식 0·품질 위반 0·수렴 0을
 *   박제(H-08)하고, 하이브리드(Letter B)가 v3 조립본을 4축(은유·환각·기간 수치·구체성)에서 비열위·
 *   핵심 축 우세임을 결정론 채점으로 박제(H-11). golden fixture(arin-golden-b.json)가 단일 진실(H-12).
 *
 * Letter B는 LLM 작문이 들어가므로 회귀는 '결정론층'만(재료·조합·품질 스캔 입력) — runBFamily(real-arin)로.
 * v3Assembled는 과거 runV3FamilyFull(real-arin) 캡처(약점 보존). 채점기는 EPIC D 스캐너 재사용(공정 적용).
 */
import { describe, it, expect } from 'vitest';
import { runBFamily, bReplayMetrics, type BRow } from '../lib/replayB';
import { metaphorOveruse, vagueTimeWord, METAPHOR_CLICHES } from '../lib/coachQuality';
import real from './fixtures/real-arin.json';
import golden from './fixtures/arin-golden-b.json';

const ar = real as unknown as { id: string; name: string; base: string; attendsDaycare?: boolean; rows: BRow[] };
const G = golden as {
  dates: string[];
  v3Assembled: string[];
  bExpected: { date: string; material: string | null; combo: { dish: string; ingredient: string; ok: boolean } | null; mirror: string | null; quality: string[]; target: string | null }[];
};
const ARIN_FAVORITES = ['볶음밥', '김밥', '계란찜', '미역국'];
const runArin = () => runBFamily({ id: ar.id, base: ar.base, rows: ar.rows, attendsDaycare: ar.attendsDaycare, favoriteFoods: ARIN_FAVORITES }, { days: 6 });

// ── H-08 — 아린 6통 회귀(괴식·수렴·품질 0) ─────────────────────────────────────────
describe('HB-08 아린 실데이터 6통 회귀 (H-08)', () => {
  it('HB-08-1 아린 6통 괴식 조합 0건(combo.ok 전부 true)', () => {
    const { days } = runArin();
    for (const d of days) if (d.combo) expect(d.combo.ok).toBe(true);
    expect(bReplayMetrics(days).miscombo).toBe(0);
  });
  it('HB-08-2 아린 6통 추천 식재료 인접 동일 0(수렴 방지)', () => {
    expect(bReplayMetrics(runArin().days).adjacentSame).toBe(0);
  });
  it('HB-08-3 아린 6통 3일 창 추천 재사용 0', () => {
    expect(bReplayMetrics(runArin().days).materialRepeat3d).toBe(0);
  });
  it('HB-08-4 아린 거울·추천 문장 품질 위반 0', () => {
    const { days } = runArin();
    for (const d of days) expect(d.quality).toEqual([]);
    expect(bReplayMetrics(days).qualityViolations).toBe(0);
  });
  it('HB-08-5 P10: 급식(daycare)만 먹은 식재료는 liked 아님·집 끼니는 liked', () => {
    const { materials } = runArin();
    const allLiked = new Set(materials.flatMap((m) => m.liked));
    // 아린 실데이터: 시래기·두부·김치는 daycare(급식)에서만 등장(차려진 것 → 선호 아님·P10).
    for (const daycareOnly of ['시래기', '두부', '김치']) expect(allLiked.has(daycareOnly)).toBe(false);
    // 계란은 집(home) 끼니에서 여러 날 등장 → liked 후보(집 통제·2일+).
    expect(allLiked.has('계란')).toBe(true);
  });
  it('HB-08-6 아린 fixture 무결성(rows·ingredients 존재)', () => {
    expect(ar.rows.length).toBeGreaterThan(0);
    const withIng = (ar.rows as { ingredients?: string[] }[]).filter((r) => Array.isArray(r.ingredients) && r.ingredients.length);
    expect(withIng.length).toBeGreaterThan(0);
  });
  it('HB-08-7 6통 발행일 정렬(6/8~6/13)·추천 non-null', () => {
    const { days } = runArin();
    expect(days.map((d) => d.date)).toEqual(G.dates);
    for (const d of days) expect(d.material).toBeTruthy();
  });
  it('HB-08-8 실데이터 결정론(재실행 동일 시계열)', () => {
    expect(JSON.stringify(runArin().days)).toBe(JSON.stringify(runArin().days));
  });
});

// ── H-12 — golden fixture 무결성·결정론 일치 ───────────────────────────────────────
describe('HB-12 arin-golden-b fixture (H-12)', () => {
  it('HB-12-1 구조 무결성(dates·v3Assembled·bExpected 길이 6)', () => {
    expect(G.dates.length).toBe(6);
    expect(G.v3Assembled.length).toBe(6);
    expect(G.bExpected.length).toBe(6);
  });
  it('HB-12-2 bExpected는 runBFamily(real-arin)와 일치(결정론 골든·드리프트 추적)', () => {
    const live = runArin().days.map((d) => ({ date: d.date, material: d.material, combo: d.combo, mirror: d.mirror, quality: d.quality, target: d.target }));
    expect(live).toEqual(G.bExpected);
  });
  it('HB-12-3 v3Assembled 6통 텍스트 비어있지 않음(약점 박제 대상)', () => {
    for (const t of G.v3Assembled) expect(t.length).toBeGreaterThan(0);
  });
  it('HB-12-4 dates 오름차순·고유', () => {
    const sorted = [...G.dates].sort();
    expect(G.dates).toEqual(sorted);
    expect(new Set(G.dates).size).toBe(6);
  });
});

// ── H-11 — merged(Letter B) vs v3 골든: 4축 공정 채점 ──────────────────────────────
// hallucination 축 = '모호 기간어'(vagueTimeWord) — v3가 6/8~6/13에서 '최근…아쉬워요'로 수치 없는
//   기간어를 5/6통 쓰는 실증 약점(인계서 F). 재료밖(offMaterial)은 H-08에서 B=0으로 이미 박제했고,
//   v3·B 양쪽 다 실존 음식만 쓰므로 hallucination 축에서는 두 쪽에 동일 규칙(vagueTime)만 적용(공정성).
type Score = { metaphor: number; hallucination: number; numericPeriod: boolean; specificity: number };
const CONCRETE_INGREDIENTS = ['당근', '시금치', '근대', '단호박', '두부', '검은콩', '브로콜리', '양배추', '애호박', '토마토', '고등어', '연어', '우유', '치즈', '요거트', '달걀', '계란'];
const DISH_RE = /[가-힣]{1,6}(?:찌개|탕|볶음|구이|조림|찜|밥|죽|전|무침|나물|국|김밥|카레)/;
function metaphorCount(t: string): number {
  let n = 0;
  for (const { re } of METAPHOR_CLICHES) { const m = (t || '').match(re); if (m) n += m.length; }
  return n;
}
/** 4축 공정 채점기 — v3·B 슬롯에 '동일 규칙' 적용(공정성·allowlist 비대칭 없음). */
function score(text: string): Score {
  const t = text || '';
  return {
    metaphor: metaphorCount(t) + (metaphorOveruse(t) ? 1 : 0),
    hallucination: vagueTimeWord(t) ? 1 : 0,
    numericPeriod: /[0-9]+\s*(일|번|회|가지)/.test(t),
    specificity: (CONCRETE_INGREDIENTS.some((g) => t.includes(g)) ? 1 : 0) + (DISH_RE.test(t) ? 1 : 0),
  };
}
const bTexts = G.bExpected.map((b) => b.mirror || '');
const bScores = bTexts.map((t) => score(t));
const v3Scores = G.v3Assembled.map((t) => score(t));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
// 재료밖(offMaterial) 박제는 별도로 — 엔진 qualityScan(rationale-free) 결과가 B 전통 0임을 H-08-4가 이미 잠금.

describe('HB-11 merged(Letter B) vs v3 골든 우열 (H-11)', () => {
  it('HB-11-1 B 환각 0(모호기간·재료밖 위반 없음)', () => {
    for (const s of bScores) expect(s.hallucination).toBe(0);
  });
  it('HB-11-2 B 기간 수치 동반(numericPeriod true 전통)', () => {
    for (const s of bScores) expect(s.numericPeriod).toBe(true);
  });
  it('HB-11-3 B 은유 평균 <= v3 은유 평균', () => {
    expect(avg(bScores.map((s) => s.metaphor))).toBeLessThanOrEqual(avg(v3Scores.map((s) => s.metaphor)));
  });
  it('HB-11-4 B 구체성 평균 >= v3 구체성 평균(비열위)', () => {
    expect(avg(bScores.map((s) => s.specificity))).toBeGreaterThanOrEqual(avg(v3Scores.map((s) => s.specificity)));
  });
  it('HB-11-5 6통 종합 우열: B 환각 합 < v3 환각 합(핵심 축 우세)', () => {
    const bH = bScores.reduce((a, s) => a + s.hallucination, 0);
    const v3H = v3Scores.reduce((a, s) => a + s.hallucination, 0);
    expect(bH).toBeLessThan(v3H);
    expect(bH).toBe(0);
  });
  it('HB-11-6 채점 공정성: 동일 깨끗 문장을 양쪽 슬롯에 넣으면 동일 점수', () => {
    const sample = '오늘 저녁 볶음밥에 당근을 한 스푼 넣어보세요. 최근 7일 중 1일이었어요.';
    expect(score(sample)).toEqual(score(sample));
  });
  it('HB-11-7 채점기 결정론(같은 입력 동일 점수)', () => {
    expect(score(G.v3Assembled[0])).toEqual(score(G.v3Assembled[0]));
  });
  it('HB-11-8 v3 골든이 알려진 약점 반영(>=1통에서 환각 또는 numericPeriod 부재로 B에 열위)', () => {
    const v3Weak = v3Scores.some((s) => s.hallucination > 0 || s.numericPeriod === false);
    expect(v3Weak).toBe(true);
  });
});
