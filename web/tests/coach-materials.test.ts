/**
 * tests/coach-materials.test.ts — Letter B 재료 엔진 (WBS EPIC A)
 * A-01 빈도 정비 · A-02 liked 판정 · A-04 4기준 랭킹 · A-05 회전 · A-06 결핍 수치 ·
 * A-07 조합 후보 · A-08 근거문구 · A-09 온보딩 · A-10 오케스트레이터 · A-12 6통 회귀 박제.
 */
import { describe, it, expect } from 'vitest';
import {
  GROUP_INGREDIENTS_RANKED, GIO_FREQ, ingredientGioFreq, deriveLikedIngredients,
  rankIngredients, RANK_W, rotateRecommendation, deficiencyWindow, buildValidatedCombos,
  buildReasonPhrases, materialsForLowData, selectDailyMaterials, type MealRow,
} from '../lib/coachMaterials';
import type { GroupSignal } from '../lib/nutrition';
import { arinSignals, arinMeals, arinFavoriteFoods, onboardingArgs, analyzeArgs } from './fixtures/materials';

// ── A-01 빈도 정비 ───────────────────────────────────────────────────────────────
describe('A-01 GROUP_INGREDIENTS_RANKED · ingredientGioFreq', () => {
  it('A-01-1 비타민A채소 RANKED 1위는 당근(184)', () => {
    expect(GROUP_INGREDIENTS_RANKED['비타민A채소'][0]).toBe('당근');
  });
  it('A-01-2 단호박(0회)은 비타민A채소 RANKED 최하위', () => {
    expect(GROUP_INGREDIENTS_RANKED['비타민A채소'].at(-1)).toBe('단호박');
  });
  it('A-01-3 근대(11) > 단호박(0) 상위', () => {
    const r = GROUP_INGREDIENTS_RANKED['비타민A채소'];
    expect(r.indexOf('근대')).toBeLessThan(r.indexOf('단호박'));
  });
  it('A-01-4 ingredientGioFreq(당근)={184,2}', () => {
    expect(ingredientGioFreq('당근')).toEqual({ freq: 184, pct: 2 });
  });
  it('A-01-5 미상 식재료 폴백 {0,100}', () => {
    expect(ingredientGioFreq('아스파라거스')).toEqual({ freq: 0, pct: 100 });
  });
  it('A-01-6 치즈18·요거트0 빈도 메타', () => {
    expect(GIO_FREQ['치즈'].freq).toBe(18);
    expect(ingredientGioFreq('요거트').freq).toBe(0);
  });
  it('A-01-9 기타채소 RANKED 토마토(42) > 양배추(20)', () => {
    const r = GROUP_INGREDIENTS_RANKED['기타채소'];
    expect(r.indexOf('토마토')).toBeLessThan(r.indexOf('양배추'));
  });
  it('A-01-8 RANKED 원소 집합 = GROUP_INGREDIENTS 원본(누락·추가 0)', async () => {
    const { GROUP_INGREDIENTS } = await import('../lib/coachRecos');
    for (const g of Object.keys(GROUP_INGREDIENTS)) {
      expect([...GROUP_INGREDIENTS_RANKED[g]].sort()).toEqual([...GROUP_INGREDIENTS[g]].sort());
    }
  });
});

