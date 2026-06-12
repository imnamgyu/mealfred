/**
 * tests/blocks.test.ts — 블록 린터 (WBS C-19 — prebuild 게이트)
 * ① 규칙 픽스처: 각 검수 규칙이 실제로 잡히는지(린터 자체의 회귀 방지)
 * ② 실 풀 전수: lib/letter-blocks.json 전 블록 0 이슈 + 전형 렌더 가능 + 풀 크기 350+(C-05 DoD)
 * 블록 1개 추가 커밋 → 이 테스트가 자동 검수 → 통과 못 하면 배포 불가(콘텐츠도 코드처럼 — 복리 원칙).
 */
import { describe, it, expect } from 'vitest';
import { loadBlocks, lintBlock, lintBlockPool, renderBlock, type LetterBlock } from '../lib/letterBlocks';

const mk = (over: Partial<LetterBlock>): LetterBlock => ({
  id: 'table-stage.why.1', unit: 'table-stage', stage: 'why', variant: 1,
  text: '이 걸음에는 작은 이유가 있어요. 아이 마음이 한결 편해진답니다.',
  slots: [], tone: 'warm', ...over,
} as LetterBlock);

describe('C-19 린터 규칙 픽스처(린터 회귀 방지)', () => {
  it('통과: 정상 블록 0 이슈', () => {
    expect(lintBlock(mk({}))).toEqual([]);
  });
  const CASES: Array<[string, string, Partial<LetterBlock>]> = [
    ['숫자 리터럴', '숫자', { text: '오늘은 30분만 식탁에 함께 앉아 볼까요. 부담 없이 시작해요.' }],
    ['체중 단어', '체중', { text: '체중 변화는 천천히 함께 지켜보아요. 조급해하지 않아도 됩니다.' }],
    ['의학 단어', '의학', { text: '이건 병의 증상이 아니라 자라는 과정이에요. 차근차근 가면 됩니다.' }],
    ['내부 개념(목표)', '내부 개념', { text: '이번 주 목표를 같이 정해 보아요. 부담은 내려놓고 가볍게요.' }],
    ['초가공 권유', '초가공', { text: '바삭한 튀김 한 조각으로 시작해도 좋아요. 즐겁게 가 보아요.' }],
    ['빈도 단정어', '단정어', { text: '이렇게 가면 아이가 매일 잘 먹게 될 거예요. 믿고 가 보아요.' }],
    ['압박 문구 인용', '압박', { text: '한 입만 먹어 보자는 말은 잠시 넣어 두세요. 대신 기다려 주세요.' }],
    ['지시 어조', '지시', { text: '오늘은 반드시 같은 자리에서 먹도록 해 주세요. 그게 시작점이에요.' }],
    ['거래 대사', '거래', { text: '다 먹으면 좋아하는 걸 줄게 같은 약속은 오늘 하루 쉬어 보아요.' }],
    ['아이 주체높임', '주체높임', { text: '{name}{이가} 좋아하시는 반찬을 곁에 두세요. 천천히 함께요.', slots: ['name'] }],
    ['음식명 하드코딩', '음식명', { text: '두부처럼 부드러운 것부터 식탁에 올려 보아요. 아주 가볍게요.' }],
    ['슬롯 뒤 조사 하드코딩', '조사 하드코딩', { unit: 'exposure-savings', stage: 'how', text: '{food}를 식탁 한쪽에 말없이 올려 두어요. 그걸로 오늘은 끝이에요.', slots: ['food'] }],
    ['줄표', '줄표', { text: '오늘은 가볍게 — 그 한 가지면 넉넉해요. 잘 가고 있어요.' }],
    ['길이 미달', '길이', { text: '짧은 문장이에요.' }],
    ['내부 종결 3연속', '3연속', { text: '식탁에 앉아 주세요. 곁에서 기다려 주세요. 가만히 지켜봐 주세요.' }],
  ];
  it.each(CASES)('차단: %s', (_label, kw, over) => {
    const issues = lintBlock(mk(over));
    expect(issues.some((i) => i.rule.includes(kw))).toBe(true);
  });
  it('화면 단어 스코프: table-stage.intro만 허용(C-07 구조 봉쇄)', () => {
    const text = '화면을 끄는 일부터 가볍게 시작해 보아요. 오늘 한 끼면 됩니다.';
    expect(lintBlock(mk({ unit: 'table-stage', stage: 'intro', id: 'table-stage.intro.1', text }))).toEqual([]);
    expect(lintBlock(mk({ unit: 'table-stage', stage: 'why', text })).some((i) => i.rule.includes('화면'))).toBe(true);
    expect(lintBlock(mk({ unit: 'hunger-rhythm', stage: 'intro', id: 'hunger-rhythm.intro.1', text })).some((i) => i.rule.includes('화면'))).toBe(true);
  });
  it('섞기 스코프: food 유닛 행동 블록만', () => {
    const text = '잘 먹는 음식에 아주 잘게 섞어 한 번만 내어 보아요. 그거면 돼요.';
    expect(lintBlock(mk({ unit: 'exposure-savings', stage: 'how', id: 'exposure-savings.how.1', text }))).toEqual([]);
    expect(lintBlock(mk({ unit: 'table-stage', stage: 'how', id: 'table-stage.how.1', text })).some((i) => i.rule.includes('섞기'))).toBe(true);
  });
  it("plateau '충분' 금지(기존 plateau 가드 승계)", () => {
    const b = mk({ unit: 'common', stage: 'plateau', id: 'common.plateau.1', text: '지금도 충분히 잘하고 계세요. 잔잔한 구간을 믿고 가요.' });
    expect(lintBlock(b).some((i) => i.rule.includes('충분'))).toBe(true);
  });
  it('observe/advance requires 강제 + 공용 블록 슬롯 제한', () => {
    expect(lintBlock(mk({ stage: 'observe', id: 'table-stage.observe.1', text: '{fact}. 그 순간이 아이에게 닿았을 거예요.', slots: ['fact'] }))
      .some((i) => i.rule.includes('requires'))).toBe(true);
    expect(lintBlock(mk({ unit: 'common', stage: 'opener-weekday', id: 'common.opener-weekday.1', text: '{fact} 기록 덕에 오늘도 흐름이 보여요. 고맙습니다.', slots: ['fact'] }))
      .some((i) => i.rule.includes('공용'))).toBe(true);
  });
});

describe('C-19 실 풀 전수(lib/letter-blocks.json — prebuild 게이트)', () => {
  const pool = loadBlocks();
  it('풀 크기 350+ (C-05 DoD)', () => {
    expect(pool.length).toBeGreaterThanOrEqual(350);
  });
  it('전수 린트 0 이슈', () => {
    const issues = lintBlockPool(pool).map((i) => `${i.id} :: ${i.rule}`);
    expect(issues).toEqual([]);
  });
  it('전 블록이 전형 컨텍스트로 렌더 가능(슬롯 무결성 실증)', () => {
    const ctx = { name: '아린', fact: '어제 저녁을 식탁에 앉아 먹었어요', next: '하루 한 끼 식탁에 함께 앉기', food: '두부' };
    const broken = pool.filter((b) => renderBlock(b, ctx) === null).map((b) => b.id);
    expect(broken).toEqual([]);
  });
});
