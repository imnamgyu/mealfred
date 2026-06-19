/**
 * tests/coach-recos.test.ts — freqMap 어댑터 + Letter A 보존 회귀 (WBS EPIC A · A-11·A-01)
 */
import { describe, it, expect } from 'vitest';
import { normalizeFreqMap } from '../lib/coachMaterials';
import { popularDishesFor, GROUP_INGREDIENTS, buildRecoFacts, youaRankOf } from '../lib/coachRecos';

describe('⭐급식 순위(이사님 2026-06-19) — youaRankOf + buildRecoFacts 근거 주입', () => {
  it('youaRankOf — 수록 식재료는 순위/등장률, 미수록·_meta는 null(정직)', () => {
    const r = youaRankOf('당근');   // youa 98.6 상위권
    expect(r).not.toBeNull();
    expect(r!.topPct).toBeGreaterThanOrEqual(1);
    expect(r!.topPct).toBeLessThanOrEqual(100);
    expect(r!.pct).toBeGreaterThan(0);
    expect(youaRankOf('존재하지않는식재료xyz')).toBeNull();   // 미수록 — 0을 꼴등으로 위장 안 함
    expect(youaRankOf('_meta')).toBeNull();
  });
  it('동률 안전 순위 — 같은 등장률 식재료는 같은 순위(정수 등수 자의성 차단)', () => {
    const a = youaRankOf('당근'); const b = youaRankOf('두부');   // 둘 다 98.6
    if (a && b && a.pct === b.pct) expect(a.rank).toBe(b.rank);
  });
  it("buildRecoFacts — 추천 타깃 줄에 '급식에 자주 나오는' 근거 절(수록 식재료)", () => {
    const r = buildRecoFacts({ likedIngredients: [], targetIngredient: '당근', target: '비타민A채소' });
    expect(r.text).toContain('급식에 자주 나오는');
    expect(r.text).toMatch(/상위 \d+%/);
  });
  it('buildRecoFacts — youa 미수록 타깃은 근거 절 생략(degrade·현행 유지)', () => {
    const r = buildRecoFacts({ likedIngredients: [], targetIngredient: '존재하지않는식재료xyz', target: '곡류' });
    expect(r.text).not.toContain('급식에 자주 나오는');
  });
});

describe('⭐F-18 buildRecoFacts suppressCousins — 슬롯 활성 시 사촌(경쟁 두부원) 제거', () => {
  const liked = ['감자', '소고기', '계란'];   // 감자→사촌 두부가 part(b)로 새던 케이스
  it('기본은 part(b) 사촌 줄을 포함(잘 먹는 음식 푸드체이닝)', () => {
    const r = buildRecoFacts({ likedIngredients: liked, target: '비타민A채소', targetIngredient: '단호박' });
    expect(r.text).toContain('[오늘 타깃');           // part(a) 슬롯 타깃
    expect(r.lines.length).toBeGreaterThan(1);        // part(b) 사촌/궁합 줄 존재
  });
  it('suppressCousins=true면 part(b) 제거 → [오늘 타깃] 한 줄만(슬롯과 경쟁하는 두부 사촌 차단)', () => {
    const r = buildRecoFacts({ likedIngredients: liked, target: '비타민A채소', targetIngredient: '단호박', suppressCousins: true });
    expect(r.text).toContain('단호박');               // 슬롯 음식은 유지
    expect(r.cousins.length).toBe(0);                 // 사촌 0(두부 등 경쟁 음식 미발생)
    expect(r.lines.every((l) => l.includes('[오늘 타깃') )).toBe(true);   // 타깃 줄만
  });
});

describe('A-11 normalizeFreqMap — ingredient-recipes → FreqMap', () => {
  it('A-11-1 정상 객체를 freq 내림차순 정규화', () => {
    const fm = normalizeFreqMap({ 당근: [{ name: '볶음밥', freq: 10 }, { name: '국', freq: 30 }] });
    expect(fm['당근'].map((x) => x.name)).toEqual(['국', '볶음밥']);
  });
  it('A-11-2 null/형식불량 → {} (graceful)', () => {
    expect(normalizeFreqMap(null)).toEqual({});
    expect(normalizeFreqMap('str')).toEqual({});
    expect(normalizeFreqMap(42)).toEqual({});
  });
  it('A-11-3 배열 아닌 값·잘못된 항목 제거', () => {
    const fm = normalizeFreqMap({ 당근: 'nope', 시금치: [{ name: '국', freq: 5 }, { bad: 1 }] });
    expect(fm['당근']).toBeUndefined();
    expect(fm['시금치']).toEqual([{ name: '국', freq: 5 }]);
  });
  it('A-11-4 빈 배열 키는 결과에서 제외', () => {
    expect(normalizeFreqMap({ 당근: [] })).toEqual({});
  });
});

describe('A-11 popularDishesFor — freqMap 빈객체 시 kit-matrix 폴백(죽은 코드 방지)', () => {
  it('A-11-5 freqMap 미주입이어도 kit-matrix로 인기 음식 반환', () => {
    const dishes = popularDishesFor('당근');   // freqMap 없이
    expect(Array.isArray(dishes)).toBe(true);
    expect(dishes.length).toBeGreaterThan(0);   // kit-matrix(dishesForIngredient) 폴백 동작
  });
  it('A-11-6 freqMap 빈객체여도 폴백 동작(graceful)', () => {
    const dishes = popularDishesFor('당근', {});
    expect(dishes.length).toBeGreaterThan(0);
  });
});

describe('A-01 Letter A 보존 — GROUP_INGREDIENTS 원본 불변(대조군)', () => {
  it('A-01-7 비타민A채소 원본 0번은 여전히 단호박(정렬 변경 없음)', () => {
    expect(GROUP_INGREDIENTS['비타민A채소'][0]).toBe('단호박');
  });
  it('A-01-7b 기타채소 원본 순서 유지(브로콜리 먼저)', () => {
    expect(GROUP_INGREDIENTS['기타채소'][0]).toBe('브로콜리');
  });
});
