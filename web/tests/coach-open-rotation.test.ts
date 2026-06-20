/**
 * 도입 다양성 골든(2026-06-20) — buildLetterUser 도입 블록.
 * 사고: 코칭 편지 24통 중 17통(후반 8/9)이 "부모님," 호명으로 도입 수렴 → 첫 문장이 매번 똑같아짐.
 * 수정: ① 도입 소재(첫 문장 수사 장치) daySeed 회전 풀 + ② '부모님' 시작 금지(아이 이름 금지와 대칭).
 *   - 시나리오 게이트(openBlock) 안에서만 주입 → 시나리오 없는 fixture는 byte 0(폴백).
 */
import { describe, it, expect } from 'vitest';
import { buildLetterUser, OPEN_MATERIALS, pickOpenMaterial, type LetterInput } from '../lib/coach';

const SCEN = { id: 'nutrient-gap', label: '집 결핍군', promptHint: '집에서 부족한 식품군을 짚는다', avoid: '단정' };
const base = (over: Partial<LetterInput> = {}): LetterInput => ({
  childName: '아린', ageBand: '24-35m', missing: ['콩류'], planTarget: '콩류', scenario: SCEN, ...over,
});

describe('도입 다양성 — 부모님 호명 수렴 차단(2026-06-20)', () => {
  it("① 도입 블록에 '부모님' 시작 금지(기존 아이 이름 금지와 대칭)", () => {
    const out = buildLetterUser(base({ daySeed: 0 }));
    expect(out).toContain('[⚠️ 도입 규칙 — 반드시]'); // 시나리오 → 도입 블록 주입됨
    expect(out).toContain("'부모님'");                  // 부모님 호명 시작 금지
    expect(out).toContain('아린이가/는');                // 기존 아이 이름 금지 보존(대칭)
  });

  it("② history(과거 편지) 도입 doctrine에도 '부모님' 시작 금지 추가", () => {
    const out = buildLetterUser(base({ daySeed: 0, pastLetters: [{ date: 'd1', letter: '부모님, 어제는…' }] }));
    expect(out).toContain("'부모님,'으로 여는");          // history 블록 부모님 금지 문구
  });

  it('③ daySeed가 다르면 다른 도입 소재 지시가 주입됨(회전)', () => {
    const m0 = pickOpenMaterial(0)!;
    const m1 = pickOpenMaterial(1)!;
    expect(m0.key).not.toBe(m1.key);                   // 인접 시드 → 다른 소재
    const outA = buildLetterUser(base({ daySeed: 0 }));
    const outB = buildLetterUser(base({ daySeed: 1 }));
    expect(outA).toContain(m0.hint);                    // A엔 소재0 주입
    expect(outB).toContain(m1.hint);                    // B엔 소재1 주입
    expect(outA).not.toBe(outB);                        // 도입 소재가 달라 프롬프트가 갈라짐
  });

  it('④ degrade — 시나리오 없으면 도입 회전 블록 미주입(byte 안전)·throw 0', () => {
    const out = buildLetterUser({ childName: '아린', ageBand: '24-35m', missing: ['콩류'], planTarget: '콩류', daySeed: 3 });
    expect(typeof out).toBe('string');
    expect(out).not.toContain('[⚠️ 도입 규칙 — 반드시]'); // 시나리오 게이트 → 미주입
  });

  it('⑤ 회전 풀은 비지 않음 + 시드 정규화(폴백 가드)', () => {
    expect(OPEN_MATERIALS.length).toBeGreaterThanOrEqual(5);
    expect(pickOpenMaterial(0)).not.toBeNull();
    expect(pickOpenMaterial(-7)).not.toBeNull();        // 음수 시드 정규화
    expect(pickOpenMaterial(NaN)).not.toBeNull();        // 비정상 시드 폴백
  });
});
