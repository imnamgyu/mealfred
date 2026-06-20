/**
 * 영양거울 출현빈도 쿨다운 골든 — '어린이집 덕에 영양 채워진다' 거울줄이 24통 중 17통에 박히던 것(이사님 2026-06-20).
 * 변주(어휘회전)가 아니라 '출현빈도 자체'를 격일화: 최근 2일 안에 거울이 나왔으면 오늘은 생략. 순수함수만 검증.
 */
import { describe, it, expect } from 'vitest';
import { mirrorCooldownDue, mirrorReassureLeak, stripMirrorReassure } from '../lib/coach';

describe('mirrorCooldownDue — 최근 N일 안에 거울 출현 시 오늘 생략', () => {
  it('이력 없으면 출력(byte-동일 보존: false=생략 안 함)', () => {
    expect(mirrorCooldownDue([])).toBe(false);
    expect(mirrorCooldownDue([false])).toBe(false);
  });
  it('직전 1일이라도 거울이면 cooldownDays=2 기본으로 생략', () => {
    expect(mirrorCooldownDue([true])).toBe(true);
    expect(mirrorCooldownDue([true, false])).toBe(true);
    expect(mirrorCooldownDue([false, true])).toBe(true);   // 최근 2일 창 안(2일째) — 생략
  });
  it('최근 2일 모두 비노출이면 출력', () => {
    expect(mirrorCooldownDue([false, false])).toBe(false);
    expect(mirrorCooldownDue([false, false, true])).toBe(false);   // 3일째는 창 밖
  });
  it('cooldownDays 창 크기 조절', () => {
    expect(mirrorCooldownDue([false, false, true], { cooldownDays: 3 })).toBe(true);   // 3일 창 안
    expect(mirrorCooldownDue([true], { cooldownDays: 1 })).toBe(true);                  // 1일 창=교대(50%)
    expect(mirrorCooldownDue([false, true], { cooldownDays: 1 })).toBe(false);          // 직전만 보면 출력
  });
  it('degrade-safe: severe(전체 결핍 심함)면 항상 면제(반드시 노출)', () => {
    expect(mirrorCooldownDue([true, true], { severe: true })).toBe(false);
    expect(mirrorCooldownDue([true], { cooldownDays: 5, severe: true })).toBe(false);
  });
  it('비정상 cooldownDays는 최소 1로 클램프', () => {
    expect(mirrorCooldownDue([true], { cooldownDays: 0 })).toBe(true);   // max(1,..) → 직전 1일 봄
    expect(mirrorCooldownDue([true], { cooldownDays: -3 })).toBe(true);
  });
});

describe('mirrorCooldownDue — 격일화 수렴(출현 ≈ 1/3일)', () => {
  it('cooldownDays=2면 보여줌-생략-생략 패턴으로 수렴(24일 중 ~8회 노출)', () => {
    // recentShown[0]=직전(최신). 매일: due면 생략(shown=false), 아니면 노출(shown=true). 이력에 prepend.
    const hist: boolean[] = [];
    let shownCount = 0;
    for (let day = 0; day < 24; day++) {
      const due = mirrorCooldownDue(hist, { cooldownDays: 2 });
      const shown = !due;
      if (shown) shownCount++;
      hist.unshift(shown);   // 최신을 앞에
    }
    // 보여줌,생략,생략,보여줌… = 24일 중 8회(매일 100% → 33%로 대폭 감소)
    expect(shownCount).toBe(8);
    expect(shownCount).toBeLessThan(12);   // 적어도 절반 미만(대폭 감소)
  });

  it('severe가 매일이면 쿨다운 면제로 매일 노출(K-03 안전 보존)', () => {
    const hist: boolean[] = [];
    let shownCount = 0;
    for (let day = 0; day < 10; day++) {
      const due = mirrorCooldownDue(hist, { cooldownDays: 2, severe: true });
      const shown = !due;
      if (shown) shownCount++;
      hist.unshift(shown);
    }
    expect(shownCount).toBe(10);   // 심한 결핍은 매일 노출(생략 안 함)
  });
});

