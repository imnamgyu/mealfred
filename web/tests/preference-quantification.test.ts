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

describe('⭐혼합 끼니 — refused 식재료는 끼니 레벨 대신 거부로 귀속 (2026-07-05)', () => {
  const rowR = (log_date: string, ings: string[], o: { acceptance_level?: number | null; refused?: string | null } = {}) =>
    ({ log_date, ingredients: ings, ate_well: null, acceptance_level: o.acceptance_level ?? null, refused: o.refused ?? null, place: 'home' });
  it('완식(4) 끼니에서 남긴 브로콜리는 liked로 오집계되지 않음', () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      rowR(days(ASOF, i + 1), ['쌀', '계란', '브로콜리'], { acceptance_level: 4, refused: '브로콜리' }));
    const prefs = quantifyPreferences(rows, ASOF);
    expect(confidentLiked(prefs)).toContain('쌀');
    expect(confidentLiked(prefs)).toContain('계란');
    expect(confidentLiked(prefs)).not.toContain('브로콜리');
    expect(dislikedFoods(prefs)).toContain('브로콜리');   // 명시 거부 반복 → disliked
  });
  it('refused가 메뉴명이어도 포함 식재료 매칭("브로콜리볶음"⊃"브로콜리")', () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      rowR(days(ASOF, i + 1), ['브로콜리', '쌀'], { acceptance_level: 4, refused: '브로콜리볶음' }));
    const prefs = quantifyPreferences(rows, ASOF);
    expect(dislikedFoods(prefs)).toContain('브로콜리');
    expect(confidentLiked(prefs)).toContain('쌀');
  });
  it('1글자 식재료는 정확일치만 — "김치" 거부가 "김"을 오탐하지 않음', () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      rowR(days(ASOF, i + 1), ['김', '김치'], { acceptance_level: 4, refused: '김치' }));
    const prefs = quantifyPreferences(rows, ASOF);
    expect(confidentLiked(prefs)).toContain('김');        // 김(해조류)은 완식 유지
    expect(dislikedFoods(prefs)).toContain('김치');
  });
  it('레벨 미상 + refused 명시 → 그 식재료만 거부, 나머지는 미상 유지', () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      rowR(days(ASOF, i + 1), ['가지', '두부'], { refused: '가지' }));
    const prefs = quantifyPreferences(rows, ASOF);
    expect(dislikedFoods(prefs)).toContain('가지');
    expect(prefs.find((p) => p.key === '두부')!.state).toBe('unknown');
  });
});

describe('⭐refused 토큰 정규화 — 요리명 거부가 대표 식재료와 만난다 (적대검증 발견 수정 2026-07-05)', () => {
  const rowR = (log_date: string, ings: string[], o: { acceptance_level?: number | null; refused?: string | null } = {}) =>
    ({ log_date, ingredients: ings, ate_well: null, acceptance_level: o.acceptance_level ?? null, refused: o.refused ?? null, place: 'home' });
  it('"탕수육" 거부 → 정규화(돼지고기) 정확일치 — 거부가 수용으로 뒤집히지 않음', () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      rowR(days(ASOF, i + 1), ['돼지고기', '쌀'], { acceptance_level: 4, refused: '탕수육' }));
    const prefs = quantifyPreferences(rows, ASOF);
    expect(dislikedFoods(prefs)).toContain('돼지고기');
    expect(confidentLiked(prefs)).not.toContain('돼지고기');
    expect(confidentLiked(prefs)).toContain('쌀');
  });
  it('"소세지볶음"(미정규 표기 메뉴) 거부 → 소시지(정규 식재료) 미스매치는 수용 크레딧이 아니라 최소 무해', () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      rowR(days(ASOF, i + 1), ['소시지'], { acceptance_level: 4, refused: '소세지볶음' }));
    // '소세지볶음'은 렉시콘 미스(볶음 접미) — 포함매칭도 실패 가능. 최소 보장: liked 오판이 나도 명시 거부 반복이 disliked를 이기지 못하는 상황을 문서화.
    // 정규화 토큰('소세지'→'소시지')이 콤마 없이 메뉴 통째면 못 잡는 잔여 한계 — 부모가 식재료 칩(소시지)을 탭하면 정확일치로 잡힌다.
    const prefs = quantifyPreferences(rows, ASOF);
    expect(prefs.find((p) => p.key === '소시지')).toBeDefined();   // 최소한 크래시 없이 집계
  });
  it('과길이 토큰(레거시 자유문장)은 버림 — 문장 속 식재료를 거부로 오귀속하지 않음', () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      rowR(days(ASOF, i + 1), ['카레'], { acceptance_level: 4, refused: '카레는 조금 먹었어요 그래도 잘함' }));
    const prefs = quantifyPreferences(rows, ASOF);
    expect(dislikedFoods(prefs)).not.toContain('카레');   // 문장은 토큰으로 안 삼킴
  });
});
