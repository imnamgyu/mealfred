/**
 * EPIC C — Letter B(merged) grounding 테스트.
 *  순수 함수(serializeMaterials·buildOnboardingDecision·verifyComboSafety·qualityScan) +
 *  buildLetterUserB(merged 분기 C-02~C-06) + verifyFactsB(C-11) + composeLetterB 통합(C-10·C-13, 생성기 주입) +
 *  Letter A byte-identity 회귀(C-01-1·C-14-3).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  serializeMaterials,
  buildOnboardingDecision,
  ONBOARDING_MIN_DAYS,
  verifyComboSafety,
  qualityScan,
  materialFoodsOf,
} from '../lib/coachGrounding';
import {
  buildLetterUserB,
  verifyFactsB,
  composeLetterB,
  allowedFoodsFromBridge,
  buildLetterUser,
  type LetterInput,
  type GroundingMode,
} from '../lib/coach';
import type { FactRow } from '../lib/coachFacts';

// ── C-07 — serializeMaterials ──────────────────────────────────────────────────
describe('C-07 serializeMaterials', () => {
  it('C-07-1 타깃·조합·근거·기간 전부 포함', () => {
    const s = serializeMaterials({ target: '비타민A채소', targetIngredient: '당근', combos: [{ dish: '짜파게티', ingredient: '당근', score: 2 }], rationale: '급식 상위2%', periodFact: '최근 7일 중 3일' });
    expect(s).toContain('당근'); expect(s).toContain('짜파게티'); expect(s).toContain('급식 상위2%'); expect(s).toContain('최근 7일 중 3일');
  });
  it('C-07-2 score 0 조합 제외', () => {
    const s = serializeMaterials({ target: 't', targetIngredient: '당근', combos: [{ dish: '미역국', ingredient: '당근', score: 0 }], rationale: 'r', periodFact: 'p' });
    expect(s).not.toContain('미역국');
  });
  it('C-07-3 빈 combos → 조합 라인 없음·사촌만', () => {
    const s = serializeMaterials({ target: 't', targetIngredient: '당근', combos: [], rationale: 'r', periodFact: 'p', cousins: ['단호박'] });
    expect(s).not.toContain('검증된 조합'); expect(s).toContain('단호박');
  });
  it('C-07-4 조합 점수순 정렬', () => {
    const s = serializeMaterials({ target: 't', targetIngredient: '당근', combos: [{ dish: 'a', ingredient: '당근', score: 1 }, { dish: 'b', ingredient: '당근', score: 3 }, { dish: 'c', ingredient: '당근', score: 2 }], rationale: 'r', periodFact: 'p' });
    expect(s.indexOf('b+')).toBeLessThan(s.indexOf('c+'));
    expect(s.indexOf('c+')).toBeLessThan(s.indexOf('a+'));
  });
  it('C-07-5 입력 외 음식명 합성 안 함', () => {
    const s = serializeMaterials({ target: '비타민A채소', targetIngredient: '당근', combos: [{ dish: '짜파게티', ingredient: '당근', score: 2 }], rationale: '급식', periodFact: '7일' });
    expect(s).not.toContain('미역국'); expect(s).not.toContain('시금치'); expect(s).not.toContain('카레');
  });
  it('C-07-6 cousins 없으면 사촌 라인 생략', () => {
    const s = serializeMaterials({ target: 't', targetIngredient: '당근', combos: [{ dish: 'a', ingredient: '당근', score: 1 }], rationale: 'r', periodFact: 'p' });
    expect(s).not.toContain('사촌');
  });
  it('C-07-7 특수문자(·+()↑) 보존', () => {
    const s = serializeMaterials({ target: 't', targetIngredient: '당근', combos: [], rationale: '눈·면역 ↑', periodFact: 'p' });
    expect(s).toContain('눈·면역 ↑');
  });
  it('C-07-8 score NaN/음수 제외', () => {
    const s = serializeMaterials({ target: 't', targetIngredient: '당근', combos: [{ dish: 'aa', ingredient: '당근', score: NaN }, { dish: 'bb', ingredient: '당근', score: -1 }], rationale: 'r', periodFact: 'p' });
    expect(s).not.toContain('aa'); expect(s).not.toContain('bb'); expect(s).not.toContain('검증된 조합');
  });
  it('C-07-9 긴 combos 상한 절단(<=4)', () => {
    const combos = Array.from({ length: 10 }, (_, i) => ({ dish: `d${i}`, ingredient: '당근', score: 2 }));
    const s = serializeMaterials({ target: 't', targetIngredient: '당근', combos, rationale: 'r', periodFact: 'p' });
    const line = s.split('\n').find((l) => l.includes('검증된 조합')) || '';
    expect(line.split('·').length).toBeLessThanOrEqual(4);
  });
});

// ── C-08 — buildOnboardingDecision ──────────────────────────────────────────────
function row(p: Partial<FactRow>): FactRow {
  return { log_date: '2026-06-13', slot: null, menus: null, refused: null, note: null, environment: null, place: null, ate_well: null, ...p };
}
describe('C-08 buildOnboardingDecision', () => {
  it('C-08-1 loggedDaysTotal 2 → onboarding true', () => {
    expect(buildOnboardingDecision({ rows: [], loggedDaysTotal: 2 }).onboarding).toBe(true);
  });
  it('C-08-2 loggedDaysTotal 3 → false(경계)', () => {
    expect(buildOnboardingDecision({ rows: [row({}), row({}), row({})], loggedDaysTotal: 3 }).onboarding).toBe(false);
  });
  it('C-08-3 거부 없음 → 거부 안내', () => {
    expect(buildOnboardingDecision({ rows: [row({ refused: null })], loggedDaysTotal: 1 }).missingInputHints).toContain('거부한 음식');
  });
  it('C-08-4 거부 있음 → 거부 안내 제외', () => {
    expect(buildOnboardingDecision({ rows: [row({ refused: '당근' })], loggedDaysTotal: 1 }).missingInputHints).not.toContain('거부한 음식');
  });
  it('C-08-5 환경 없음 → 식사 환경 안내', () => {
    const h = buildOnboardingDecision({ rows: [row({ environment: null })], loggedDaysTotal: 1 }).missingInputHints;
    expect(h.some((x) => x.includes('식사 환경'))).toBe(true);
  });
  it('C-08-6 저녁 슬롯 없음 → 저녁 안내', () => {
    const h = buildOnboardingDecision({ rows: [row({ slot: 'breakfast' })], loggedDaysTotal: 1 }).missingInputHints;
    expect(h.some((x) => x.includes('저녁'))).toBe(true);
  });
  it('C-08-7 모두 채움 → hints 빈 배열', () => {
    const rows = [row({ refused: '당근', environment: 'table', slot: 'dinner' })];
    expect(buildOnboardingDecision({ rows, loggedDaysTotal: 5 }).missingInputHints).toEqual([]);
  });
  it('C-08-8 빈 rows → onboarding true + 안내 다수', () => {
    const d = buildOnboardingDecision({ rows: [], loggedDaysTotal: 0 });
    expect(d.onboarding).toBe(true); expect(d.missingInputHints.length).toBeGreaterThanOrEqual(2);
  });
  it('C-08-9 ONBOARDING_MIN_DAYS === 3', () => {
    expect(ONBOARDING_MIN_DAYS).toBe(3);
  });
});

// ── C-09 — verifyComboSafety ─────────────────────────────────────────────────────
describe('C-09 verifyComboSafety', () => {
  it('C-09-1 score>=1만 통과', () => {
    const r = verifyComboSafety([{ dish: 'a', ingredient: 'x' }], () => 2);
    expect(r).toHaveLength(1); expect(r[0].score).toBe(2);
  });
  it('C-09-2 score 0 제거(괴식)', () => {
    expect(verifyComboSafety([{ dish: '미역국', ingredient: '당근' }], (d) => (d === '미역국' ? 0 : 2))).toEqual([]);
  });
  it('C-09-3 혼합 — 통과/탈락 분리', () => {
    const r = verifyComboSafety([{ dish: '짜파게티', ingredient: '당근' }, { dish: '미역국', ingredient: '당근' }], (d) => (d === '짜파게티' ? 2 : 0));
    expect(r.map((x) => x.dish)).toEqual(['짜파게티']);
  });
  it('C-09-4 미존 셀(0) → 탈락', () => {
    expect(verifyComboSafety([{ dish: 'unknown', ingredient: '당근' }], () => 0)).toEqual([]);
  });
  it('C-09-5 빈 입력 → 빈 출력', () => {
    expect(verifyComboSafety([], () => 2)).toEqual([]);
  });
  it('C-09-6 통과 조합에 score 부착', () => {
    expect(verifyComboSafety([{ dish: 'a', ingredient: 'x' }], () => 3)[0].score).toBe(3);
  });
  it('C-09-7 실증 OK 조합 3종 통과', () => {
    const r = verifyComboSafety([{ dish: '짜파게티', ingredient: '당근' }, { dish: '볶음밥', ingredient: '당근' }, { dish: '카레', ingredient: '당근' }], () => 2);
    expect(r).toHaveLength(3);
  });
  it('C-09-8 score 정확히 1 → 통과', () => {
    expect(verifyComboSafety([{ dish: 'a', ingredient: 'x' }], () => 1)).toHaveLength(1);
  });
  it('C-09-9 score 0.9 → 탈락', () => {
    expect(verifyComboSafety([{ dish: 'a', ingredient: 'x' }], () => 0.9)).toEqual([]);
  });
});

// ── C-12 — qualityScan ───────────────────────────────────────────────────────────
describe('C-12 qualityScan', () => {
  it('C-12-1 클리셰 은유 2종+ → 위반', () => {
    expect(qualityScan({ letter: '입맛은 통장이고 노출은 적금이에요', materialFoods: [] }).length).toBeGreaterThanOrEqual(1);
  });
  it('C-12-2 은유 1개 → 통과', () => {
    expect(qualityScan({ letter: '한 걸음씩 나아가고 있어요', materialFoods: [] }).some((r) => r.includes('은유'))).toBe(false);
  });
  it('C-12-3 나열 패턴 → 위반', () => {
    expect(qualityScan({ letter: '어제 당근 먹고 브로콜리 먹었어요', materialFoods: [] }).some((r) => r.includes('나열'))).toBe(true);
  });
  it('C-12-4 수치 없는 모호 기간어 → 위반', () => {
    expect(qualityScan({ letter: '요즘 채소가 아쉬워요', materialFoods: [] }).some((r) => r.includes('모호'))).toBe(true);
  });
  it('C-12-5 수치 동반 기간어 → 통과', () => {
    expect(qualityScan({ letter: '최근 7일 중 채소가 3일이에요', materialFoods: [] }).some((r) => r.includes('모호'))).toBe(false);
  });
  it('C-12-6 재료 밖 음식명 → 위반', () => {
    expect(qualityScan({ letter: '시금치무침을 권해요', materialFoods: ['당근', '짜파게티'] }).some((r) => r.includes('목록 밖'))).toBe(true);
  });
  it('C-12-7 재료 안 음식명 → 통과', () => {
    expect(qualityScan({ letter: '짜파게티에 당근을 넣어보세요', materialFoods: ['당근', '짜파게티'] }).some((r) => r.includes('목록 밖'))).toBe(false);
  });
  it('C-12-8 일반 명사(밥·반찬) 오탐 안 함', () => {
    expect(qualityScan({ letter: '밥에 반찬을 곁들여요', materialFoods: ['당근'] }).some((r) => r.includes('목록 밖'))).toBe(false);
  });
  it('C-12-9 방법론 일반론 통과', () => {
    expect(qualityScan({ letter: '거부는 정상이고 보통 8~10회 노출이면 받아들여요', materialFoods: [] })).toEqual([]);
  });
  it('C-12-10 깨끗한 편지 → 빈 배열', () => {
    expect(qualityScan({ letter: '아린이가 짜파게티를 잘 먹어요. 당근을 살짝 다져 넣어보세요.', materialFoods: ['짜파게티', '당근'] })).toEqual([]);
  });
  it('C-12-11 동일 은유 반복도 위반', () => {
    expect(qualityScan({ letter: '통장처럼 쌓이고 통장처럼 불어나요', materialFoods: [] }).length).toBeGreaterThanOrEqual(1);
  });
  it('C-12-12 빈 letter → 빈 배열', () => {
    expect(qualityScan({ letter: '', materialFoods: [] })).toEqual([]);
  });
  it('materialFoodsOf — 타깃·조합·사촌만', () => {
    expect(materialFoodsOf({ target: 't', targetIngredient: '당근', combos: [{ dish: '짜파게티', ingredient: '당근', score: 2 }], rationale: 'r', periodFact: 'p', cousins: ['단호박'] })).toEqual(['당근', '짜파게티', '단호박']);
  });
});

// ── C-02~C-06 — buildLetterUserB(merged 분기) ─────────────────────────────────────
const M = (extra: Partial<LetterInput>): LetterInput => ({ groundingMode: 'merged', ...extra });
describe('C-02 buildLetterUserB — 재료 블록', () => {
  it('C-02-1 materials 있음 → 재료 블록 포함', () => {
    const o = buildLetterUserB(M({ materials: '짜파게티+당근(2)' }));
    expect(o).toContain('짜파게티+당근(2)'); expect(o).toContain('오늘의 재료'); expect(o).toContain('목록 안에서만');
  });
  it('C-02-2 materials 없음 → bridgeFacts 폴백', () => {
    const o = buildLetterUserB(M({ materials: null, bridgeFacts: 'BF' }));
    expect(o).toContain('검증된 추천'); expect(o).toContain('BF');
    // 재료 헤더 블록은 활성화되지 않음(폴백) — 헤더 마커 부재로 확인.
    expect(o).not.toContain('오늘의 재료 — 코드가 매일 검증');
  });
  it('C-02-4 재료=결정론 사상 문구', () => {
    const o = buildLetterUserB(M({ materials: 'M' }));
    expect(o.includes('어떻게 따뜻하게 쓸지만') || o.includes('이미 정해졌다')).toBe(true);
  });
  it('C-02-5 특수문자 깨짐 없음', () => {
    const o = buildLetterUserB(M({ materials: '볶음밥+당근·카레+당근(2) / 근거: 베타카로틴' }));
    expect(o).toContain('볶음밥+당근·카레+당근(2) / 근거: 베타카로틴');
  });
  it('C-02-6 목록 밖 금지 지시 유지(adversarial)', () => {
    const o = buildLetterUserB(M({ materials: 'M' }));
    const hits = ['목록 밖', '지어내', '괴식'].filter((k) => o.includes(k)).length;
    expect(hits).toBeGreaterThanOrEqual(2);
  });
});
describe('C-03 buildLetterUserB — 거울 데이터', () => {
  it('C-03-1 거울 데이터 + byte 복사 금지 지시', () => {
    const o = buildLetterUserB(M({ mirror: '당근 비어요' }));
    expect(o).toContain('당근 비어요'); expect(o).toContain('그대로 베끼지');
    expect(o.includes('byte') || o.includes('복사 금지')).toBe(true);
  });
  it('C-03-2 거울 없음 → 거울 헤더 미포함', () => {
    expect(buildLetterUserB(M({ mirror: null }))).not.toContain('식단 거울');
  });
  it('C-03-4 거울 사실 보존 지시', () => {
    const o = buildLetterUserB(M({ mirror: '당근 비어요' }));
    expect(o.includes('사실') && o.includes('바꾸지')).toBe(true);
  });
});
describe('C-04 buildLetterUserB — 두뇌 가이드', () => {
  it('C-04-1 가이드 + 자유 작문 지시', () => {
    const o = buildLetterUserB(M({ teachingGuide: '당근 푸드체이닝' }));
    expect(o).toContain('당근 푸드체이닝'); expect(o).toContain('문장·도입'); expect(o).toContain('자유');
  });
  it('C-04-2 teachingGuide 있으면 arcBlock 생략', () => {
    const o = buildLetterUserB(M({ teachingGuide: 'G', weeklyArc: { stage: 'how', behaviorGoal: 'B' } }));
    expect(o).not.toContain('이번 주 코칭 방향'); expect(o).toContain('G');
  });
  it('C-04-3 teachingGuide 없음 → arcBlock 폴백', () => {
    const o = buildLetterUserB(M({ teachingGuide: null, weeklyArc: { stage: 'how', behaviorGoal: 'B' } }));
    expect(o).toContain('이번 주 코칭 방향'); expect(o).toContain('B');
  });
  it('C-04-5 P7 행동 하나 원칙', () => {
    const o = buildLetterUserB(M({ teachingGuide: 'G' }));
    expect(o.includes('한 가지') || o.includes('하나')).toBe(true);
    expect(o).toContain('행동');
  });
});
describe('C-05 buildLetterUserB — 온보딩 분기', () => {
  it('C-05-1 온보딩 → 분석 블록 전부 생략', () => {
    const o = buildLetterUserB(M({ onboardingMode: true, reds: ['철분'], missing: ['채소'], timeseries: ['T'], missingInputHints: ['거부한 음식'] }));
    expect(o).not.toContain('철분'); expect(o).not.toContain('부족 영양소'); expect(o).not.toContain('시계열 사실');
  });
  it('C-05-2 분석 금지 + 입력 안내', () => {
    const o = buildLetterUserB(M({ onboardingMode: true, missingInputHints: ['거부한 음식'] }));
    expect(o).toContain('분석하지'); expect(o).toContain('안내'); expect(o).toContain('팁'); expect(o).toContain('거부한 음식');
  });
  it('C-05-3 즉효 팁 1개 주입', () => {
    const o = buildLetterUserB(M({ onboardingMode: true }));
    expect(o).toContain('오늘의 팁:');
  });
  it('C-05-4 merged·onboarding=false → 정상 분석', () => {
    expect(buildLetterUserB(M({ onboardingMode: false, reds: ['철분'] }))).toContain('철분');
  });
  it('C-05-6 missingInputHints 없으면 기본 안내', () => {
    const o = buildLetterUserB(M({ onboardingMode: true, missingInputHints: null }));
    expect(['끼니', '거부', '환경'].some((k) => o.includes(k))).toBe(true);
  });
});
describe('C-06 buildLetterUserB — timeseries 강등', () => {
  it('C-06-1 timeseries 라벨 참고용·인용 금지', () => {
    const o = buildLetterUserB(M({ timeseries: ['당근 거부'] }));
    expect(o).toContain('참고용'); expect(o).toContain('인용하지'); expect(o).toContain('당근 거부');
  });
  it('C-06-2 factCards 유일 사실 출처 강조', () => {
    const o = buildLetterUserB(M({ factCards: ['거부: 당근 단발 1회'] }));
    expect(o.includes('사실 카드에만') || o.includes('카드에만 근거')).toBe(true);
  });
  it('C-06-4 timeseries 없음 → 자연 처리(없음)', () => {
    const o = buildLetterUserB(M({ timeseries: [] }));
    expect(o).toContain('없음');
  });
});

// ── C-11 — verifyFactsB(merged) ──────────────────────────────────────────────────
describe('C-11 verifyFactsB', () => {
  it('C-11-1 materials 포함', () => {
    expect(verifyFactsB(M({ materials: '짜파게티+당근' }))).toContain('짜파게티+당근');
  });
  it('C-11-2 mirror 포함', () => {
    expect(verifyFactsB(M({ mirror: '당근 비어요' }))).toContain('당근 비어요');
  });
  it('C-11-4 둘 다 없음 → 기존 라인만(throw 없음)', () => {
    const f = verifyFactsB(M({}));
    expect(f.length).toBeGreaterThan(0);
  });
  it('C-11-5 빈 라인 없음(filter(Boolean))', () => {
    expect(/\n\n/.test(verifyFactsB(M({ materials: 'M' })))).toBe(false);
  });
});

// ── C-10·C-13 — composeLetterB 통합(생성기 주입으로 결정론) ─────────────────────────
function genSeq(letters: string[]): { fn: (i: LetterInput) => Promise<{ letter: string; oneliner: string }>; calls: LetterInput[] } {
  const calls: LetterInput[] = [];
  let i = 0;
  const fn = async (input: LetterInput) => {
    calls.push(input);
    const letter = letters[Math.min(i, letters.length - 1)]; i++;
    return { letter, oneliner: 'ol' };
  };
  return { fn, calls };
}
const okVerify = async () => ({ ok: true, violations: [] as string[], hint: null });

describe('C-10·C-13 composeLetterB 통합', () => {
  it('C-10-2 merged → materials/mirror/guide 전달', async () => {
    const { fn, calls } = genSeq(['아린이가 잘 먹고 있어요. 당근을 살짝 다져 넣어보세요.']);
    const r = await composeLetterB({ base: M({ materials: '짜파게티+당근(2)', mirror: '당근 비어요', teachingGuide: '당근 푸드체이닝', materialFoods: ['짜파게티', '당근'] }), gen: fn, verifyFn: okVerify });
    // 주입 생성기는 LetterInput을 받는다 — merged 분기가 그 입력을 그대로 받았는지 확인(groundingMode merged).
    expect(calls[0].groundingMode).toBe('merged');
    expect(calls[0].materials).toContain('짜파게티+당근(2)');
    expect(calls[0].mirror).toContain('당근 비어요');
    expect(calls[0].teachingGuide).toContain('당근 푸드체이닝');
    expect(r.letter).toBeTruthy();
  });
  it('C-10-3 detBad → 재생성(coachRegen·callCount 증가)', async () => {
    // 첫 산출: 환각 시점(FORBID_TIME) → detBad. 둘째: 깨끗.
    const { fn, calls } = genSeq(['지난달부터 당근을 잘 먹어요', '당근을 살짝 다져 넣어보세요.']);
    const r = await composeLetterB({ base: M({ materials: 'M', materialFoods: ['당근'] }), gen: fn, verifyFn: okVerify });
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(r.coachRegen).toBe(true);
    expect(r.letter).not.toContain('지난달');
  });
  it('C-10-6 materials null → bridgeFacts 폴백 발행(throw 없음)', async () => {
    const { fn } = genSeq(['당근을 다져 넣어보세요.']);
    const r = await composeLetterB({ base: M({ materials: null, bridgeFacts: 'BF', materialFoods: ['당근'] }), gen: fn, verifyFn: okVerify });
    expect(r.letter).toBeTruthy();
  });
  it('C-10-7 반환 shape', async () => {
    const { fn } = genSeq(['당근을 넣어보세요.']);
    const r = await composeLetterB({ base: M({ materials: 'M', materialFoods: ['당근'] }), gen: fn, verifyFn: okVerify });
    expect(r).toHaveProperty('letter'); expect(r).toHaveProperty('oneliner'); expect(r).toHaveProperty('plan');
    expect(r).toHaveProperty('scenarioId'); expect(r).toHaveProperty('coachRegen'); expect(r).toHaveProperty('verify');
    expect(r).toHaveProperty('quality'); expect(r).toHaveProperty('modelUsed');
  });
  it('C-10-8 deadline 초과 → 추가 콜 생략(S7)', async () => {
    const { fn, calls } = genSeq(['지난달부터 당근을 잘 먹어요']);   // detBad지만 deadline 지나 재생성 생략
    const r = await composeLetterB({ base: M({ materials: 'M', materialFoods: ['당근'] }), gen: fn, verifyFn: okVerify, deadlineMs: Date.now() - 1000 });
    expect(calls.length).toBe(1);
    expect(r.letter).toContain('지난달');   // 첫 생성 그대로 발행
  });
  it('C-13-1·C-13-2 품질 위반 → 재생성 후 채택', async () => {
    // 첫 산출: 은유 2종 과용(통장+계단) → qualityScan 위반. 둘째: 깨끗.
    const { fn, calls } = genSeq(['입맛은 통장이고 노출은 계단이에요', '아린이가 짜파게티를 잘 먹어요. 당근을 다져 넣어보세요.']);
    const r = await composeLetterB({ base: M({ materials: 'M', materialFoods: ['짜파게티', '당근'] }), gen: fn, verifyFn: okVerify });
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(r.quality?.regen).toBe(true);
    expect(r.quality?.violations).toEqual([]);
    expect(r.letter).not.toContain('통장');
  });
  it('C-13-3 재생성이 det 위반 → 원본 유지(가드 대칭)', async () => {
    // 첫: 은유 과용(품질 위반). 재생성본: 환각 시점(detBad) → 미채택.
    const { fn } = genSeq(['입맛은 통장이고 노출은 계단이에요', '지난달부터 당근을 잘 먹어요']);
    const r = await composeLetterB({ base: M({ materials: 'M', materialFoods: ['당근'] }), gen: fn, verifyFn: okVerify });
    // 품질 재생성본이 detBad라 채택 안 됨 → 원본(은유) 유지, quality.regen=false
    expect(r.quality?.regen).toBe(false);
    expect(r.letter).toContain('통장');
  });
  it('C-13-4 온보딩 → 품질 패스 생략', async () => {
    const { fn, calls } = genSeq(['입맛은 통장이고 노출은 계단이에요']);   // 은유 과용이지만 온보딩이라 품질 재생성 안 함
    const r = await composeLetterB({ base: M({ onboardingMode: true, missingInputHints: ['거부한 음식'] }), gen: fn, verifyFn: okVerify });
    expect(calls.length).toBe(1);
    expect(r.quality).toBeNull();
  });
  it('C-13-6 deadline 초과 → 품질 패스 생략(S7)', async () => {
    const { fn, calls } = genSeq(['입맛은 통장이고 노출은 계단이에요']);
    const r = await composeLetterB({ base: M({ materials: 'M', materialFoods: ['당근'] }), gen: fn, verifyFn: okVerify, deadlineMs: Date.now() - 1000 });
    expect(calls.length).toBe(1);   // deadline → 첫 생성만
    expect(r.quality?.regen).toBeFalsy();
  });
  it('C-13-7 반환 quality 필드 — merged 있음', async () => {
    const { fn } = genSeq(['아린이가 짜파게티를 잘 먹어요. 당근을 넣어보세요.']);
    const r = await composeLetterB({ base: M({ materials: 'M', materialFoods: ['짜파게티', '당근'] }), gen: fn, verifyFn: okVerify });
    expect(r.quality).not.toBeNull();
    expect(Array.isArray(r.quality?.violations)).toBe(true);
  });
  it('C-10-5 verifyFn에 materials/mirror 합본 facts 전달', async () => {
    const seen: { facts: string }[] = [];
    const vf = async (q: { letter: string; facts: string; noFoodAction: boolean; noRediagnose: boolean }) => { seen.push({ facts: q.facts }); return { ok: true, violations: [] as string[], hint: null }; };
    const { fn } = genSeq(['당근을 넣어보세요.']);
    await composeLetterB({ base: M({ materials: '짜파게티+당근', mirror: '당근 비어요', materialFoods: ['짜파게티', '당근'] }), gen: fn, verifyFn: vf });
    expect(seen[0].facts).toContain('짜파게티+당근');
    expect(seen[0].facts).toContain('당근 비어요');
  });
});

// ── C-01·C-14 — Letter A byte-identity 회귀(대조군 보호) ────────────────────────────
describe('C-01·C-14 Letter A 무변경(byte 회귀)', () => {
  const fixtureA: LetterInput = {
    childName: '아린', ageBand: '5y', eatenCount: 12,
    reds: ['철분'], covered: ['곡물'], missing: ['콩류'],
    favoriteFoods: ['볶음밥', '계란말이'], refused: ['브로콜리'],
    timeseries: ['3일 전 콩 거부'], attendsDaycare: true,
    bridgeFacts: '[오늘 타깃] 콩류→두부볶음밥', factCards: ['거부: 브로콜리 단발 1회'],
  };
  it('C-01-1·C-14-3 groundingMode 없는 fixture → buildLetterUser 출력 스냅샷 일치', () => {
    expect(buildLetterUser(fixtureA)).toMatchSnapshot();
  });
  it('C-01-2 빈 객체 → throw 없이 문자열', () => {
    expect(typeof buildLetterUser({})).toBe('string');
  });
  it('C-01-3 GroundingMode 타입 = merged', () => {
    const m: GroundingMode = 'merged';
    expect(m).toBe('merged');
  });
  it('C-02-3 레거시 buildLetterUser → materials 미주입(grounding 필드 무시)', () => {
    const o = buildLetterUser({ bridgeFacts: 'BF', materials: 'M', groundingMode: undefined });
    expect(o).not.toContain('오늘의 재료'); expect(o).toContain('BF');
  });
  it('C-03-3 레거시 → mirror 무시', () => {
    expect(buildLetterUser({ mirror: 'XMIRRORX' })).not.toContain('XMIRRORX');
  });
  it('C-04-4 레거시 → teachingGuide 무시', () => {
    expect(buildLetterUser({ teachingGuide: 'GGUIDEG' })).not.toContain('GGUIDEG');
  });
  it('C-05-5 레거시 → onboardingMode 무시(정상 분석)', () => {
    expect(buildLetterUser({ onboardingMode: true, reds: ['철분'] })).toContain('철분');
  });
  it('C-06-3 레거시 → 시계열 사실 라벨 유지(참고용 아님)', () => {
    const o = buildLetterUser({ timeseries: ['T'] });
    expect(o).toContain('시계열 사실'); expect(o).not.toContain('참고용');
  });
  it('C-14-6 온보딩 엣지(기록 0일) → 분석 블록 0·입력안내 present', () => {
    const o = buildLetterUserB(M({ onboardingMode: true, loggedDaysTotal: 0, reds: ['철분'], missingInputHints: ['끼니 기록'] }));
    expect(o).not.toContain('철분'); expect(o).toContain('끼니 기록'); expect(o).toContain('분석하지');
  });
  // source-grep 회귀 — composeLetterB가 composeLetter 본문을 수정하지 않았음(별개 함수)
  it('C-14-4 coach.ts에 composeLetter·composeLetterB 둘 다 존재(별개 함수)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../lib/coach.ts', import.meta.url), 'utf8');
    expect(src.includes('export async function composeLetter(')).toBe(true);
    expect(src.includes('export async function composeLetterB(')).toBe(true);
  });
});

// vi import 사용(스냅샷 외 mock 미사용이지만 컨벤션 일치 확인용) — no-op
void vi;
