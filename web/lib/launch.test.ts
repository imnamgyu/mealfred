import { describe, it, expect } from 'vitest';
import { isPrelaunch, launchCopy, LAUNCH_MONTH_LABEL } from './launch';

describe('launch (11월 정식 출시 · 테스터 모집)', () => {
  it('출시 전(2026-09)에는 prelaunch=true, 출시월 이후엔 false', () => {
    expect(isPrelaunch(new Date('2026-09-07T12:00:00+09:00'))).toBe(true);
    expect(isPrelaunch(new Date('2026-10-31T23:59:00+09:00'))).toBe(true);
    expect(isPrelaunch(new Date('2026-11-01T00:00:00+09:00'))).toBe(false);
    expect(isPrelaunch(new Date('2026-12-01T00:00:00+09:00'))).toBe(false);
  });
  it('출시 전 문구는 출시월과 테스터 모집을 담고, 출시 후엔 무료체험 문구로 돌아간다', () => {
    const pre = launchCopy(new Date('2026-09-07T12:00:00+09:00'));
    expect(pre.pre).toBe(true);
    expect(pre.badge).toContain(LAUNCH_MONTH_LABEL);
    expect(pre.badge).toContain('테스터');
    expect(pre.ctaTitle).toContain('출시 알림');
    const post = launchCopy(new Date('2026-11-15T12:00:00+09:00'));
    expect(post.pre).toBe(false);
    expect(post.badge).toContain('첫 달 무료');
    expect(post.ctaTitle).not.toContain('출시 알림');
  });
});
