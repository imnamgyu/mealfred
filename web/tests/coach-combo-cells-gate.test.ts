/**
 * tests/coach-combo-cells-gate.test.ts — borderline LLM 점수(2) 실증 게이트 회귀 (떡+달걀 2차 사고)
 * kit-dish-matrix scores=2(LLM '괜찮음')라도 실제 레시피 동시출현(cells)이 약하면 차단.
 * 떡+달걀: score 2·cells 4 → 차단. 국+당근: score 2·cells 49 → 통과(실증됨).
 */
import { describe, it, expect } from 'vitest';
import { scoreCombo, isComboOk } from '../lib/comboMatrix';

describe('scoreCombo — borderline(2) cells 실증 게이트', () => {
  it('CG-1 떡+달걀(score2·cells4) → 강등·차단(LLM 의견만으론 추천 안 함)', () => {
    expect(isComboOk('떡', '달걀')).toBe(false);
    expect(scoreCombo('떡', '달걀').score).toBeLessThan(2);
  });
  it('CG-2 국+당근(score2·cells49) → 통과(실동시출현 충분)', () => {
    expect(isComboOk('국', '당근')).toBe(true);
  });
  it('CG-3 score 3(LLM 확신)은 cells 무관 통과(볶음밥+당근)', () => {
    expect(scoreCombo('볶음밥', '당근')).toEqual({ score: 3, source: 'matrix' });
    expect(isComboOk('볶음밥', '당근')).toBe(true);
  });
  it('CG-4 미역국+당근(score1)은 그대로 차단(괴식 박제 유지)', () => {
    expect(isComboOk('미역국', '당근')).toBe(false);
  });
});
