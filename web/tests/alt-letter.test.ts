/**
 * tests/alt-letter.test.ts — pickAltLetter 순수 함수 검증 (WBS v2-하이브리드 EPIC F · F-01 17케이스 + F-02/F-08 회귀)
 *
 * 무영향 원칙: altLetter가 없거나·실패·letter 비유효 → null → 단일 카드(Letter A) 보존.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickAltLetter } from '../lib/altLetter';

describe('F-01 pickAltLetter — Letter B 안전 추출', () => {
  it('F-01-1 정상 altLetter 추출', () => {
    expect(pickAltLetter({ altLetter: { letter: 'B편지', oneliner: '한줄' } })).toEqual({
      letter: 'B편지', oneliner: '한줄', design: null, mirror: null, materials: null,
    });
  });
  it('F-01-2 altLetter 없음 → null', () => {
    expect(pickAltLetter({ reds: ['철'], mirror: '거울' })).toBeNull();
  });
  it('F-01-3 context null → null', () => {
    expect(pickAltLetter(null)).toBeNull();
  });
  it('F-01-4 context undefined → null', () => {
    expect(pickAltLetter(undefined)).toBeNull();
  });
  it('F-01-5 letter 빈 문자열 → null(빈 카드 방지)', () => {
    expect(pickAltLetter({ altLetter: { letter: '', oneliner: 'x' } })).toBeNull();
  });
  it('F-01-6 letter 공백만 → null', () => {
    expect(pickAltLetter({ altLetter: { letter: '   ' } })).toBeNull();
  });
  it('F-01-7 letter 비-문자열(숫자) → null', () => {
    expect(pickAltLetter({ altLetter: { letter: 123 } })).toBeNull();
  });
  it('F-01-8 altLetter 비-객체(문자열) → null', () => {
    expect(pickAltLetter({ altLetter: 'B편지' })).toBeNull();
  });
  it('F-01-9 oneliner 비-문자열 → null로 정규화', () => {
    expect(pickAltLetter({ altLetter: { letter: 'B', oneliner: 42 } })?.oneliner).toBeNull();
  });
  it('F-01-10 oneliner 누락 → null', () => {
    expect(pickAltLetter({ altLetter: { letter: 'B' } })?.oneliner).toBeNull();
  });
  it('F-01-11 mirror·design 통과', () => {
    const r = pickAltLetter({ altLetter: { letter: 'B', mirror: '거울문', design: 'hybrid-merged' } });
    expect(r?.mirror).toBe('거울문');
    expect(r?.design).toBe('hybrid-merged');
  });
  it('F-01-12 materials(객체 요약본) 통과 — 실제 크론 shape', () => {
    const r = pickAltLetter({ altLetter: { letter: 'B', materials: { food: '당근', reason: '철분', targetGroup: '채소', combos: [{ dish: '볶음밥', ingredient: '당근', score: 3 }], reasonPhrases: ['철분이 부족해요'] } } });
    expect(r?.materials).toEqual({ food: '당근', reason: '철분', targetGroup: '채소', combos: [{ dish: '볶음밥', ingredient: '당근', score: 3 }], reasonPhrases: ['철분이 부족해요'] });
  });
  it('F-01-13 materials 비-객체(문자열) → null', () => {
    expect(pickAltLetter({ altLetter: { letter: 'B', materials: '당근' } })?.materials).toBeNull();
  });
  it('F-01-14 materials.reason 누락 → null(형식 불량)', () => {
    expect(pickAltLetter({ altLetter: { letter: 'B', materials: { food: '당근' } } })?.materials).toBeNull();
  });
  it('F-01-15 입력 context 불변(순수성)', () => {
    const ctx = { altLetter: { letter: 'B', materials: { reason: 'r', combos: [{ dish: 'd', ingredient: 'i', score: 1 }] } } };
    const snapshot = JSON.parse(JSON.stringify(ctx));
    pickAltLetter(ctx);
    expect(ctx).toEqual(snapshot);   // 변형 없음
  });
  it('F-01-16 altLetter=null(명시적) → null', () => {
    expect(pickAltLetter({ altLetter: null })).toBeNull();
  });
  it('F-01-17 중첩 unexpected 키 무시', () => {
    const r = pickAltLetter({ altLetter: { letter: 'B', extra: { x: 1 } } });
    expect(r?.letter).toBe('B');
  });
  it('F-01-18 failed 페이로드(letter 없음) → null(둘째 카드 생략)', () => {
    expect(pickAltLetter({ altLetter: { failed: true, reason: 'buildLetterB null' } })).toBeNull();
  });
  it('F-01-19 skipped 페이로드 → null', () => {
    expect(pickAltLetter({ altLetter: { skipped: true, reason: '예산 부족' } })).toBeNull();
  });
  it('F-01-20 materials.combos에 형식불량 원소 섞임 → 필터링', () => {
    const r = pickAltLetter({ altLetter: { letter: 'B', materials: { reason: 'r', combos: [{ dish: 'd', ingredient: 'i', score: 2 }, { dish: 'x' }, 'bad'] } } });
    expect(r?.materials?.combos).toEqual([{ dish: 'd', ingredient: 'i', score: 2 }]);
  });
});

// ── F-02/F-08 회귀 — coach_letters select에 context 포함 + 컴파일 시점 보장 ──────────────
describe('F-02 select에 context 포함(정적 회귀)', () => {
  const page = readFileSync(join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  it('F-02-1 coach_letters select 4경로 모두 context 포함', () => {
    const selects = page.match(/from\('coach_letters'\)\s*[\s\S]*?\.select\(([^)]*)\)/g) || [];
    // 과거폴백·cached·gen·prevL 4곳 — 모두 'context'를 select
    expect(selects.length).toBeGreaterThanOrEqual(4);
    for (const s of selects) expect(s).toContain('context');
  });
  it('F-02-2 자녀 전환 시 altB 리셋 코드 존재', () => {
    expect(page).toContain('setAltB(null)');
  });
  it('F-08-4 Letter A 본문은 항상 메인 letter(setAiLetter가 altB와 무관)', () => {
    // A 경로(setAiLetter(cached.letter))가 보존되는지 — altB는 setAltB로만 세팅
    expect(page).toContain('setAiLetter(cached.letter)');
    expect(page).toContain('setAltB(pickAltLetter');
  });
});
