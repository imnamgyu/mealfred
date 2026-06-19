/**
 * 선호계량화 모듈 골든 — 신호포착(이사님 2026-06-19).
 * 미상(null)을 liked로 오판하지 않고, 확신 신호(완식 반복)만 liked로. 집 필터·Wilson·5단계/이진 매핑·추세.
 */
import { describe, it, expect } from 'vitest';
import { acceptanceLevel, wilsonLower, quantifyPreferences, confidentLiked, dislikedFoods, exploringFoods } from '../lib/preferenceQuantification';

const row = (log_date: string, ings: string[], o: { ate_well?: boolean | null; acceptance_level?: number | null; place?: string } = {}) =>
  ({ log_date, ingredients: ings, ate_well: o.ate_well ?? null, acceptance_level: o.acceptance_level ?? null, place: o.place ?? 'home' });
const days = (asOf: string, n: number) => new Date(Date.parse(asOf) - n * 86400000).toISOString().slice(0, 10);
const ASOF = '2026-06-19';

describe('acceptanceLevel — 5단계 우선·이진 폴백', () => {
  it('acceptance_level 우선(0~4 클램프)', () => {
    expect(acceptanceLevel({ acceptance_level: 3 })).toBe(3);
    expect(acceptanceLevel({ acceptance_level: 9, ate_well: false })).toBe(4);   // 클램프 + level 우선
  });
  it('없으면 ate_well: true→4·false→0·null→미상(null)', () => {
    expect(acceptanceLevel({ ate_well: true })).toBe(4);
    expect(acceptanceLevel({ ate_well: false })).toBe(0);
    expect(acceptanceLevel({ ate_well: null })).toBeNull();
    expect(acceptanceLevel({})).toBeNull();
  });
});

describe('wilsonLower — 표본 적으면 보수적', () => {
  it('1/1은 확실 1.0이 아님(보수)', () => { expect(wilsonLower(1, 1)).toBeLessThan(0.5); });
  it('표본 늘면 상승', () => { expect(wilsonLower(8, 8)).toBeGreaterThan(wilsonLower(2, 2)); });
  it('n=0이면 0', () => { expect(wilsonLower(0, 0)).toBe(0); });
});

describe('quantifyPreferences — 상태 판정', () => {
  it('⭐미상(null) 반복은 liked 아님(unknown) — 아린 케이스(수용 오판 차단)', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row(days(ASOF, i + 1), ['소고기']));   // 전부 ate_well null
    const p = quantifyPreferences(rows, ASOF).find((x) => x.key === '소고기')!;
    expect(p.state).toBe('unknown');
    expect(confidentLiked(quantifyPreferences(rows, ASOF))).not.toContain('소고기');
  });
  it('완식 반복(확신)은 liked', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(days(ASOF, i + 1), ['두부'], { acceptance_level: 4 }));
    const p = quantifyPreferences(rows, ASOF).find((x) => x.key === '두부')!;
    expect(p.state).toBe('liked');
    expect(confidentLiked(quantifyPreferences(rows, ASOF))).toContain('두부');
  });
  it('거부 반복은 disliked', () => {
    const rows = Array.from({ length: 4 }, (_, i) => row(days(ASOF, i + 1), ['가지'], { acceptance_level: 0 }));
    expect(dislikedFoods(quantifyPreferences(rows, ASOF))).toContain('가지');
  });
  it('만짐·한입(1~2)은 exploring(진전 증거)', () => {
    const rows = [row(days(ASOF, 1), ['브로콜리'], { acceptance_level: 1 }), row(days(ASOF, 2), ['브로콜리'], { acceptance_level: 2 })];
    expect(exploringFoods(quantifyPreferences(rows, ASOF))).toContain('브로콜리');
  });
  it('⭐집 필터 — 기관(daycare) 끼니는 선호 산출 제외', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => row(days(ASOF, i + 1), ['시금치'], { acceptance_level: 4, place: 'daycare' })),
    ];
    const p = quantifyPreferences(rows, ASOF).find((x) => x.key === '시금치');
    expect(p).toBeUndefined();   // 기관만 먹은 건 집 선호로 안 침
  });
  it('추세 — 최근이 과거보다 높으면 rising', () => {
    const rows = [
      row(days(ASOF, 20), ['당근'], { acceptance_level: 0 }), row(days(ASOF, 18), ['당근'], { acceptance_level: 1 }),
      row(days(ASOF, 3), ['당근'], { acceptance_level: 3 }), row(days(ASOF, 1), ['당근'], { acceptance_level: 4 }),
    ];
    const p = quantifyPreferences(rows, ASOF).find((x) => x.key === '당근')!;
    expect(p.trend).toBe('rising');
  });
});
