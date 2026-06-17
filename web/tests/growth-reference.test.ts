/**
 * growth-reference 골든 — BMI-for-age = WHO(0~35개월) + KDCA 2017 국내(36개월+).
 * KDCA 공식 percentile 앵커(남/여 5·7세)로 회귀 박제. 미러 전사 오류·보간 깨짐 방지.
 * 출처 검증: lib/kdca-bmi-lms.json (KDCA 2017 BMI LMS) → percentile 역산이 공식과 ±1.x% 일치.
 */
import { describe, it, expect } from 'vitest';
import { bmiPercentile, bmiZ, bmiBand } from '../lib/growth-reference';

describe('BMI-for-age KDCA 2017 (36개월+ 국내 기준)', () => {
  // 공식 KDCA 2017: 남5세(60mo) P3=13.7·P50=15.9·P97=18.7 / 여7세(84mo) P3=13.4·P50=16.1·P97=20.1
  const near = (v: number | null, target: number, tol: number) => {
    expect(v).not.toBeNull();
    expect(Math.abs((v as number) - target)).toBeLessThanOrEqual(tol);
  };
  it('남아 5세(60개월) — 공식 percentile 일치', () => {
    near(bmiPercentile(15.9, 'M', 60), 50, 1.5);
    near(bmiPercentile(13.7, 'M', 60), 3, 1.5);
    near(bmiPercentile(18.7, 'M', 60), 97, 1.5);
  });
  it('남아 7세(84개월) — P50', () => near(bmiPercentile(16.4, 'M', 84), 50, 1.5));
  it('여아 5세(60개월) — P50', () => near(bmiPercentile(15.7, 'F', 60), 50, 1.5));
  it('여아 7세(84개월) — 공식 percentile 일치', () => {
    near(bmiPercentile(16.1, 'F', 84), 50, 1.5);
    near(bmiPercentile(13.4, 'F', 84), 3, 1.5);
    near(bmiPercentile(20.1, 'F', 84), 97, 1.5);
  });
  it('band 판정 — 중앙값=정상·P97=비만·P3=저체중', () => {
    expect(bmiBand(bmiPercentile(15.9, 'M', 60) as number)).toBe('정상');
    expect(bmiBand(bmiPercentile(18.7, 'M', 60) as number)).toBe('비만');   // 97th ≥ 95 → 비만
    expect(bmiBand(bmiPercentile(13.7, 'M', 60) as number)).toBe('저체중'); // 3rd < 5 → 저체중
  });
});

describe('경계·폴백', () => {
  it('0~35개월은 WHO(z 계산 정상)', () => {
    expect(bmiZ(16.0, 'M', 24)).not.toBeNull();
    expect(bmiZ(16.0, 'F', 12)).not.toBeNull();
  });
  it('36개월 경계 — 35mo=WHO·36mo=KDCA 전환(국내 표준 자체의 의도된 divergence)', () => {
    // WHO 중앙값(15.63) → KDCA 중앙값(15.95): KDCA 2017이 만3세에 WHO→국내로 바꾸며 생기는 공식 불연속.
    expect(Math.abs((bmiPercentile(15.63, 'M', 35) as number) - 50)).toBeLessThanOrEqual(1.5);   // WHO P50
    expect(Math.abs((bmiPercentile(15.95, 'M', 36) as number) - 50)).toBeLessThanOrEqual(1.5);   // KDCA P50
    const jump = Math.abs((bmiPercentile(16.0, 'M', 35) as number) - (bmiPercentile(16.0, 'M', 36) as number));
    expect(jump).toBeGreaterThan(0);    // 전환은 일어남(연속 아님 = 의도)
    expect(jump).toBeLessThan(15);      // 단 비정상 폭(파싱·단위 오류)은 아님
  });
  it('무효 입력 null', () => {
    expect(bmiZ(0, 'M', 60)).toBeNull();
    expect(bmiZ(-1, 'F', 60)).toBeNull();
  });
});
