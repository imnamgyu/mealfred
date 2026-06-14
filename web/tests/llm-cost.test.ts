/**
 * llmCost — 토큰→원가 환산 박제(유지비용 실측 정확성).
 */
import { describe, it, expect } from 'vitest';
import { familyOf, costUsdOf, aggregateUsage, krw, KRW_PER_USD, type UsageRec } from '../lib/llmCost';

describe('familyOf', () => {
  it('모델 문자열로 패밀리 분류', () => {
    expect(familyOf('claude-haiku-4-5-20251001')).toBe('haiku');
    expect(familyOf('claude-sonnet-4-6')).toBe('sonnet');
    expect(familyOf('claude-opus-4-8')).toBe('opus');
    expect(familyOf('unknown')).toBe('other');
  });
});

describe('costUsdOf — 단가 정확', () => {
  it('Haiku: in 1000·out 500 = $0.0035 ($1/$5 per MTok)', () => {
    const c = costUsdOf({ model: 'claude-haiku-4-5', input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 });
    expect(c).toBeCloseTo(0.001 + 0.0025, 9);
  });
  it('Sonnet: in 1000·out 500 = $0.0105 ($3/$15)', () => {
    const c = costUsdOf({ model: 'claude-sonnet-4-6', input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 });
    expect(c).toBeCloseTo(0.003 + 0.0075, 9);
  });
  it('캐시 read=0.1×in, write=1.25×in (Haiku)', () => {
    const c = costUsdOf({ model: 'haiku', input: 0, output: 0, cacheRead: 1000, cacheWrite: 1000 });
    expect(c).toBeCloseTo(1000 * 0.10e-6 + 1000 * 1.25e-6, 9);
  });
});

describe('aggregateUsage — 패밀리별 합산 + 총원가 + 콜수', () => {
  const recs: UsageRec[] = [
    { model: 'claude-haiku-4-5', input: 2000, output: 600, cacheRead: 1500, cacheWrite: 0 },   // 편지 생성
    { model: 'claude-haiku-4-5', input: 700, output: 600, cacheRead: 300, cacheWrite: 0 },      // 퇴고
    { model: 'claude-sonnet-4-6', input: 2500, output: 700, cacheRead: 0, cacheWrite: 0 },      // 주간
  ];
  it('콜수=3, 패밀리별 토큰 합', () => {
    const a = aggregateUsage(recs);
    expect(a.calls).toBe(3);
    expect(a.fam.haiku.input).toBe(2700);
    expect(a.fam.haiku.output).toBe(1200);
    expect(a.fam.haiku.cacheRead).toBe(1800);
    expect(a.fam.sonnet.input).toBe(2500);
    expect(a.fam.sonnet.output).toBe(700);
  });
  it('총원가 = 각 콜 원가 합', () => {
    const a = aggregateUsage(recs);
    const manual = recs.reduce((s, r) => s + costUsdOf(r), 0);
    expect(a.costUsd).toBeCloseTo(manual, 9);
  });
  it('빈 입력 = 0원·0콜', () => {
    const a = aggregateUsage([]);
    expect(a.calls).toBe(0);
    expect(a.costUsd).toBe(0);
  });
});

describe('krw 환산', () => {
  it('USD×환율', () => { expect(krw(1)).toBe(KRW_PER_USD); });
});