// ── A-02 liked 판정 ─────────────────────────────────────────────────────────────
describe('A-02 deriveLikedIngredients', () => {
  const m = (food: string, place: string | null, ateWell: boolean | null, daysAgo: number, refused?: boolean): MealRow => ({ food, place, ateWell, daysAgo, refused });
  it('A-02-1 집 2일 잘먹음 → liked', () => {
    expect(deriveLikedIngredients([m('당근', 'home', true, 1), m('당근', 'home', true, 3)]).liked).toContain('당근');
  });
  it('A-02-2 집 1일만 → liked 제외', () => {
    expect(deriveLikedIngredients([m('당근', 'home', true, 1)]).liked).not.toContain('당근');
  });
  it('A-02-3 급식만 → liked 제외(차려진 것·P10)', () => {
    expect(deriveLikedIngredients([m('시금치', 'daycare', true, 1), m('시금치', 'daycare', true, 2)]).liked).not.toContain('시금치');
  });
  it('A-02-4 간식(place=snack) → liked 제외', () => {
    expect(deriveLikedIngredients([m('치즈', 'snack', true, 1), m('치즈', 'snack', true, 2)]).liked).not.toContain('치즈');
  });
  it('A-02-5 같은 날 2끼는 1일로(distinct day)', () => {
    expect(deriveLikedIngredients([m('당근', 'home', true, 1), m('당근', 'home', true, 1)]).liked).not.toContain('당근');
  });
  it('A-02-6 거부 식재료 → refused·liked 배제', () => {
    const r = deriveLikedIngredients([m('가지', 'home', false, 1), m('가지', 'home', false, 2)]);
    expect(r.refused).toContain('가지');
    expect(r.liked).not.toContain('가지');
  });
  it('A-02-7 liked·refused 충돌 시 refused 우선', () => {
    const r = deriveLikedIngredients([m('당근', 'home', true, 1), m('당근', 'home', true, 2), m('당근', 'home', false, 3)]);
    expect(r.refused).toContain('당근');
    expect(r.liked).not.toContain('당근');
  });
  it('A-02-8 place=null은 집 통제로 간주', () => {
    expect(deriveLikedIngredients([m('당근', null, true, 1), m('당근', null, true, 2)]).liked).toContain('당근');
  });
  it('A-02-9 빈 입력', () => {
    expect(deriveLikedIngredients([])).toEqual({ liked: [], refused: [] });
  });
  it('A-02-10 전부 daycare → liked 비어있음', () => {
    expect(deriveLikedIngredients([m('당근', 'daycare', true, 1), m('당근', 'daycare', true, 2)]).liked).toEqual([]);
  });
  it('A-02-11 ateWell null은 거부 아님(liked 가산)', () => {
    expect(deriveLikedIngredients([m('당근', 'home', null, 1), m('당근', 'home', null, 2)]).liked).toContain('당근');
  });
  it('A-02-12 liked 중복 제거', () => {
    const liked = deriveLikedIngredients([m('당근', 'home', true, 1), m('당근', 'home', true, 2), m('당근', 'home', true, 3)]).liked;
    expect(liked.filter((x) => x === '당근')).toHaveLength(1);
  });
});

// ── A-04 4기준 랭킹 ──────────────────────────────────────────────────────────────
describe('A-04 rankIngredients', () => {
  it('A-04-1 비타민A채소 red → 당근 최상위(빈도 가중)', () => {
    const r = rankIngredients({ targetGroup: '비타민A채소', groupLevel: 'red', liked: [] });
    expect(r[0].ing).toBe('당근');
  });
  it('A-04-2 freq 점수: 당근 pct2→3 · 근대 pct39→1 · 단호박 pct100→0', () => {
    const r = rankIngredients({ targetGroup: '비타민A채소', groupLevel: 'red', liked: [] });
    const by = Object.fromEntries(r.map((x) => [x.ing, x.parts.freq]));
    expect(by['당근']).toBe(3);
    expect(by['근대']).toBe(1);
    expect(by['단호박']).toBe(0);
  });
  it('A-04-3 단호박은 liked 사촌/궁합 없으면 최하위로 가라앉음', () => {
    const r = rankIngredients({ targetGroup: '비타민A채소', groupLevel: 'red', liked: [] });
    expect(r.at(-1)!.ing).toBe('단호박');
  });
  it('A-04-4 urgency: red=3 · yellow=1 · green=0', () => {
    const red = rankIngredients({ targetGroup: '비타민A채소', groupLevel: 'red', liked: [] });
    const green = rankIngredients({ targetGroup: '비타민A채소', groupLevel: 'green', liked: [] });
    expect(red[0].parts.urgency).toBe(3);
    expect(green[0].parts.urgency).toBe(0);
  });
  it('A-04-5 parts 4기준 모두 분해되어 노출', () => {
    const r = rankIngredients({ targetGroup: '비타민A채소', groupLevel: 'red', liked: [] });
    expect(Object.keys(r[0].parts).sort()).toEqual(['bridge', 'freq', 'pair', 'urgency']);
  });
  it('A-04-6 가중치 상수 W로 score 계산(검증 가능)', () => {
    const r = rankIngredients({ targetGroup: '비타민A채소', groupLevel: 'red', liked: [] });
    const p = r[0].parts;
    expect(r[0].score).toBe(p.urgency * RANK_W.urgency + p.freq * RANK_W.freq + p.pair * RANK_W.pair + p.bridge * RANK_W.bridge);
  });
  it('A-04-7 결정론: 동일 입력 동일 출력', () => {
    const a = rankIngredients({ targetGroup: '기타채소', groupLevel: 'yellow', liked: ['두부'] });
    const b = rankIngredients({ targetGroup: '기타채소', groupLevel: 'yellow', liked: ['두부'] });
    expect(a).toEqual(b);
  });
  it('A-04-8 미존재 그룹 → 빈 배열', () => {
    expect(rankIngredients({ targetGroup: 'zzz', groupLevel: 'red', liked: [] })).toEqual([]);
  });
});

