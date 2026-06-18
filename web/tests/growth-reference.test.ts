/**
 * growth-reference 골든 — KDCA 2017 소아청소년 성장도표 정본(신장·체중·BMI for-age).
 * 출처: '성장도표 데이터 테이블.xls'(knhanes.kdca.go.kr grtcht dataNo=7) → lib/kdca-growth-lms.json.
 * 공식 percentile 앵커(P3·P50·P97)로 L/M/S 전부 회귀 박제. 전사·보간·역함수 오류 방지.
 */
import { describe, it, expect } from 'vitest';
import {
  bmiPercentile, bmiZ, bmiBand,
  heightPercentile, weightPercentile, heightAtPercentile, weightAtPercentile,
  growthTracking, growthTrackToPhrase, type GrowthTrack,
} from '../lib/growth-reference';

const near = (v: number | null, target: number, tol: number) => {
  expect(v).not.toBeNull();
  expect(Math.abs((v as number) - target)).toBeLessThanOrEqual(tol);
};

describe('BMI-for-age (24개월+ KDCA 2017 국내)', () => {
  // 공식: 남5세(60mo) P3=13.7·P50=15.9·P97=18.7 / 여7세(84mo) P3=13.4·P50=16.1·P97=20.1
  it('남아 5세(60개월) — 공식 percentile 일치', () => {
    near(bmiPercentile(15.9, 'M', 60), 50, 1.5);
    near(bmiPercentile(13.7, 'M', 60), 3, 1.5);
    near(bmiPercentile(18.7, 'M', 60), 97, 1.5);
  });
  it('여아 7세(84개월) — 공식 percentile 일치', () => {
    near(bmiPercentile(16.1, 'F', 84), 50, 1.5);
    near(bmiPercentile(13.4, 'F', 84), 3, 1.5);
    near(bmiPercentile(20.1, 'F', 84), 97, 1.5);
  });
  it('band 판정 — 중앙값=정상·P97=비만·P3=저체중', () => {
    expect(bmiBand(bmiPercentile(15.9, 'M', 60) as number)).toBe('정상');
    expect(bmiBand(bmiPercentile(18.7, 'M', 60) as number)).toBe('비만');
    expect(bmiBand(bmiPercentile(13.7, 'M', 60) as number)).toBe('저체중');
  });
});

describe('신장-for-age (KDCA 2017 정본 0~227개월)', () => {
  // 공식: 신장 남5세(60mo) P3=101.6·P50=109.6·P97=118.0 / 여7세(84mo) P3=112.2·P50=120.8·P97=130.2
  it('남아 5세 — P3/P50/P97', () => {
    near(heightPercentile(109.6, 'M', 60), 50, 2);
    near(heightPercentile(101.6, 'M', 60), 3, 2);
    near(heightPercentile(118.0, 'M', 60), 97, 2);
  });
  it('여아 7세 — P3/P50/P97', () => {
    near(heightPercentile(120.8, 'F', 84), 50, 2);
    near(heightPercentile(112.2, 'F', 84), 3, 2);
    near(heightPercentile(130.2, 'F', 84), 97, 2);
  });
  it('역함수 round-trip(percentile↔cm)', () => {
    near(heightAtPercentile(50, 'M', 60), 109.59, 0.4);
    near(heightAtPercentile(97, 'M', 60), 118.0, 0.7);
    const p = heightPercentile(112.3, 'M', 60) as number;
    near(heightAtPercentile(p, 'M', 60), 112.3, 0.2); // 원값 복원
  });
});

describe('체중-for-age (KDCA 2017 정본 0~227개월)', () => {
  // 공식: 체중 남5세(60mo) P3=15.4·P50=19.0·P97=24.3 / 여5세(60mo) P3=14.9·P50=18.4·P97=23.7
  it('남아 5세 — P3/P50/P97', () => {
    near(weightPercentile(19.0, 'M', 60), 50, 2);
    near(weightPercentile(15.4, 'M', 60), 3, 2);
    near(weightPercentile(24.3, 'M', 60), 97, 2);
  });
  it('여아 5세 — P3/P50/P97', () => {
    near(weightPercentile(18.4, 'F', 60), 50, 2);
    near(weightPercentile(14.9, 'F', 60), 3, 2);
    near(weightPercentile(23.7, 'F', 60), 97, 2);
  });
  it('역함수 round-trip', () => near(weightAtPercentile(3, 'M', 60), 15.4, 0.4));
});

