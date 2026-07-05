/**
 * quizStats — 편식 상식 점수 결과 적재 검증 + 오답률 집계 (/api/quiz-result 순수 로직).
 * 회귀방지: ①범위 밖 페이로드로 집계 오염 ②wrong 개수와 correct 불일치 ③오답률 정렬·백분율 계산.
 */
import { describe, it, expect } from 'vitest';
import { validateQuizPayload, aggregateQuizStats } from '../lib/quizStats';

const good = { tool: 'knowledge', qv: 'k1', score: 70, correct: 7, answers: [1, 2, 0, 3, 1, 1, 1, 1, 1, 1], wrong: [0, 4, 7] };

describe('validateQuizPayload', () => {
  it('정상 페이로드 통과', () => {
    expect(validateQuizPayload(good)).toEqual(good);
  });
  it('wrong 개수 ≠ 10-correct → 거부(내부 정합)', () => {
    expect(validateQuizPayload({ ...good, wrong: [0, 4] })).toBeNull();
    expect(validateQuizPayload({ ...good, correct: 10, wrong: [] })).toEqual({ ...good, correct: 10, wrong: [] });
  });
  it('범위 밖 값 거부 — score 101·correct 11·보기 인덱스 음수·소수', () => {
    expect(validateQuizPayload({ ...good, score: 101 })).toBeNull();
    expect(validateQuizPayload({ ...good, correct: 11 })).toBeNull();
    expect(validateQuizPayload({ ...good, answers: [-1, 2, 0, 3, 1, 1, 1, 1, 1, 1] })).toBeNull();
    expect(validateQuizPayload({ ...good, score: 70.5 })).toBeNull();
  });
  it('tool/qv 형식 강제(소문자 슬러그) + 배열 길이 캡', () => {
    expect(validateQuizPayload({ ...good, tool: 'DROP TABLE' })).toBeNull();
    expect(validateQuizPayload({ ...good, qv: '한글' })).toBeNull();
    expect(validateQuizPayload({ ...good, answers: Array.from({ length: 21 }, () => 1) })).toBeNull();
  });
  it('null·문자열·빈 객체 거부', () => {
    expect(validateQuizPayload(null)).toBeNull();
    expect(validateQuizPayload('x')).toBeNull();
    expect(validateQuizPayload({})).toBeNull();
  });
});

describe('aggregateQuizStats', () => {
  it('평균·분포·문항별 오답률(오답 많은 순)', () => {
    const rows = [
      { score: 100, wrong: [] },
      { score: 60, wrong: [0, 1, 4, 9] },
      { score: 60, wrong: [0, 1, 2, 9] },
      { score: 20, wrong: [0, 1, 2, 3, 4, 5, 6, 9] },
    ];
    const s = aggregateQuizStats(rows);
    expect(s.n).toBe(4);
    expect(s.avgScore).toBe(60);
    expect(s.scoreDist).toEqual({ '0-20': 1, '30-40': 0, '50-60': 2, '70-80': 0, '90-100': 1 });
    expect(s.wrongRate[0]).toEqual({ q: 1, wrongCount: 3, pct: 75 });     // Q1이 최다 오답
    expect(s.wrongRate.find((w) => w.q === 8)).toEqual({ q: 8, wrongCount: 0, pct: 0 });
  });
  it('빈 데이터 → n=0·avg null', () => {
    const s = aggregateQuizStats([]);
    expect(s.n).toBe(0);
    expect(s.avgScore).toBeNull();
    expect(s.wrongRate).toHaveLength(10);
  });
  it('wrong null(스키마 결측)·범위 밖 인덱스 무시', () => {
    const s = aggregateQuizStats([{ score: 50, wrong: null }, { score: 50, wrong: [99] }]);
    expect(s.n).toBe(2);
    expect(s.wrongRate.every((w) => w.wrongCount === 0)).toBe(true);
  });
});