// ── A-05 회전(수렴 방지) ─────────────────────────────────────────────────────────
describe('A-05 rotateRecommendation', () => {
  const ranked = [{ ing: '당근', score: 9 }, { ing: '시금치', score: 5 }, { ing: '근대', score: 5 }, { ing: '단호박', score: 3 }];
  it('A-05-1 최근 추천 없으면 랭킹 1위', () => {
    expect(rotateRecommendation({ ranked, recentRecos: [] })).toBe('당근');
  });
  it('A-05-2 1위가 쿨다운이면 다음 fresh 최상위', () => {
    expect(rotateRecommendation({ ranked, recentRecos: ['당근'] })).toBe('시금치');
  });
  it('A-05-3 2일 연속 다른 재료(수렴 방지)', () => {
    const d1 = rotateRecommendation({ ranked, recentRecos: [] });
    const d2 = rotateRecommendation({ ranked, recentRecos: [d1!] });
    expect(d2).not.toBe(d1);
  });
  it('A-05-4 전부 쿨다운 → 랭킹 1위 폴백(null 금지)', () => {
    expect(rotateRecommendation({ ranked, recentRecos: ['당근', '시금치', '근대', '단호박'] })).toBe('당근');
  });
  it('A-05-5 빈 랭킹 → null', () => {
    expect(rotateRecommendation({ ranked: [], recentRecos: [] })).toBeNull();
  });
  it('A-05-6 결정론(이력 배제·날짜 시드 아님)', () => {
    expect(rotateRecommendation({ ranked, recentRecos: ['당근'] })).toBe(rotateRecommendation({ ranked, recentRecos: ['당근'] }));
  });
});

// ── A-06 결핍 수치 ───────────────────────────────────────────────────────────────
describe('A-06 deficiencyWindow', () => {
  it('A-06-1 가장 시급한 결핍 = 채소 우선(red·vegBonus)', () => {
    const w = deficiencyWindow(arinSignals);
    expect(w?.group).toBe('비타민A채소');
    expect(w?.level).toBe('red');
  });
  it('A-06-2 daysOf7 = round(weeklyEst) 수치', () => {
    expect(deficiencyWindow(arinSignals)?.daysOf7).toBe(1);
  });
  it('A-06-3 threshold = GROUP_TARGET.green(비타민A채소=5)', () => {
    expect(deficiencyWindow(arinSignals)?.threshold).toBe(5);
  });
  it('A-06-4 전부 green이면 null(환각 방지)', () => {
    const allGreen: GroupSignal[] = arinSignals.map((s) => ({ ...s, level: 'green' as const }));
    expect(deficiencyWindow(allGreen)).toBeNull();
  });
  it('A-06-5 과일·유제품(간식 채널)은 결핍 타깃에서 제외', () => {
    const onlyFruit: GroupSignal[] = [{ group: '과일', level: 'red', weeklyEst: 0 }, { group: '유제품', level: 'red', weeklyEst: 0 }];
    expect(deficiencyWindow(onlyFruit)).toBeNull();
  });
});

// ── A-07 검증 통과 조합 ──────────────────────────────────────────────────────────
describe('A-07 buildValidatedCombos', () => {
  it('A-07-1 미역국+당근(1) 제외·볶음밥/김밥(3) 포함(괴식 0)', () => {
    const c = buildValidatedCombos({ recommendedIng: '당근', likedDishes: arinFavoriteFoods });
    const dishes = c.map((x) => x.liked);
    expect(dishes).not.toContain('미역국');
    expect(dishes).toContain('볶음밥');
    expect(dishes).toContain('김밥');
  });
  it('A-07-2 모든 결과 score>=threshold(기본 2)', () => {
    const c = buildValidatedCombos({ recommendedIng: '당근', likedDishes: arinFavoriteFoods });
    expect(c.every((x) => x.score >= 2)).toBe(true);
  });
  it('A-07-3 score 내림차순', () => {
    const c = buildValidatedCombos({ recommendedIng: '당근', likedDishes: arinFavoriteFoods });
    for (let i = 1; i < c.length; i++) expect(c[i - 1].score).toBeGreaterThanOrEqual(c[i].score);
  });
  it('A-07-4 통과 조합 0이면 빈 배열(조합 강요 금지)', () => {
    const c = buildValidatedCombos({ recommendedIng: '당근', likedDishes: ['미역국'] });
    expect(c).toEqual([]);
  });
  it('A-07-5 max 캡(기본 4)', () => {
    const c = buildValidatedCombos({ recommendedIng: '당근', likedDishes: ['볶음밥', '김밥', '비빔밥', '덮밥', '카레', '주먹밥'] });
    expect(c.length).toBeLessThanOrEqual(4);
  });
});