describe('성장곡선 추종도', () => {
  it('채널 유지 = 양호·고득점', () => {
    // 남아: 60mo에 P50, 78mo에도 P50(자기 채널 유지)
    const base = { value: heightAtPercentile(50, 'M', 60) as number, ageMonths: 60 };
    const cur = { value: heightAtPercentile(50, 'M', 78) as number, ageMonths: 78 };
    const t = growthTracking(base, cur, 'M', 'height')!;
    expect(t.status).toBe('양호');
    expect(t.score).toBeGreaterThanOrEqual(95);
    expect(Math.abs(t.zDrift)).toBeLessThan(0.1);
  });
  it('성장 더딤(채널 하향 이탈) = 경고·감점', () => {
    // 60mo P50였는데 78mo까지 키가 거의 안 자람 → z 크게 하락
    const base = { value: heightAtPercentile(50, 'M', 60) as number, ageMonths: 60 };
    const cur = { value: base.value + 0.5, ageMonths: 78 }; // 18개월간 0.5cm
    const t = growthTracking(base, cur, 'M', 'height')!;
    expect(t.status).toBe('경고');
    expect(t.score).toBeLessThan(60);
    expect(t.zDrift).toBeLessThan(-1.34);
    expect(t.expected).toBeGreaterThan(t.actual); // 채널 기대치보다 실제가 낮음
  });
  it('측정 간격 부족 = 정보부족(판단 보류)', () => {
    const base = { value: heightAtPercentile(50, 'M', 60) as number, ageMonths: 60 };
    const cur = { value: base.value, ageMonths: 60 };
    expect(growthTracking(base, cur, 'M', 'height')!.status).toBe('정보부족');
  });
});

describe('E-02 — growthTrackToPhrase (BMI/성장곡선 → P10 비수치 한 구절)', () => {
  const tk = (metric: 'height' | 'weight', status: GrowthTrack['status']): GrowthTrack =>
    ({ metric, baselinePct: 50, currentPct: 30, zDrift: status === '경고' ? -1.5 : -0.8, expected: 0, actual: 0, gapMonths: 3, score: 50, status });
  it('성장곡선 경고가 BMI보다 우선 — 숫자·BMI 단어 없음', () => {
    const p = growthTrackToPhrase({ band: '비만', height: tk('height', '경고'), weight: null });
    expect(p).toBeTruthy();
    expect(p).toContain('키');
    expect(p).not.toMatch(/BMI|퍼센타일|[0-9]+(번째|퍼센|%)/);
  });
  it('주의 = 부드러운 균형 살펴보기', () => {
    expect(growthTrackToPhrase({ band: null, height: null, weight: tk('weight', '주의') })).toMatch(/몸무게|균형/);
  });
  it('성장 정상 + 과체중 = 간식 교체 / 저체중 = 양·단백 보강', () => {
    expect(growthTrackToPhrase({ band: '과체중', height: null, weight: null })).toMatch(/간식/);
    expect(growthTrackToPhrase({ band: '저체중', height: null, weight: null })).toMatch(/가벼운|단백/);
  });
  it('정상·정보부족이면 null(성장 거울 생략)', () => {
    expect(growthTrackToPhrase({ band: '정상', height: null, weight: null })).toBeNull();
    expect(growthTrackToPhrase({ band: null, height: tk('height', '정보부족'), weight: null })).toBeNull();
  });
});

describe('경계·폴백', () => {
  it('BMI 24개월 미만은 WHO 폴백(z 정상)', () => {
    expect(bmiZ(16.0, 'M', 12)).not.toBeNull();
    expect(bmiZ(16.0, 'F', 23)).not.toBeNull();
  });
  it('BMI 24개월+는 KDCA 정본', () => {
    near(bmiPercentile(16.0189, 'M', 24), 50, 2); // 공식 남24mo M=16.0189
    near(bmiPercentile(15.9455, 'M', 36), 50, 2); // 공식 남36mo M=15.9455
  });
  it('무효 입력 null', () => {
    expect(bmiZ(0, 'M', 60)).toBeNull();
    expect(heightPercentile(-1, 'F', 60)).toBeNull();
    expect(weightPercentile(0, 'M', 60)).toBeNull();
  });
});