describe('mirrorReassureLeak — 거울 생략날 LLM 자체 안심줄 누수 감지(역 must-weave)', () => {
  it('실측 누수 3건(생략날인데 본문에 샌 것)을 잡는다', () => {
    // 2026-05-31·06-15 등에서 관찰된 실제 누수 문장
    expect(mirrorReassureLeak('오늘 저녁 환경을 바꿔보세요. 어린이집 덕에 전반적인 영양은 잘 채워지고 있어서 충분해요.')).toBe(true);
    expect(mirrorReassureLeak('어린이집 덕분에 전체 영양은 잘 채워지고 있어 든든하니, 집에서는 환경만 바꿔요.')).toBe(true);
    expect(mirrorReassureLeak('어린이집에서 다양한 식재료를 골고루 만나며 전체 영양은 잘 채워지고 있어요.')).toBe(true);
    expect(mirrorReassureLeak('어린이집에서 여러 음식을 골고루 만나고 있어 든든해요.')).toBe(true);
    expect(mirrorReassureLeak('기관 급식 덕에 전체 영양은 잘 채워지고 있어요.')).toBe(true);
  });
  it("변종 누수 — '어린이집' 단어만 빼고 같은 '전체 영양 괜찮다' 안심 기능을 잡는다(골든완화·실측 05-29~06-01)", () => {
    expect(mirrorReassureLeak('요즘 식단은 여러 식품군을 두루 만나 균형이 잘 잡혀 있어요')).toBe(true);
    expect(mirrorReassureLeak('전체 식단은 여러 식품군이 골고루 잘 채워지고 있어서 안심하셔도 됩니다')).toBe(true);
    expect(mirrorReassureLeak('식단이 여러 식품군을 두루 만나 균형이 좋아서 안심되네요')).toBe(true);
    expect(mirrorReassureLeak('여러 식품군이 골고루 잘 챙겨지고 있어서')).toBe(true);
  });
  it('변종 탐지가 행동(노출 권유)은 과탐하지 않는다', () => {
    expect(mirrorReassureLeak('여러 식품군을 두루 경험하게 해주세요')).toBe(false);   // 서술 종결 없음 = 행동
    expect(mirrorReassureLeak('집에서도 여러 음식을 골고루 차려주세요')).toBe(false);
  });
  it('영양-충족이 아닌 기관 언급은 과탐하지 않는다', () => {
    // 재노출(거부 식재료를 집에서) — 영양어 없음
    expect(mirrorReassureLeak('어린이집에서 거부한 콩을 집에서 부담 없이 다시 만나게 해주세요.')).toBe(false);
    // 급식 친숙도(또래가 자주 먹는 재료) — 영양-충족 평가가 아님
    expect(mirrorReassureLeak('또래들이 급식에서도 자주 만나는 재료라 낯설지 않을 거예요.')).toBe(false);
    // 어린이집 전혀 없는 일반 칭찬
    expect(mirrorReassureLeak('아이가 밥과 감자볶음을 잘 먹고 있어 든든해요.')).toBe(false);
    expect(mirrorReassureLeak('')).toBe(false);
  });
});

describe('stripMirrorReassure — 순수 daycare-praise 문장만 절단(집-결핍·행동 보존)', () => {
  it('실측 누수(06-06): praise preamble만 잘리고 콩류·두부 코칭은 보존', () => {
    const inp = '어린이집 급식 덕분에 전반적인 영양이 잘 채워지고 있어요. 집 끼니에서는 콩류가 조금 드물게 느껴지는데, 두부를 으깨 섞어보세요.';
    const out = stripMirrorReassure(inp);
    expect(mirrorReassureLeak(out)).toBe(false);   // 누수 제거됨
    expect(out).toContain('콩류');                  // 집-결핍 정보 보존
    expect(out).toContain('두부');                  // 행동 보존
    expect(out).not.toContain('어린이집');
  });
  it('행동(명령형)이 같은 문장에 있으면 절단하지 않음(코칭 유실 방지)', () => {
    const inp = '어린이집 덕에 영양은 채워지니 오늘 저녁엔 두부를 식탁에 올려보세요.';
    expect(stripMirrorReassure(inp)).toBe(inp);     // 통째 보존(안전 실패)
  });
  it('집-결핍 정보가 같은 문장에 있으면 보존', () => {
    const inp = '어린이집 덕에 전체는 괜찮지만 집 끼니엔 콩류가 드물어요.';
    expect(stripMirrorReassure(inp)).toBe(inp);
  });
  it('안심줄 없으면 원본 그대로', () => {
    const inp = '오늘 저녁엔 TV를 끄고 함께 식탁에 앉아보세요. 아이가 편안함을 느낄 거예요.';
    expect(stripMirrorReassure(inp)).toBe(inp);
  });
  it('과절단(20자 미만)되면 원본 유지', () => {
    const inp = '어린이집 덕분에 영양은 충분해요.';
    expect(stripMirrorReassure(inp)).toBe(inp);   // 통째가 안심줄 → 자르면 빈 문자열 → 원본
  });
  it("서술형 '챙겨주고 있어서'는 명령형 아님 → 순수 praise로 절단(06-06 실측)", () => {
    const inp = '어린이집에서 생선과 채소를 골고루 잘 챙겨주고 있어서 전체 영양은 안정적이에요. 오늘 저녁엔 두부를 식탁에 올려보세요.';
    const out = stripMirrorReassure(inp);
    expect(mirrorReassureLeak(out)).toBe(false);
    expect(out).toContain('두부');
    expect(out).not.toContain('어린이집');
  });
  it('쉼표로 praise+행동이 한 문장이면 선행 praise 절만 절단(05-29 실측)', () => {
    const inp = '어린이집 덕분에 전체 영양 균형도 좋아서, 집에서는 지금처럼 아이가 편안히 받아들이는 식재료를 꾸준히 곁들여주세요.';
    const out = stripMirrorReassure(inp);
    expect(mirrorReassureLeak(out)).toBe(false);
    expect(out).toContain('곁들여주세요');     // 행동 절 보존
    expect(out.startsWith('집에서는')).toBe(true);
  });
});