// ── A-08 근거 문구 ───────────────────────────────────────────────────────────────
describe('A-08 buildReasonPhrases', () => {
  const win = { group: '비타민A채소', daysOf7: 1, threshold: 5, level: 'red' as const };
  it('A-08-1 급식빈도 상위% 문구(당근 상위 2%)', () => {
    const ps = buildReasonPhrases({ ing: '당근', window: win });
    expect(ps.some((p) => p.includes('상위 2%'))).toBe(true);
  });
  it('A-08-2 결핍 수치 문구(7일 중 N일·권장)', () => {
    const ps = buildReasonPhrases({ ing: '당근', window: win });
    expect(ps.some((p) => /7일 중 1일/.test(p) && /권장/.test(p))).toBe(true);
  });
  it('A-08-3 영양역할 라벨(당근→베타카로틴)', () => {
    const ps = buildReasonPhrases({ ing: '당근', window: win });
    expect(ps.some((p) => p.includes('베타카로틴'))).toBe(true);
  });
  it('A-08-4 궁합·사촌 문구', () => {
    const ps = buildReasonPhrases({ ing: '당근', window: win, pairLiked: '볶음밥', cousinOf: '단호박' });
    expect(ps.some((p) => p.includes('볶음밥에 곁들이면'))).toBe(true);
    expect(ps.some((p) => p.includes('단호박을 잘 먹으니'))).toBe(true);
  });
  it('A-08-5 모호 기간어(요즘·이번주) 미포함', () => {
    const ps = buildReasonPhrases({ ing: '당근', window: win });
    expect(ps.some((p) => /요즘|이번\s?주/.test(p))).toBe(false);
  });
  it('A-08-6 단호박(빈도 0·상위 100%)은 빈도 문구 없음', () => {
    const ps = buildReasonPhrases({ ing: '단호박', window: win });
    expect(ps.some((p) => p.includes('급식에 자주'))).toBe(false);
  });
});

// ── A-09 온보딩 ──────────────────────────────────────────────────────────────────
describe('A-09 materialsForLowData', () => {
  it('A-09-1 기록<3일 → onboarding 모드', () => {
    const r = materialsForLowData({ recordedDays: 1, hasHeight: false, hasWeight: false, hasConditions: false, mealCount: 1, tipSeed: 1 });
    expect(r.mode).toBe('onboarding');
  });
  it('A-09-2 미입력 항목 안내(키·몸무게·질환·끼니)', () => {
    const r = materialsForLowData({ recordedDays: 0, hasHeight: false, hasWeight: false, hasConditions: false, mealCount: 0, tipSeed: 1 });
    expect(r.mode === 'onboarding' && r.missingInputs).toEqual(['키', '몸무게', '알레르기·만성질환', '끼니 기록']);
  });
  it('A-09-3 기록>=3일 → analyze 모드', () => {
    expect(materialsForLowData({ recordedDays: 3, mealCount: 5, tipSeed: 1 }).mode).toBe('analyze');
  });
  it('A-09-4 온보딩에 결핍 분석 없음·팁 제공(환각 차단)', () => {
    const r = materialsForLowData({ recordedDays: 2, hasHeight: true, hasWeight: true, hasConditions: true, mealCount: 5, tipSeed: 5 });
    expect(r.mode).toBe('onboarding');
    if (r.mode === 'onboarding') { expect(r.missingInputs).toEqual([]); expect(typeof r.tip).toBe('string'); }
  });
  it('A-09-5 팁 결정론(같은 seed 같은 팁)', () => {
    const a = materialsForLowData({ recordedDays: 1, mealCount: 0, tipSeed: 9 });
    const b = materialsForLowData({ recordedDays: 1, mealCount: 0, tipSeed: 9 });
    expect(a).toEqual(b);
  });
});

