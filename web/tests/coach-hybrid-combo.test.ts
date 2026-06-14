/**
 * tests/coach-hybrid-combo.test.ts — EPIC H · 괴식 조합 적대 게이트 (H-01·H-02)
 *
 * 개선 A의 조합 정합 검증기(comboMatrix.scoreCombo/isComboOk: kit-dish-matrix scores → food-graph
 *   pair → cells → none, 임계 2)가 괴식을 막고 OK 조합을 통과시키는지 H-01 골든으로 박제.
 *   'LLM이 조합을 지어내지 못하게 코드가 후보를 거른다'(6/8 미역국+당근 사고)의 회귀 잠금.
 *
 * comboFit(dish, ingredient) = { ok, via:'matrix'|'pair'|'none', score } 어댑터로 명세 H-02 시그니처를
 *   실제 export(scoreCombo)에 매핑(라이브 lib 무수정 — import만). via는 scoreCombo.source 그대로.
 */
import { describe, it, expect } from 'vitest';
import { scoreCombo, isComboOk } from '../lib/comboMatrix';
import kit from '../lib/kit-dish-matrix.json';
import golden from './fixtures/comboGolden.json';

const K = kit as { scores?: Record<string, Record<string, number>>; cells?: Record<string, Record<string, number>> };

/** 명세 H-02 시그니처 어댑터 — comboFit(dish, ingredient)→{ok,via,score}. via=scoreCombo.source. */
function comboFit(dish: string, ingredient: string): { ok: boolean; via: string; score: number } {
  const s = scoreCombo(dish, ingredient);
  return { ok: isComboOk(dish, ingredient), via: s.source, score: s.score };
}

type Case = { dish: string; ingredient: string; score: number; source: string; expect: string; via?: string; note?: string };
const G = golden as { block: Case[]; ok: Case[]; pairFallback: Case };

// ── H-01 — fixture 무결성·데이터 정합(드리프트 조기 포착) ──────────────────────────
describe('HB-01 comboGolden fixture 무결성 (H-01)', () => {
  it('HB-01-1 block·ok 배열이 비어있지 않음(>=3종씩)', () => {
    expect(G.block.length).toBeGreaterThanOrEqual(3);
    expect(G.ok.length).toBeGreaterThanOrEqual(3);
  });
  it('HB-01-2 block 케이스 점수가 실제 scoreCombo와 일치하고 임계 미만(<2)', () => {
    for (const c of G.block) {
      const s = scoreCombo(c.dish, c.ingredient);
      expect({ score: s.score, source: s.source }).toEqual({ score: c.score, source: c.source });
      expect(s.score).toBeLessThan(2);
    }
  });
  it('HB-01-3 ok 케이스 점수가 실제 scoreCombo와 일치하고 임계 이상(>=2)', () => {
    for (const c of G.ok) {
      const s = scoreCombo(c.dish, c.ingredient);
      expect({ score: s.score, source: s.source }).toEqual({ score: c.score, source: c.source });
      expect(s.score).toBeGreaterThanOrEqual(2);
    }
  });
  it("HB-01-4 짜파게티는 matrix dish 키 없음(pair 폴백 케이스 보존)", () => {
    expect(K.scores?.['짜파게티']).toBeUndefined();
    expect(G.pairFallback.dish).toBe('짜파게티');
  });
  it('HB-01-5 미역국+당근 골든이 block에 존재(괴식 박제)', () => {
    expect(G.block.some((c) => c.dish === '미역국' && c.ingredient === '당근')).toBe(true);
  });
});

// ── H-02 — comboFit 적대 검증(괴식 차단·OK 통과·임계·pair 폴백) ─────────────────────
describe('HB-02 comboFit 괴식 차단 (H-02)', () => {
  it('HB-02-1 미역국+당근 차단(matrix score 1·괴식 박제)', () => {
    const r = comboFit('미역국', '당근');
    expect(r.ok).toBe(false);
    expect(r.score).toBe(1);
    expect(r.via).toBe('matrix');
  });
  it('HB-02-2 볶음밥+당근 통과(score 3)', () => {
    expect(comboFit('볶음밥', '당근').ok).toBe(true);
  });
  it('HB-02-3 카레+당근 통과(score 3)', () => {
    expect(comboFit('카레', '당근').ok).toBe(true);
  });
  it('HB-02-4 임계 경계: matrixScore>=2 ⇔ ok===true (골든 전수)', () => {
    for (const c of [...G.block, ...G.ok]) {
      const r = comboFit(c.dish, c.ingredient);
      expect(r.ok).toBe(c.score >= 2);
      expect(r.ok).toBe(c.expect === 'ok');
    }
  });
  it('HB-02-5 matrix 미수록 dish는 강한 pair 폴백(시금치+당근 lift 1.58=strong 통과·당근+두부 lift 0.58=weak 차단)', () => {
    const r = comboFit('시금치', '당근');
    expect(K.scores?.['시금치']).toBeUndefined();   // matrix 키 없음 확인
    expect(r.ok).toBe(true);
    expect(r.via).toBe('pair');
    // ⭐ lift 재설계: 흔한 식재료 우연 동시출현(두부+당근 lift 0.58)은 strong 아니라 차단
    expect(comboFit('두부', '당근').ok).toBe(false);
  });
  it('HB-02-6 pair도 없는 무관 조합은 차단(미역국+초콜릿)', () => {
    const r = comboFit('미역국', '초콜릿');
    expect(r.ok).toBe(false);
    expect(r.via).toBe('none');
  });
  it('HB-02-7 오탐방지: ok 골든 전 항목 통과(정합 조합을 막지 않음)', () => {
    for (const c of G.ok) expect(comboFit(c.dish, c.ingredient).ok).toBe(true);
  });
  it('HB-02-8 block 골든 전 항목 차단(괴식 일괄)', () => {
    for (const c of G.block) expect(comboFit(c.dish, c.ingredient).ok).toBe(false);
  });
  it('HB-02-9 점수 미상 식재료(matrix·graph 둘 다 없음)는 보수적 차단', () => {
    expect(comboFit('미역국', '존재하지않는식재료').ok).toBe(false);
  });
  it('HB-02-10 짜파게티+당근: matrix 키 없음·pair 노드 없음 → 보수적 차단(폴백 음성)', () => {
    const r = comboFit('짜파게티', '당근');
    expect(r.ok).toBe(false);
    expect(r.via).toBe('none');
  });
  it('HB-02-11 방향 고정·throw 0: 식재료를 dish 위치에 넣어도 안전(ok=false)', () => {
    expect(() => comboFit('당근', '미역국')).not.toThrow();
    // 당근(=dish 위치)×미역국(=ingredient): scores['당근']['미역국'] 미수록 → none → false
    expect(comboFit('당근', '미역국').ok).toBe(false);
  });
  it('HB-02-12 빈/공백 입력 안전(throw 0·ok=false)', () => {
    expect(() => comboFit('', '당근')).not.toThrow();
    expect(comboFit('', '당근').ok).toBe(false);
    expect(comboFit('볶음밥', '').ok).toBe(false);
  });
});
