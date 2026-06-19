/**
 * F-17 골든 — step 누적 서사(사다리) 직조. step 23일 1단 고착 → 진도감 0 봉합을 박제.
 * buildLetterUser가 weeklyArc.stepStory의 mode/단계/캠페인일에 따라 '진도/졸업/길/연속감' 한 구절 지시를 넣는지.
 */
import { describe, it, expect } from 'vitest';
import { buildLetterUser, type LetterInput } from '../lib/coach';

const arc = (stage: LetterInput['weeklyArc'] extends infer T ? T extends { stage: infer S } ? S : never : never, story: NonNullable<NonNullable<LetterInput['weeklyArc']>['stepStory']> | null) =>
  ({ stage, behaviorGoal: '하루 한 끼 화면 끄고 식탁에서', implIntention: null, progressNote: null, stepStory: story } as NonNullable<LetterInput['weeklyArc']>);
const story = (o: Partial<NonNullable<NonNullable<LetterInput['weeklyArc']>['stepStory']>> = {}) =>
  ({ mode: 'deepen', stepNum: 1, totalSteps: 2, prevBehavior: null, nextBehavior: '주 5끼+ 같은 자리·같은 시간', unitLabel: '식탁 무대', unitDays: 5, ...o });
const base = (a: NonNullable<LetterInput['weeklyArc']>): LetterInput => ({ childName: '아린', ageBand: '5y', weeklyArc: a, daySeed: 100 });

describe('F-17 — step 사다리 누적 서사 직조', () => {
  it('advance(step 승급) = 이전 단계 회고 "진도 한 구절" 지시 포함', () => {
    const u = buildLetterUser(base(arc('how', story({ mode: 'advance', stepNum: 2, prevBehavior: '하루 한 끼 화면 끄고 식탁에서', nextBehavior: null }))));
    expect(u).toContain('진도 한 구절');
    expect(u).toContain('하루 한 끼 화면 끄고 식탁에서');   // 이전 단계 behavior 인용
  });
  it('celebrate(졸업) = "졸업 한 구절" + 다음 걸음 예고', () => {
    const u = buildLetterUser(base(arc('reinforce', story({ mode: 'celebrate', nextBehavior: '주 5끼+ 같은 자리·같은 시간' }))));
    expect(u).toContain('졸업 한 구절');
    expect(u).toContain('식탁 무대');
  });
  it('deepen + 캠페인 4일+ + observe 단계 = "길 한 구절"(다음 단계 방향) 포함', () => {
    const u = buildLetterUser(base(arc('observe', story({ mode: 'deepen', unitDays: 7, nextBehavior: '주 5끼+ 같은 자리·같은 시간' }))));
    expect(u).toContain('길 한 구절');
    expect(u).toContain('주 5끼+ 같은 자리·같은 시간');
  });
  it("deepen + 'how' 단계(intro/observe 아님)는 '길 preview' 미노출(매일 앵무새 방지)", () => {
    const u = buildLetterUser(base(arc('how', story({ mode: 'deepen', unitDays: 5 }))));
    expect(u).not.toContain('길 한 구절');
  });
  it('캠페인 6일+ = 연속감 한 구절(매일 끊긴 게 아니라 이어지는 흐름)', () => {
    const u = buildLetterUser(base(arc('how', story({ mode: 'deepen', unitDays: 8, nextBehavior: null }))));
    expect(u).toContain('연속감 한 구절');
  });
  it('캠페인 짧음(3일) + 비전환 = 사다리 구절 없음(초기엔 조용히)', () => {
    const u = buildLetterUser(base(arc('how', story({ mode: 'deepen', unitDays: 3 }))));
    expect(u).not.toContain('길 한 구절');
    expect(u).not.toContain('연속감 한 구절');
  });
  it('stepStory 없으면 사다리 구절 0(현행 byte 영향 없음)', () => {
    const u = buildLetterUser(base(arc('how', null)));
    expect(u).not.toContain('진도 한 구절');
    expect(u).not.toContain('길 한 구절');
    expect(u).not.toContain('졸업 한 구절');
  });
});