// ── A-10 오케스트레이터 ──────────────────────────────────────────────────────────
describe('A-10 selectDailyMaterials', () => {
  it('A-10-1 온보딩 입력 → mode onboarding·결핍 분석 없음', () => {
    const m = selectDailyMaterials({ ...onboardingArgs, tipSeed: 7 });
    expect(m.mode).toBe('onboarding');
    expect(m.targetGroup).toBeNull();
    expect(m.recommendedIng).toBeNull();
    expect(m.deficiencyWindow).toBeNull();
  });
  it('A-10-2 분석 입력 → 타깃·추천·조합·근거 채워짐', () => {
    const m = selectDailyMaterials(analyzeArgs);
    expect(m.mode).toBe('analyze');
    expect(m.targetGroup).toBe('비타민A채소');
    expect(m.recommendedIng).toBeTruthy();
    expect(m.deficiencyWindow?.daysOf7).toBe(1);
    expect(m.reasonPhrases.length).toBeGreaterThan(0);
  });
  it('A-10-3 liked=집 밥·달걀 / refused=가지(P10)', () => {
    const m = selectDailyMaterials(analyzeArgs);
    expect(m.liked.sort()).toEqual(['달걀', '밥']);
    expect(m.refused).toContain('가지');
    expect(m.liked).not.toContain('당근');   // 급식 당근은 liked 아님
  });
  it('A-10-4 validatedCombos에 미역국+추천 괴식 0(score>=2)', () => {
    const m = selectDailyMaterials(analyzeArgs);
    expect(m.validatedCombos.every((c) => c.score >= 2)).toBe(true);
  });
  it('A-10-5 전부 green → 타깃 null·조합 빈(결핍 강요 안 함)', () => {
    const allGreen: GroupSignal[] = arinSignals.map((s) => ({ ...s, level: 'green' as const }));
    const m = selectDailyMaterials({ ...analyzeArgs, signals: allGreen });
    expect(m.mode).toBe('analyze');
    expect(m.targetGroup).toBeNull();
    expect(m.validatedCombos).toEqual([]);
  });
  it('A-10-6 결정론: 동일 입력 동일 출력', () => {
    expect(selectDailyMaterials(analyzeArgs)).toEqual(selectDailyMaterials(analyzeArgs));
  });
});

// ── A-12 6통 회귀 박제(괴식 0·수렴 0) ────────────────────────────────────────────
describe('A-12 아린 6일 시뮬 — 괴식 0·연속3일 무재사용', () => {
  const run = () => {
    const seq: (string | null)[] = [];
    const allCombos: { liked: string; deficient: string; score: number }[] = [];
    let recent: string[] = [];
    for (let day = 0; day < 6; day++) {
      const m = selectDailyMaterials({ ...analyzeArgs, recentRecos: recent });
      seq.push(m.recommendedIng);
      allCombos.push(...m.validatedCombos);
      recent = [m.recommendedIng, ...recent].filter(Boolean).slice(0, 3) as string[];   // 최근 3일창
    }
    return { seq, allCombos };
  };
  it('A-12-1 6일 validatedCombos 전 항목 score>=2 (괴식 0)', () => {
    expect(run().allCombos.every((c) => c.score >= 2)).toBe(true);
  });
  it('A-12-2 추천 당근일에 미역국 조합 0(괴식 차단)', () => {
    const { allCombos } = run();
    expect(allCombos.some((c) => c.liked === '미역국' && c.deficient === '당근')).toBe(false);
  });
  it('A-12-3 연속 3일 중 동일 추천 재사용 0(수렴 방지)', () => {
    const { seq } = run();
    for (let i = 2; i < seq.length; i++) {
      const win = [seq[i - 2], seq[i - 1], seq[i]].filter(Boolean);
      expect(new Set(win).size).toBe(win.length);
    }
  });
  it('A-12-4 red 입력일은 deficiencyWindow 비-null·daysOf7 수치', () => {
    const m = selectDailyMaterials(analyzeArgs);
    expect(m.deficiencyWindow).not.toBeNull();
    expect(typeof m.deficiencyWindow!.daysOf7).toBe('number');
  });
  it('A-12-5 온보딩 fixture는 mode onboarding', () => {
    expect(selectDailyMaterials({ ...onboardingArgs, tipSeed: 7 }).mode).toBe('onboarding');
  });
});
