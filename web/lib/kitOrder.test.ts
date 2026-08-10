import { describe, it, expect } from 'vitest';
import { validateKitOrder, capUsePoints, normalizePhone, GOLLO_WEEK_PRICE, FOCUS_COURSES } from './kitOrder';

const base = {
  kit_type: 'gollo',
  recipient_name: '임남규',
  phone: '010-1234-5678',
  address: '부산광역시 남구 문현동 123-4 501호',
  use_points: 5000,
};

describe('normalizePhone', () => {
  it('하이픈·공백 섞인 입력을 숫자만으로 정규화한다', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
    expect(normalizePhone('010 1234 5678')).toBe('01012345678');
    expect(normalizePhone('01112345678')).toBe('01112345678');
  });
  it('01로 시작하지 않거나 자릿수가 다르면 거부한다', () => {
    expect(normalizePhone('02-123-4567')).toBeNull();
    expect(normalizePhone('0101234')).toBeNull();
    expect(normalizePhone('010123456789')).toBeNull();
    expect(normalizePhone(1012345678 as unknown as string)).toBeNull();
  });
});

describe('validateKitOrder', () => {
  it('골고루 정상 payload를 정규화해 통과시킨다', () => {
    const r = validateKitOrder(base);
    expect(r).not.toBeNull();
    expect(r!.kit_type).toBe('gollo');
    expect(r!.course).toBeNull();
    expect(r!.phone).toBe('01012345678');
    expect(r!.use_points).toBe(5000);
  });
  it('집중은 코스 필수 + 9종 안에서만 허용한다', () => {
    expect(validateKitOrder({ ...base, kit_type: 'focus' })).toBeNull();
    expect(validateKitOrder({ ...base, kit_type: 'focus', course: '치킨' })).toBeNull();
    const r = validateKitOrder({ ...base, kit_type: 'focus', course: '당근' });
    expect(r!.course).toBe('당근');
  });
  it('kit_type 오타·이름 공백·짧은 주소·음수 포인트를 거부한다', () => {
    expect(validateKitOrder({ ...base, kit_type: 'box' })).toBeNull();
    expect(validateKitOrder({ ...base, recipient_name: '   ' })).toBeNull();
    expect(validateKitOrder({ ...base, address: '부산' })).toBeNull();
    expect(validateKitOrder({ ...base, use_points: -100 })).toBeNull();
    expect(validateKitOrder(null)).toBeNull();
  });
  it('use_points 누락·비수치는 0으로, 소수는 내림 처리한다', () => {
    expect(validateKitOrder({ ...base, use_points: undefined })!.use_points).toBe(0);
    expect(validateKitOrder({ ...base, use_points: '5000' })!.use_points).toBe(0);
    expect(validateKitOrder({ ...base, use_points: 100.9 })!.use_points).toBe(100);
  });
  it('이름 40자·주소 200자 초과를 거부한다', () => {
    expect(validateKitOrder({ ...base, recipient_name: '가'.repeat(41) })).toBeNull();
    expect(validateKitOrder({ ...base, address: '가'.repeat(201) })).toBeNull();
  });
});

describe('capUsePoints', () => {
  it('잔액·골고루 첫 주 가격 중 작은 값까지만 허용한다', () => {
    expect(capUsePoints(50_000, 8_500, 'gollo')).toBe(8_500);
    expect(capUsePoints(50_000, 100_000, 'gollo')).toBe(GOLLO_WEEK_PRICE);
    expect(capUsePoints(3_000, 8_500, 'gollo')).toBe(3_000);
  });
  it('집중 키트(가격 미확정)는 항상 0', () => {
    expect(capUsePoints(50_000, 100_000, 'focus')).toBe(0);
  });
  it('음수·소수 방어', () => {
    expect(capUsePoints(-500, 8_500, 'gollo')).toBe(0);
    expect(capUsePoints(100.7, 8_500, 'gollo')).toBe(100);
  });
});

describe('FOCUS_COURSES', () => {
  it('집중 코스 9종 정본(당근~가지)과 일치한다', () => {
    expect(FOCUS_COURSES).toHaveLength(9);
    expect(FOCUS_COURSES).toContain('당근');
    expect(FOCUS_COURSES).toContain('가지');
  });
});
