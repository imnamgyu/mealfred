/**
 * #4 메타 입력 게이트 — 미입력 축은 평가 금지(structuredTip 침묵), 초기 1~3주엔 입력 권유(metaInputNudge).
 * (1주일차 결핍 끄기 #4a는 cron 통합 경로라 여기선 메타 평가/권유 순수함수만 박제.)
 */
import { describe, it, expect } from 'vitest';
import { structuredTip, metaInputNudge, type StructuredSig } from '../lib/coach';

const EMPTY: StructuredSig = {
  texMode: null, texLow: false, texCount: 0,
  selfPct: null, autoCount: 0,
  envBadPct: null, envCount: 0,
  mtOver30Pct: null, mtCount: 0,
};

describe('#4b structuredTip — 메타 미입력 축은 평가 금지', () => {
  it('전 축 미입력 → 어떤 개선 팁도 만들지 않는다(null)', () => {
    for (let seed = 0; seed < 8; seed++) {
      expect(structuredTip(EMPTY, '5y', seed)).toBeNull();
    }
  });
  it('환경 데이터가 임계 미만(count<4)이면 식사분위기 평가 금지', () => {
    const s: StructuredSig = { ...EMPTY, envBadPct: 0.9, envCount: 2 };
    expect(structuredTip(s, '5y', 0)).toBeNull();
  });
  it('환경 데이터가 충분(임계 초과)하면 비로소 개선 팁을 낸다', () => {
    const s: StructuredSig = { ...EMPTY, envBadPct: 0.9, envCount: 6 };
    expect(structuredTip(s, '5y', 0)).toContain('화면');
  });
});

describe('#4b metaInputNudge — 초기 1~3주, 미입력 축만 권유(평가 아님)', () => {
  it('가입 직후(<3일)엔 권유하지 않는다', () => {
    expect(metaInputNudge(EMPTY, 1, 0)).toBeNull();
  });
  it('초기 1~3주(3~20일)·전 축 미입력 → 권유 한 줄을 낸다', () => {
    const out = metaInputNudge(EMPTY, 5, 0);
    expect(out).toBeTruthy();
    expect(out).toMatch(/찍어 주시면/);
  });
  it('3주 이후(>=21일)엔 권유 종료(데이터 기반 코칭으로 이양)', () => {
    expect(metaInputNudge(EMPTY, 21, 0)).toBeNull();
    expect(metaInputNudge(EMPTY, 40, 0)).toBeNull();
  });
  it('이미 찍은 축은 권유하지 않는다(식감만 미입력 → 식감만 초대)', () => {
    const s: StructuredSig = { ...EMPTY, autoCount: 5, envCount: 5, mtCount: 5 };   // 식감(texCount=0)만 미입력
    const out = metaInputNudge(s, 7, 0);
    expect(out).toContain('식감');
  });
  it('모든 축을 이미 찍었으면 권유하지 않는다(null)', () => {
    const s: StructuredSig = { ...EMPTY, texCount: 3, autoCount: 3, envCount: 3, mtCount: 3 };
    expect(metaInputNudge(s, 7, 0)).toBeNull();
  });
});
