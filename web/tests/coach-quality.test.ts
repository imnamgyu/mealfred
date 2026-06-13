/**
 * coach-quality.test.ts — EPIC D 품질·무검증 채널 결정론 스캐너 회귀 테스트.
 *
 * 순수함수라 LLM mock 불필요. 핵심 불변: 양질 편지를 오탐하지 않는다(은유 1회·1회 사실 인용·
 *   수치 동반 기간어·목록 내 음식명은 전부 통과). 양성/음성 fixture를 둘 다 박제한다(risk #2).
 *
 * 다루는 원자: D-01 metaphorOveruse · D-02 mealEnumeration · D-03 vagueTimeWord ·
 *   D-04 offMaterialFood · D-05 letterQualityScan/letterQualityBad · D-06 combineForVerify ·
 *   D-09 실데이터 fixture(v3 수렴=bad / v2 양질=통과).
 * (D-07·D-08·D-10·D-11은 coach.ts/route.ts 배선 = EPIC C 소관 — 여기선 순수함수만 검증.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  metaphorOveruse,
  mealEnumeration,
  vagueTimeWord,
  offMaterialFood,
  letterQualityScan,
  letterQualityBad,
  combineForVerify,
  composeVerifiableText,
  METAPHOR_CLICHES,
} from '../lib/coachQuality';

const FIX_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
function loadFixture(name: string): string {
  const txt = readFileSync(join(FIX_DIR, name), 'utf8');   // D-09-7: 읽기 실패 시 throw로 명확히 실패(빈 문자열 위장 방지)
  if (!txt.trim()) throw new Error(`fixture ${name} is empty`);
  return txt;
}

// ── D-01 — metaphorOveruse ─────────────────────────────────────────────────────
describe('D-01 metaphorOveruse — 클리셰 은유 과용(과용만 위반·1회 허용)', () => {
  it('D-01-1 통장+적금+계단 3종 동시 = 과용', () => {
    expect(metaphorOveruse('식습관은 통장에 적금을 쌓듯, 계단을 한 걸음씩 오르는 일이에요')).toBe(true);
  });
  it('D-01-2 단일 은유 1회 = 허용(오탐 방지)', () => {
    expect(metaphorOveruse('새로운 맛에 마음을 여는 작은 문을 하나 열었네요')).toBe(false);
  });
  it('D-01-3 같은 은유(걸음) 2회 반복 = 과용', () => {
    expect(metaphorOveruse('한 걸음씩 나아가요. 오늘도 한 걸음 더 내디뎠네요')).toBe(true);
  });
  it('D-01-4 은유 0종 = 통과', () => {
    expect(metaphorOveruse('어제 저녁 당근볶음밥을 반 그릇 비웠어요')).toBe(false);
  });
  it("D-01-5 동음 오탐: '질문/방문/문제/문의'는 '문' 은유 아님", () => {
    expect(metaphorOveruse('식사에 대한 질문이 있으시면 언제든 문의하세요. 문제 없어요')).toBe(false);
  });
  it("D-01-6 동음 오탐: '길어/길게'는 '길' 은유 아님", () => {
    expect(metaphorOveruse('식사가 30분 넘게 길어지면 부담 없이 정리하세요')).toBe(false);
  });
  it('D-01-7 디딤돌+사슬 2종 = 과용', () => {
    expect(metaphorOveruse('이번 노출은 다음 음식으로 이어지는 디딤돌이자 사슬의 첫 고리예요')).toBe(true);
  });
  it('D-01-8 무대 은유 단독 1회 = 허용', () => {
    expect(metaphorOveruse('식탁이 아린이의 작은 무대가 되어주네요')).toBe(false);
  });
  it('D-01-9 빈 문자열 = false(안전)', () => {
    expect(metaphorOveruse('')).toBe(false);
  });
  it('D-01-10 여정+길 2종 = 과용', () => {
    expect(metaphorOveruse('편식은 긴 여정이지만 함께 걷는 길이에요')).toBe(true);
  });
  it('D-01-11 결정론 재현성(동일 입력 2회 동일)', () => {
    const s = '통장에 적금을 쌓듯 계단을 오르는 일이에요';
    expect(metaphorOveruse(s)).toBe(metaphorOveruse(s));
  });
  it('D-01-12 회귀 박제: 통장 은유 v3 클리셰 문장 = true', () => {
    expect(metaphorOveruse('아린이의 식습관은 통장에 차곡차곡 쌓이는 적금과 같아요. 한 걸음씩 계단을 오르듯 나아가요')).toBe(true);
  });
  it('METAPHOR_CLICHES 사전은 비어있지 않음', () => {
    expect(METAPHOR_CLICHES.length).toBeGreaterThan(5);
  });
});

// ── D-02 — mealEnumeration ─────────────────────────────────────────────────────
describe('D-02 mealEnumeration — 데이터 나열 패턴(2문장+ 위반·1회 인용 허용)', () => {
  it('D-02-1 3문장 시점+먹었어요 나열 = true', () => {
    expect(mealEnumeration('어제 카레를 먹었어요. 그제 볶음밥을 먹었네요. 오늘 빵을 먹었어요')).toBe(true);
  });
  it('D-02-2 1회 사실 인용 = 허용', () => {
    expect(mealEnumeration('어제 저녁 당근볶음밥을 처음 비웠다는 게 반가워요')).toBe(false);
  });
  it('D-02-3 2문장 = 임계 초과(true)', () => {
    expect(mealEnumeration('어제 두부를 먹었어요. 오늘 시금치를 먹었어요')).toBe(true);
  });
  it('D-02-4 쉼표 음식 3개+시점+먹었 = 나열', () => {
    expect(mealEnumeration('어제 당근, 시금치, 두부를 골고루 먹었어요')).toBe(true);
  });
  it('D-02-5 시점어 없는 음식 나열(요약형) = 허용', () => {
    expect(mealEnumeration('아린이가 잘 먹는 볶음밥·카레·계란말이를 떠올려보면')).toBe(false);
  });
  it("D-02-6 '비웠/남겼' 변형 동사 포착", () => {
    expect(mealEnumeration('어제 밥을 비웠어요. 오늘 국을 남겼어요')).toBe(true);
  });
  it('D-02-7 빈 문자열 = false', () => {
    expect(mealEnumeration('')).toBe(false);
  });
  it('D-02-8 N일 전 시점어 + 먹었 2회 = true', () => {
    expect(mealEnumeration('3일 전 생선을 먹었어요. 2일 전 콩을 먹었네요')).toBe(true);
  });
  it('D-02-9 정상 코칭(행동 제안)은 미검출', () => {
    expect(mealEnumeration('오늘 저녁엔 좋아하는 볶음밥에 당근을 잘게 섞어보세요')).toBe(false);
  });
  it('D-02-10 결정론 재현성', () => {
    const s = '어제 두부를 먹었어요. 오늘 시금치를 먹었어요';
    expect(mealEnumeration(s)).toBe(mealEnumeration(s));
  });
  it("D-02-11 오탐: '먹고 싶어 함' 인용 1회 = 허용", () => {
    expect(mealEnumeration('어제 배가 불편한데도 먹고 싶어 했다니 식욕은 살아있네요')).toBe(false);
  });
});

// ── D-03 — vagueTimeWord ───────────────────────────────────────────────────────
describe('D-03 vagueTimeWord — 모호 기간어(수치 없으면 위반·수치 동반 허용)', () => {
  it("D-03-1 수치 없는 '요즘' = true", () => {
    expect(vagueTimeWord('요즘 채소를 잘 안 드시네요')).toBe(true);
  });
  it("D-03-2 '최근 7일' 수치 동반 = 허용", () => {
    expect(vagueTimeWord('최근 7일 중 비타민A 채소가 3일이었어요')).toBe(false);
  });
  it("D-03-3 '이번 주 2번' 수치 동반 = 허용", () => {
    expect(vagueTimeWord('이번 주 콩류가 2번 나왔어요')).toBe(false);
  });
  it("D-03-4 '한동안' 모호어 = true", () => {
    expect(vagueTimeWord('한동안 생선이 비어 있었어요')).toBe(true);
  });
  it("D-03-5 '최근' 단독(수치 멀리) = true", () => {
    expect(vagueTimeWord('최근 들어 표정이 밝아졌어요')).toBe(true);
  });
  it("D-03-6 FORBID_TIME 영역('지난달')은 무관(false)", () => {
    expect(vagueTimeWord('지난달부터 잘 먹어요')).toBe(false);
  });
  it('D-03-7 기간어 0개 = false', () => {
    expect(vagueTimeWord('오늘 저녁 당근을 권해보세요')).toBe(false);
  });
  it('D-03-8 빈 문자열 = false', () => {
    expect(vagueTimeWord('')).toBe(false);
  });
  it("D-03-9 '며칠째' 모호어 = true", () => {
    expect(vagueTimeWord('며칠째 같은 반찬이 이어졌네요')).toBe(true);
  });
  it("D-03-10 '요즘' + 직후 '3일' = 허용", () => {
    expect(vagueTimeWord('요즘 3일 동안 채소가 한 번도 없었어요')).toBe(false);
  });
  it('D-03-11 결정론 재현성', () => {
    const s = '요즘 채소를 잘 안 드시네요';
    expect(vagueTimeWord(s)).toBe(vagueTimeWord(s));
  });
});

// ── D-04 — offMaterialFood ─────────────────────────────────────────────────────
describe('D-04 offMaterialFood — 재료 밖 음식명(화이트리스트 대조)', () => {
  it('D-04-1 목록 밖 음식명 검출', () => {
    expect(offMaterialFood('마파두부로도 자주 먹어요', ['순두부찌개', '볶음밥'])).toEqual(['마파두부']);
  });
  it('D-04-2 목록 내 음식 전부 통과', () => {
    expect(offMaterialFood('볶음밥에 두부를 섞고 순두부찌개도', ['순두부찌개', '볶음밥', '두부'])).toEqual([]);
  });
  it("D-04-3 일반명사 '밥/국' 단독 면제", () => {
    expect(offMaterialFood('밥과 국을 차려보세요', [])).toEqual([]);
  });
  it('D-04-4 괴식 합성어 검출(미역국에 당근 이름화)', () => {
    expect(offMaterialFood('당근미역국을 만들어보세요', ['미역국', '당근볶음밥'])).toEqual(['당근미역국']);
  });
  it('D-04-5 allowed 정확일치 통과', () => {
    expect(offMaterialFood('고등어무조림이 좋아요', ['고등어무조림', '고등어구이'])).toEqual([]);
  });
  it('D-04-6 음식명 0개 편지 = []', () => {
    expect(offMaterialFood('화면을 끄고 식탁에 함께 앉아보세요', ['볶음밥'])).toEqual([]);
  });
  it('D-04-7 복수 위반 중복 제거', () => {
    expect(offMaterialFood('된장찌개와 된장찌개, 김치전을 권해요', ['볶음밥'])).toEqual(['된장찌개', '김치전']);
  });
  it('D-04-8 빈 allowed + 음식명 = 전부 위반', () => {
    expect(offMaterialFood('카레볶음밥을 권해요', [])).toEqual(['카레볶음밥']);
  });
  it('D-04-9 빈 문자열 본문 = []', () => {
    expect(offMaterialFood('', ['볶음밥'])).toEqual([]);
  });
  it('D-04-10 STAPLE 형태(빵) allowed면 통과', () => {
    expect(offMaterialFood('통밀빵을 간식으로', ['통밀빵', '빵'])).toEqual([]);
  });
  it('D-04-11 접미사 없는 식재료명은 미검사(과탐 방지)', () => {
    expect(offMaterialFood('당근과 시금치를 권해보세요', [])).toEqual([]);
  });
  it("D-04-12 동음 오탐: 조건 어미 '-면'(드시면/보여주시면)은 면류 아님", () => {
    expect(offMaterialFood('부모님이 한 입 드시면 충분합니다. 보여주시면 좋아요', [])).toEqual([]);
  });
  it('D-04-13 결정론 재현성', () => {
    expect(offMaterialFood('마파두부를 권해요', ['볶음밥'])).toEqual(offMaterialFood('마파두부를 권해요', ['볶음밥']));
  });
});

// ── D-05 — letterQualityScan / letterQualityBad ────────────────────────────────
describe('D-05 letterQualityScan/Bad — 통합 품질 스캐너(OR 조합)', () => {
  it('D-05-1 은유 과용만 = bad + 사유1', () => {
    const r = letterQualityScan('통장에 적금 쌓듯 계단을 오르듯', {});
    expect(r.bad).toBe(true);
    expect(r.reasons).toContain('은유 과용');
  });
  it('D-05-2 복수 위반 사유 집계(>=2)', () => {
    const r = letterQualityScan('통장에 적금 쌓듯. 어제 콩 먹었어요. 오늘 두부 먹었어요', {});
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
  });
  it('D-05-3 깨끗한 편지 = bad false, reasons []', () => {
    const r = letterQualityScan('오늘 저녁 볶음밥에 당근을 잘게 섞어보세요', { allowedFoods: ['볶음밥'] });
    expect(r.bad).toBe(false);
    expect(r.reasons).toEqual([]);
  });
  it('D-05-4 allowedFoods 미제공 시 음식명 검사 skip', () => {
    expect(letterQualityBad('마파두부를 권해요', {})).toBe(false);
  });
  it('D-05-5 allowedFoods 제공 + 목록밖 = bad', () => {
    const r = letterQualityScan('마파두부를 권해요', { allowedFoods: ['볶음밥'] });
    expect(r.bad).toBe(true);
    expect(r.reasons.some((x) => x.startsWith('목록 밖 음식'))).toBe(true);
    expect(r.reasons.join()).toContain('마파두부');
  });
  it('D-05-6 모호 기간어 단독 = bad', () => {
    expect(letterQualityBad('요즘 채소가 비어요', {})).toBe(true);
  });
  it('D-05-7 수치 동반 기간어는 통과', () => {
    expect(letterQualityBad('최근 7일 중 채소가 3일이었어요', {})).toBe(false);
  });
  it('D-05-8 빈 편지 = bad false(안전)', () => {
    expect(letterQualityBad('', { allowedFoods: ['밥'] })).toBe(false);
  });
  it('D-05-9 결정론 재현성(deep equal)', () => {
    const a = letterQualityScan('통장 적금 계단', {});
    const b = letterQualityScan('통장 적금 계단', {});
    expect(a).toEqual(b);
  });
  it('D-05-10 reasons는 비어있지 않은 한국어 문자열', () => {
    const r = letterQualityScan('통장 적금 계단', {});
    expect(typeof r.reasons[0]).toBe('string');
    expect(r.reasons[0].length).toBeGreaterThan(0);
  });
  it('D-05-11 letterQualityBad === letterQualityScan().bad', () => {
    const L = '통장에 적금 쌓듯 계단을 오르듯';
    expect(letterQualityBad(L, {})).toBe(letterQualityScan(L, {}).bad);
  });
});

// ── D-06 — combineForVerify / composeVerifiableText ────────────────────────────
describe('D-06 합본 빌더 — 무검증 채널(거울·추천 슬롯) 봉합', () => {
  it('D-06-1 본문+거울+추천 합본', () => {
    expect(composeVerifiableText({ letter: 'A', mirror: 'B', recoText: 'C' })).toBe('A\nB\nC');
  });
  it('D-06-2 null 슬롯 제외', () => {
    expect(composeVerifiableText({ letter: 'A', mirror: null, recoText: 'C' })).toBe('A\nC');
  });
  it('D-06-3 거울에 숨은 모호어가 합본 검사로 적발', () => {
    expect(letterQualityBad(composeVerifiableText({ letter: '오늘 당근을 권해요', mirror: '요즘 채소가 비어요' }), {})).toBe(true);
  });
  it('D-06-4 추천 슬롯의 괴식 음식명 적발', () => {
    expect(letterQualityBad(composeVerifiableText({ letter: '권해요', recoText: '당근미역국 추천' }), { allowedFoods: ['미역국'] })).toBe(true);
  });
  it('D-06-5 셋 다 깨끗 = 통과', () => {
    expect(letterQualityBad(composeVerifiableText({ letter: '오늘 저녁 함께 앉아보세요', mirror: '어제 두부를 처음 비웠어요', recoText: '볶음밥' }), { allowedFoods: ['볶음밥'] })).toBe(false);
  });
  it('D-06-6 본문만(슬롯 없음) = 본문 그대로', () => {
    expect(composeVerifiableText({ letter: 'A' })).toBe('A');
  });
  it('combineForVerify(별칭): recommendations 배열을 줄바꿈 합본', () => {
    expect(combineForVerify('A', { mirror: 'B', recommendations: ['C', 'D'] })).toBe('A\nB\nC\nD');
  });
  it('combineForVerify: parts 미제공 시 본문 그대로', () => {
    expect(combineForVerify('A')).toBe('A');
  });
  it('combineForVerify: 빈 recommendations 배열은 제외', () => {
    expect(combineForVerify('A', { mirror: 'B', recommendations: [] })).toBe('A\nB');
  });
});

// ── D-09 — 실데이터 fixture 회귀(v3=bad / v2 양질=통과, 오탐 0) ──────────────────
describe('D-09 fixture 회귀 — 처치 효과 + 오탐 0(품질축의 생명)', () => {
  const allowed = ['당근볶음밥', '볶음밥'];   // v2-good 본문의 정상 음식명
  it('D-09-1 v3 수렴 편지 fixture = quality bad', () => {
    expect(letterQualityBad(loadFixture('letter-v3-convergent.txt'), { allowedFoods: allowed })).toBe(true);
  });
  it('D-09-2 v2 양질 편지 fixture = quality 통과(오탐 0)', () => {
    const r = letterQualityScan(loadFixture('letter-v2-good.txt'), { allowedFoods: allowed });
    expect(r.bad).toBe(false);
    expect(r.reasons).toEqual([]);
  });
  it('D-09-7 fixture 로딩 안정성(없는 파일은 throw)', () => {
    expect(() => loadFixture('__nonexistent__.txt')).toThrow();
  });
});
