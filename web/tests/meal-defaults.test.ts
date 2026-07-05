/**
 * 식단입력 패턴 prefill 골든 — 최빈값 계산·요일타입 폴백 + ⭐추정(inferred) 제외(2026-07-05).
 * 무접촉 prefill이 다시 학습 표본이 되는 자기강화 루프 차단: 명시 입력만 최빈값에 들어간다.
 */
import { describe, it, expect } from 'vitest';
import { computeMealDefaults, pickDefault, dayTypeOf } from '../lib/mealDefaults';

const MON = '2026-06-15'; const TUE = '2026-06-16'; const SAT = '2026-06-20';

describe('dayTypeOf', () => {
  it('평일/주말 구분', () => {
    expect(dayTypeOf(MON)).toBe('weekday');
    expect(dayTypeOf(SAT)).toBe('weekend');
  });
});

describe('computeMealDefaults — 최빈값', () => {
  it('slot×요일타입별 최빈 장소', () => {
    const md = computeMealDefaults([
      { slot: 'lunch', log_date: MON, place: 'daycare' },
      { slot: 'lunch', log_date: TUE, place: 'daycare' },
      { slot: 'lunch', log_date: SAT, place: 'home' },
    ]);
    expect(pickDefault(md, 'lunch', MON).place).toBe('daycare');
    expect(pickDefault(md, 'lunch', SAT).place).toBe('home');
  });
  it('⭐inferred_fields에 오른 값은 학습 제외 — 추정이 최빈값을 굳히지 않음', () => {
    const md = computeMealDefaults([
      { slot: 'dinner', log_date: MON, environment: 'table' },                                          // 명시 1건
      { slot: 'dinner', log_date: TUE, environment: 'screen', inferred_fields: ['environment'] },       // 추정(carry-forward 저장분)
      { slot: 'dinner', log_date: '2026-06-17', environment: 'screen', inferred_fields: ['environment'] },
      { slot: 'dinner', log_date: '2026-06-18', environment: 'screen', inferred_fields: ['environment'] },
    ]);
    expect(pickDefault(md, 'dinner', MON).environment).toBe('table');   // 추정 3건이 명시 1건을 못 이김
  });
  it('inferred는 필드 단위 — 같은 행의 다른 명시 필드는 학습됨', () => {
    const md = computeMealDefaults([
      { slot: 'dinner', log_date: MON, environment: 'table', texture: 'table', inferred_fields: ['environment'] },
    ]);
    const d = pickDefault(md, 'dinner', MON);
    expect(d.environment).toBeNull();       // 추정 필드만 제외
    expect(d.texture).toBe('table');        // 명시 필드는 유지
  });
  it('요일타입 폴백 — 해당 타입 없으면 반대 타입', () => {
    const md = computeMealDefaults([{ slot: 'breakfast', log_date: MON, meal_time: 8 }]);
    expect(pickDefault(md, 'breakfast', SAT).mealTime).toBe(8);
  });
});
