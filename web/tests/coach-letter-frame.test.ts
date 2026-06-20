/**
 * ② 카테고리정합 골든(이사님 2026-06-19) — buildLetterUser 프레이밍 분기.
 * '콩류 부족'이라면서 다른 군(단호박) 추천하던 모순을: challenge 슬롯=부족 프레이밍 빼고 '잘 먹는 짝에서 넓히기' 명시 연결,
 * supply 슬롯=부족군 채움 유지, 슬롯 없음=현행 보존, 누락=폴백.
 */
import { describe, it, expect } from 'vitest';
import { buildLetterUser, type LetterInput } from '../lib/coach';

const base = (over: Partial<LetterInput> = {}): LetterInput => ({
  childName: '아린', ageBand: '24-35m', missing: ['콩류'], planTarget: '콩류', ...over,
});

describe('② buildLetterUser 카테고리정합 프레이밍', () => {
  it('challenge 슬롯 — 부족 프레이밍 빼고 잘 먹는 짝(감자) 명시 연결', () => {
    const out = buildLetterUser(base({ slotFood: '찐 단호박', slotDish: '단호박찜', slotTrack: 'challenge', slotPairLiked: '감자' }));
    expect(out).toContain('감자');                        // pairLiked 명시 연결
    expect(out).toContain('넓혀');                         // 확장 프레이밍('입맛을 넓혀가는')
    expect(out).toContain('집에서 덜 만난 식품군');          // raw 부족 라벨 약화
    expect(out).not.toContain('부족 식품군: 콩류');         // '부족' 호명 제거
    expect(out).not.toContain('이 하나에만 행동');           // planTarget 행동명령 강등(정보 톤)
  });
  it('supply 슬롯 — 부족군 채움 프레이밍 유지', () => {
    const out = buildLetterUser(base({ slotFood: '두부', slotDish: '두부조림', slotTrack: 'supply' }));
    expect(out).toContain('부족 식품군: 콩류');             // raw 라벨 유지(약화 안 함)
    expect(out).toContain('부족 식품군을 채우는 음식');       // supply 안내 가지
  });
  it('슬롯 없음 — 기존 경로(부족 항목 하나에만 행동) 보존', () => {
    const out = buildLetterUser(base());
    expect(out).toContain('부족 식품군: 콩류');
    expect(out).toContain('이 하나에만 행동');
  });
  it('degrade — slotTrack/slotPairLiked 누락이어도 throw 0·슬롯 mandate 폴백', () => {
    const out = buildLetterUser(base({ slotFood: '단호박', slotDish: '단호박찜' }));   // track 없음
    expect(typeof out).toBe('string');
    expect(out).toContain('단호박찜');                      // F-18 mandate 폴백
  });
});

describe('F-18b 환경 레버 날 슬롯 음식 곁들임 직조(softSlotDish)', () => {
  it('환경 날(softSlotDish만) — 음식 이름 곁들임 + 환경이 주제 명시', () => {
    const out = buildLetterUser(base({ softSlotDish: '달걀팟국' }));   // slotFood/slotDish 없음(환경 _noFood 날)
    expect(out).toContain('달걀팟국');                       // 슬롯 음식 이름 본문 직조 타깃
    expect(out).toContain('곁들일 음식 — 가볍게');            // 소프트 곁들임 블록
    expect(out).toContain('음식이 편지의 주제가 되면 안 된다'); // 환경이 주·음식은 곁들임
  });
  it('상호배타 — slotFood/slotDish가 있으면(음식 주제 날) softSlotBlock 미발화', () => {
    const out = buildLetterUser(base({ slotFood: '두부', slotDish: '두부조림', slotTrack: 'supply', softSlotDish: '달걀팟국' }));
    expect(out).toContain('두부조림');                       // 하드 슬롯 mandate가 주도
    expect(out).not.toContain('곁들일 음식 — 가볍게');        // 소프트 블록 비활성(이중 음식 명령 차단)
  });
  it('degrade — softSlotDish 없으면 곁들임 블록 0(기존 경로 보존)', () => {
    const out = buildLetterUser(base());
    expect(out).not.toContain('곁들일 음식 — 가볍게');
  });
});
