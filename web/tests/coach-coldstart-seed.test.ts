/**
 * 콜드스타트 시드 사다리 골든 — 이사님 2026-06-19.
 * 확신 liked가 없을 때 추천 앵커가 두부 디폴트로 무너지지 않게: Tier2(자주 차려진)→Tier3(youa 급식 고빈도).
 */
import { describe, it, expect } from 'vitest';
import { coldStartSeed, groupOfIngredient } from '../lib/coachRecos';

describe('coldStartSeed — 콜드스타트 추천 앵커 사다리', () => {
  it('Tier2 우선 — 자주 차려진 음식(servedIngredients)이 시드 앞에', () => {
    const seed = coldStartSeed(['소고기', '감자'], 6);
    expect(seed[0]).toBe('소고기');   // 자주 차려진 게 먼저
    expect(seed).toContain('감자');
  });
  it('Tier3 폴백 — 자주 차려진 게 없으면 youa 급식 고빈도(당근·소고기 등)로 채움', () => {
    const seed = coldStartSeed([], 6);
    expect(seed.length).toBeGreaterThan(0);
    expect(seed.length).toBeLessThanOrEqual(6);
    // youa 상위(당근·소고기·두부·닭고기 등) 중 식품군 인식되는 것
    expect(seed.every((s) => !!groupOfIngredient(s))).toBe(true);
  });
  it('간식채널(과일) 제외 — 끼니 추천 앵커이므로', () => {
    const seed = coldStartSeed(['사과', '바나나', '소고기'], 6);
    expect(seed).not.toContain('사과');
    expect(seed).not.toContain('바나나');
    expect(seed).toContain('소고기');
  });
  it('중복 제거 + 식품군 인식되는 표준 식재료만(사촌/궁합 그래프 진입 가능)', () => {
    const seed = coldStartSeed(['소고기', '소고기', '알수없는음식xyz'], 6);
    expect(seed.filter((s) => s === '소고기').length).toBe(1);
    expect(seed).not.toContain('알수없는음식xyz');
  });
});
