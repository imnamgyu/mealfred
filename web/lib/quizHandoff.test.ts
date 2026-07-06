import { describe, it, expect } from 'vitest';
import { parseQuizHandoff, quizWelcome, WRONG_HOOK } from './quizHandoff';

const qs = (s: string) => new URLSearchParams(s);

describe('parseQuizHandoff', () => {
  it('점수+오답 정상 파싱', () => {
    expect(parseQuizHandoff(qs('qz=60&qzw=1,9'))).toEqual({ score: 60, wrong: [1, 9] });
  });
  it('점수만 있어도 유효(오답 없음 = 만점)', () => {
    expect(parseQuizHandoff(qs('qz=100'))).toEqual({ score: 100, wrong: [] });
  });
  it('qz 없음/빈값/숫자 아님/범위 밖 → null', () => {
    expect(parseQuizHandoff(qs('utm_source=cookie'))).toBeNull();
    expect(parseQuizHandoff(qs('qz='))).toBeNull();
    expect(parseQuizHandoff(qs('qz=abc'))).toBeNull();
    expect(parseQuizHandoff(qs('qz=-10'))).toBeNull();
    expect(parseQuizHandoff(qs('qz=105'))).toBeNull();
  });
  it('qzw의 범위 밖·비정수 항목은 걸러진다(변조 URL 안전)', () => {
    expect(parseQuizHandoff(qs('qz=50&qzw=2,99,x,-1,9'))).toEqual({ score: 50, wrong: [2, 9] });
  });
});

describe('quizWelcome', () => {
  it('70점 이상 = 합격 어투 + 첫 오답 훅 호명', () => {
    const w = quizWelcome({ score: 80, wrong: [9] });
    expect(w.title).toContain('80점');
    expect(w.title).toContain('합격');
    expect(w.body).toContain(WRONG_HOOK[9]);
  });
  it('70점 미만 = 위로 어투(no-blame) + 첫 오답 훅 호명', () => {
    const w = quizWelcome({ score: 40, wrong: [1, 3] });
    expect(w.title).toContain('40점');
    expect(w.body).toContain('괜찮아요');
    expect(w.body).toContain(WRONG_HOOK[1]);
  });
  it('오답 없으면(만점) 훅 없는 실전 안내', () => {
    const w = quizWelcome({ score: 100, wrong: [] });
    expect(w.title).toContain('합격');
    expect(w.body).toContain('실전');
  });
});
