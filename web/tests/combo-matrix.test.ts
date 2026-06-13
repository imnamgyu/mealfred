/**
 * tests/combo-matrix.test.ts — 괴식 조합 검증기 (WBS EPIC A · A-03)
 * 인계서 6/8 괴식 교훈 박제: '미역국+당근'(score 1) 차단 · '볶음밥/카레/덮밥+당근'(score 3) 통과.
 */
import { describe, it, expect } from 'vitest';
import { scoreCombo, isComboOk } from '../lib/comboMatrix';

describe('A-03 scoreCombo — kit-dish-matrix 정성채점', () => {
  it('A-03-1 미역국+당근=1 (matrix·괴식)', () => {
    const r = scoreCombo('미역국', '당근');
    expect(r.score).toBe(1);
    expect(r.source).toBe('matrix');
  });
  it('A-03-2 볶음밥+당근=3 (matrix·OK)', () => {
    expect(scoreCombo('볶음밥', '당근')).toEqual({ score: 3, source: 'matrix' });
  });
  it('A-03-3 카레+당근=3 · 덮밥+당근=3 · 비빔밥+당근=3 (OK)', () => {
    expect(scoreCombo('카레', '당근').score).toBe(3);
    expect(scoreCombo('덮밥', '당근').score).toBe(3);
    expect(scoreCombo('비빔밥', '당근').score).toBe(3);
  });
  it('A-03-4 국+당근=2 (matrix·임계)', () => {
    expect(scoreCombo('국', '당근').score).toBe(2);
  });
  it('A-03-5 미수록 조합 → none·score 0 (보수적 금지)', () => {
    const r = scoreCombo('존재하지않는음식zzz', '당근');
    expect(r.score).toBe(0);
    expect(r.source).toBe('none');
  });
  it('A-03-6 점수는 항상 0~3 범위', () => {
    for (const d of ['볶음밥', '미역국', '국', '김밥', '카레', '된장국·찌개']) {
      const s = scoreCombo(d, '당근').score;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(3);
    }
  });
});

describe('A-03 isComboOk — 임계 게이트', () => {
  it('A-03-7 미역국+당근(1) → 차단 (threshold 2)', () => {
    expect(isComboOk('미역국', '당근')).toBe(false);
  });
  it('A-03-8 볶음밥+당근(3) → 통과', () => {
    expect(isComboOk('볶음밥', '당근')).toBe(true);
  });
  it('A-03-9 국+당근(2) → 통과 (경계값 포함)', () => {
    expect(isComboOk('국', '당근')).toBe(true);
  });
  it('A-03-10 threshold 3이면 국+당근(2) 차단·볶음밥(3) 통과', () => {
    expect(isComboOk('국', '당근', 3)).toBe(false);
    expect(isComboOk('볶음밥', '당근', 3)).toBe(true);
  });
  it('A-03-11 미수록 조합은 어떤 임계에서도 차단', () => {
    expect(isComboOk('존재하지않는음식zzz', '당근', 1)).toBe(false);
  });
});
