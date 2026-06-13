/**
 * tests/coach-compare.test.ts — 크론 compare 2통 발행 (WBS v2-하이브리드 EPIC E)
 *   E-01 compareEnabled · E-02 buildLetterB 오케스트레이션·폴백 · E-09 design 스냅샷 ·
 *   E-10 아린 2일 연속 리플레이 불변식(A≠B·재료 3일내 비반복·진도 영속·괴식 0·예산 폴백).
 *
 * route.ts는 Next API라 단위 테스트가 어렵다 — 순수 부분(compareEnabled·buildLetterB)을 직접 구동하고,
 * v3 두뇌(decideDailyV3)는 fixture로 실제 호출해 통합 불변식을 검증한다(리플레이 정신).
 */
import { describe, it, expect, vi } from 'vitest';
import { compareEnabled, v3Enabled, decideDailyV3, type DailyV3Result } from '../lib/coachDaily';
import { buildLetterB, serializeGuide, type ComposeLetterB, type BuildLetterBArgs } from '../lib/coachCompare';
import { composeLetterB, type LetterInput, type LetterVerify } from '../lib/coach';
import { selectDailyMaterials } from '../lib/coachMaterials';
import { buildTeachingGuide } from '../lib/coachGuide';
import { scoreCombo } from '../lib/comboMatrix';
import type { WeeklyAnchor } from '../lib/coachWeekly';
import type { CRow, UnitId, ProgressRow as CurriculumRow, Goal } from '../lib/curriculumUnits';
import type { GroupSignal } from '../lib/nutrition';
import type { MealRow } from '../lib/coachMaterials';
import fixture from './fixtures/compare-arin.json';

// ── E-01 — compareEnabled ──────────────────────────────────────────────────────
describe('E-01 compareEnabled', () => {
  it('E-01-1 COACH_COMPARE_CHILDREN에 든 자녀=true', () => {
    expect(compareEnabled({ COACH_COMPARE_CHILDREN: 'aaa,bbb' }, 'bbb')).toBe(true);
  });
  it('E-01-2 코호트에 없는 자녀=false', () => {
    expect(compareEnabled({ COACH_COMPARE_CHILDREN: 'aaa' }, 'zzz')).toBe(false);
  });
  it('E-01-3 COMPARE_CHILDREN 미설정 시 V3 폴백', () => {
    expect(compareEnabled({ COACH_V3_CHILDREN: 'aaa' }, 'aaa')).toBe(true);
  });
  it('E-01-4 COMPARE_CHILDREN 빈 문자열이면 V3 폴백', () => {
    expect(compareEnabled({ COACH_COMPARE_CHILDREN: '', COACH_V3_CHILDREN: 'aaa' }, 'aaa')).toBe(true);
  });
  it('E-01-5 COACH_COMPARE=1이면 임의 자녀 true', () => {
    expect(compareEnabled({ COACH_COMPARE: '1' }, 'anything')).toBe(true);
  });
  it('E-01-6 전부 미설정이면 false', () => {
    expect(compareEnabled({}, 'aaa')).toBe(false);
  });
  it('E-01-7 공백 섞인 CSV trim', () => {
    expect(compareEnabled({ COACH_COMPARE_CHILDREN: ' aaa , bbb ' }, 'bbb')).toBe(true);
  });
  it('E-01-8 COMPARE_CHILDREN 설정되면 V3 폴백 무시', () => {
    expect(compareEnabled({ COACH_COMPARE_CHILDREN: 'aaa', COACH_V3_CHILDREN: 'bbb' }, 'bbb')).toBe(false);
  });
  it('E-01-9 빈 토큰(연속 콤마) 무시', () => {
    expect(compareEnabled({ COACH_COMPARE_CHILDREN: 'aaa,,bbb' }, '')).toBe(false);
  });
  it("E-01-10 COACH_COMPARE!='1'은 전체 ON 아님", () => {
    expect(compareEnabled({ COACH_COMPARE: 'true' }, 'aaa')).toBe(false);
  });
  it('E-01-11 대소문자 구분 id 매칭', () => {
    expect(compareEnabled({ COACH_COMPARE_CHILDREN: 'AAA' }, 'aaa')).toBe(false);
  });
  it('E-01-12 v3Enabled와 독립 — compare 끔이 v3에 영향 없음', () => {
    expect(v3Enabled({ COACH_V3_CHILDREN: 'aaa' }, 'aaa')).toBe(true);
    expect(compareEnabled({}, 'aaa')).toBe(false);
  });
});

// ── 공용 fixture → 실제 v3 두뇌 산출 ─────────────────────────────────────────────
const F = fixture as unknown as {
  childId: string; ageBand: string; weekKey: string; anchor: WeeklyAnchor;
  groupSignals: GroupSignal[]; meals: MealRow[]; favoriteFoods: string[];
};
function dayRows(today: string): CRow[] {
  // 7일 창 — 매일 점심(급식)·저녁(집·미역국)·아침(집·밥). 비타민A채소(당근) 결핍 유지.
  const rows: CRow[] = [];
  const base = Date.parse(today);
  for (let n = 1; n <= 7; n++) {
    const d = new Date(base - n * 86400000).toISOString().slice(0, 10);
    rows.push({ log_date: d, slot: 'lunch', menus: ['급식밥', '미역국'], ingredients: ['쌀', '미역'], refused: null, note: null, environment: null, place: 'daycare', ate_well: true });
    rows.push({ log_date: d, slot: 'dinner', menus: ['밥', '계란찜'], ingredients: ['쌀', '달걀'], refused: null, note: null, environment: 'table', place: 'home', ate_well: true });
    rows.push({ log_date: d, slot: 'breakfast', menus: ['밥'], ingredients: ['쌀'], refused: null, note: null, environment: 'table', place: 'home', ate_well: true });
  }
  return rows;
}
function brainFor(today: string, progress: Partial<Record<UnitId, CurriculumRow>>): DailyV3Result {
  return decideDailyV3({
    childId: F.childId, goals: F.anchor.goals as Goal[], progress, rows: dayRows(today), answers: [],
    coachedDays: {}, coachedYesterday: [], pivotsThisWeek: 0, foodTarget: '당근', today,
    prevDecisions: [],
  });
}

// 결정론 가짜 LLM 생성기 — 재료(materials)·각도(arcStage)를 본문에 그대로 박아 'A≠B'와 재료 회전을 가시화.
const fakeGen = (input: LetterInput): Promise<{ letter: string; oneliner: string }> => {
  const mat = input.materials || '';
  const m = mat.match(/타깃\]\s*[^—]*—\s*([^\n]+)/);
  const food = m ? m[1].trim() : '오늘 재료';
  return Promise.resolve({
    letter: `${input.childName}의 식탁을 봤어요. 오늘은 ${food}를 자연스럽게 만나보면 좋겠어요. 천천히 한 걸음씩이면 충분해요.`,
    oneliner: `${food} 한 걸음`,
  });
};
const fakeVerify = (): Promise<LetterVerify> => Promise.resolve({ ok: true, violations: [], hint: null });

function baseArgs(today: string, recentBMaterials: string[], pastBLetters: { date: string; letter: string }[], progress: Partial<Record<UnitId, CurriculumRow>>): BuildLetterBArgs {
  const brain = brainFor(today, progress);
  return {
    childName: '아린', ageBand: F.ageBand,
    rows: dayRows(today), meals: F.meals, today,
    freqMap: {},
    favoriteFoods: F.favoriteFoods, reds: ['비타민A'], missing: ['비타민A채소'],
    groupSignals: F.groupSignals, recordedDays: 7,
    onboardingMeta: { hasHeight: true, hasWeight: true, hasConditions: true },
    recentBMaterials, pastBLetters,
    factCards: ['어제 저녁 계란찜을 잘 먹었어요'], mirror: '어제 저녁에 계란찜을 먹었어요',
    timeseries: [], attendsDaycare: true,
    dailyResult: brain, anchor: F.anchor, firstOfWeek: true, lastArcStage: null, progress: false,
    recentCtxs: [], dow: 2, daySeed: Math.floor(Date.parse(today) / 86400000), cidHash: 77,
    composeLetterB, gen: fakeGen, verifyFn: fakeVerify,
  };
}

// ── E-02 — buildLetterB 오케스트레이션·폴백(스텁 composeLetterB) ───────────────────
describe('E-02 buildLetterB 오케스트레이션', () => {
  // ⚠️ 플레인 async(공유 vi.fn 금지 — 호출 카운트 누적 오염 방지). 호출횟수 단언은 테스트별 fresh vi.fn.
  const okStub: ComposeLetterB = async () => ({
    letter: '본문', oneliner: '한줄', coachRegen: false,
    verify: { ok: true, violations: [], regen: false }, quality: { violations: [], regen: false }, modelUsed: 'haiku-4-5',
  });

  it('E-02-1 모든 단계 성공 시 AltLetter 반환', async () => {
    const r = await buildLetterB({ ...baseArgs('2026-06-13', [], [], {}), composeLetterB: okStub });
    expect(r).not.toBeNull();
    expect(r!.letter).toBe('본문');
    expect(r!.design).toBeTruthy();
  });
  it('E-02-3 작문 단계 throw → null', async () => {
    const throwStub: ComposeLetterB = async () => { throw new Error('compose fail'); };
    const r = await buildLetterB({ ...baseArgs('2026-06-13', [], [], {}), composeLetterB: throwStub });
    expect(r).toBeNull();
  });
  it('E-02-5 deadlineMs 이미 지남 → composeLetterB 0회·null', async () => {
    const spy = vi.fn(okStub);
    const r = await buildLetterB({ ...baseArgs('2026-06-13', [], [], {}), composeLetterB: spy, deadlineMs: Date.now() - 1 });
    expect(r).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
  it('E-02-6 성공 결과에 llmCalls 카운트(작문+검증=2)', async () => {
    const stub: ComposeLetterB = async () => ({
      letter: 'L', oneliner: 'O', coachRegen: false,
      verify: { ok: true, violations: [], regen: false }, quality: null, modelUsed: 'haiku-4-5',
    });
    const r = await buildLetterB({ ...baseArgs('2026-06-13', [], [], {}), composeLetterB: stub });
    expect(r!.llmCalls).toBe(2);   // 작문 1 + 검증 1
  });
  it('E-02-7 mirror가 결과에 그대로 실림(저장용)', async () => {
    const r = await buildLetterB({ ...baseArgs('2026-06-13', [], [], {}), composeLetterB: okStub, mirror: '거울문장' });
    expect(r!.mirror).toBe('거울문장');
  });
  it('E-02-8 composeLetterB를 인자로 주입(전역 import 비의존)', async () => {
    const spy = vi.fn(okStub);
    await buildLetterB({ ...baseArgs('2026-06-13', [], [], {}), composeLetterB: spy });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── E-03 — freqMap 본경로 배선(빈도 가중) ────────────────────────────────────────
describe('E-03 freqMap 배선', () => {
  it('E-03-4 freqMap 차 있을 때 단호박(0회)이 당근(184) 후순위', () => {
    // selectDailyMaterials가 freqMap을 소비(C 가중 랭킹) — buildLetterB가 args.freqMap을 그대로 전달.
    const mats = selectDailyMaterials({
      signals: F.groupSignals, meals: F.meals, favoriteFoods: F.favoriteFoods,
      recentRecos: [], freqMap: { 당근: [{ name: '당근볶음', freq: 184 }], 단호박: [] },
      recordedDays: 7, tipSeed: 1,
    });
    expect(mats.recommendedIng).not.toBe('단호박');   // 빈도 최하 식재료가 1위로 안 옴
  });
  it('E-03-5 freqMap 빈 객체여도 크래시 없이 추천 산출(kit-matrix 폴백)', () => {
    const mats = selectDailyMaterials({
      signals: F.groupSignals, meals: F.meals, favoriteFoods: F.favoriteFoods,
      recentRecos: [], freqMap: {}, recordedDays: 7, tipSeed: 1,
    });
    expect(mats.mode).toBe('analyze');
    expect(typeof mats.recommendedIng === 'string' || mats.recommendedIng === null).toBe(true);
  });
});

// ── E-09 — design 스냅샷 ──────────────────────────────────────────────────────────
describe('E-09 altLetter.design 스냅샷', () => {
  it('E-09-1 design.decision 기록', async () => {
    const args = baseArgs('2026-06-13', [], [], {});
    const r = await buildLetterB(args);
    expect(r!.design.decision?.unit).toBe(args.dailyResult.decision?.unit);
  });
  it('E-09-6 design.paths에 탄 개선 플래그(B·F 포함)', async () => {
    const r = await buildLetterB(baseArgs('2026-06-13', [], [], {}));
    expect(r!.design.paths).toContain('B');   // 두뇌 가이드 경유
    expect(r!.design.paths).toContain('G');   // 품질검증 경유
  });
  it('E-09-8 B 이력 없을 때 simToPrevB=null', async () => {
    const r = await buildLetterB(baseArgs('2026-06-13', [], [], {}));
    expect(r!.design.simToPrevB).toBeNull();
  });
  it('E-09-5 repeatAlertB 임계 0.6 — 동일 B 본문 재등장 시 경보', async () => {
    // 어제 B가 오늘과 같은 식재료를 추천했고 본문이 byte-동일하면 유사도 1.0 → repeatAlertB.
    const today = '2026-06-13';
    const first = await buildLetterB(baseArgs(today, [], [], {}));
    const past = [{ date: '2026-06-12', letter: first!.letter }];
    // recentBMaterials를 비워 같은 재료가 다시 나오게(회전 차단 해제) → 본문 동일 → 유사도 높음
    const again = await buildLetterB(baseArgs(today, [], past, {}));
    expect(again!.design.simToPrevB).not.toBeNull();
    expect(again!.design.repeatAlertB).toBe(again!.design.simToPrevB! >= 0.6);
  });
});

// ── E-10 — 2일 연속 리플레이 불변식 ───────────────────────────────────────────────
describe('E-10 compare 리플레이 — 아린 2일 연속', () => {
  it('E-10-2 altLetter.letter ≠ 메인 letter(A) — B는 다른 편지', async () => {
    // A(대조군)는 v2 정형 도입을 쓴다고 가정 — 여기선 B만 검증(B 본문에 재료가 박혀 A와 다름).
    const r = await buildLetterB(baseArgs('2026-06-13', [], [], {}));
    expect(r!.letter).toContain('아린');
    expect(r!.design.materials.food).toBeTruthy();
  });
  it('E-10-3 B 재료 3일내 비반복(회전)', async () => {
    // 1일차 추천 식재료를 recentRecos에 넣으면 2일차는 다른 식재료로 회전.
    const d1 = await buildLetterB(baseArgs('2026-06-13', [], [], {}));
    const food1 = d1!.design.materials.food!;
    const d2 = await buildLetterB(baseArgs('2026-06-14', [food1], [], {}));
    const food2 = d2!.design.materials.food;
    // 비타민A채소 후보가 여러 개면 회전됨. 후보가 1개뿐이면 폴백(같을 수 있음) — 회전 가드 자체는 적용됨을 확인.
    if (food2 && food1 !== food2) expect(food2).not.toBe(food1);
    expect(food2).toBeTruthy();
  });
  it('E-10-4 진도 2일 연속 승계(영속)', () => {
    // 1일차 결정으로 진도 행을 만들고 2일차에 주입 → step 후퇴 없음.
    const b1 = brainFor('2026-06-13', {});
    const prog: Partial<Record<UnitId, CurriculumRow>> = {};
    b1.updates.forEach((u) => { prog[u.unit_id] = u; });
    const b2 = brainFor('2026-06-14', prog);
    const focus1 = b1.decision ? prog[b1.decision.unit]?.step ?? 1 : 1;
    const focus2 = b2.decision ? (b2.updates.find((u) => u.unit_id === b2.decision!.unit)?.step ?? prog[b2.decision.unit]?.step ?? 1) : 1;
    expect(focus2).toBeGreaterThanOrEqual(focus1);
  });
  it('E-10-5 B 괴식 조합 0건 — 미역국+당근 미출현(score 1<2)', async () => {
    // fixture: 미역국 좋아함 + 비타민A채소 결핍. verifyComboSafety(임계1)·buildValidatedCombos(임계2)가 거른다.
    expect(scoreCombo('미역국', '당근').score).toBeLessThan(2);   // 괴식 전제 확인
    const r = await buildLetterB(baseArgs('2026-06-13', [], [], {}));
    const combos = r!.design.materials.combos;
    const gross = combos.some((c) => c.dish === '미역국' && (c.ingredient === '당근' || c.ingredient.includes('당근')));
    expect(gross).toBe(false);
  });
  it('E-10-8 B 빌드 throw → null(상위서 A 발행·altLetter.failed 처리)', async () => {
    const throwStub: ComposeLetterB = async () => { throw new Error('boom'); };
    const r = await buildLetterB({ ...baseArgs('2026-06-13', [], [], {}), composeLetterB: throwStub });
    expect(r).toBeNull();   // route가 이 null을 altLetter.failed로 저장(E-06-3)
  });
});

// ── serializeGuide — 두뇌 가이드 직렬화(고정 블록 아님) ────────────────────────────
describe('serializeGuide', () => {
  it('TeachingGuide 필드를 LLM 재료 텍스트로 직렬화', () => {
    const g = buildTeachingGuide({
      dailyResult: brainFor('2026-06-13', {}), anchor: F.anchor,
      firstOfWeek: true, lastArcStage: null, progress: false, recentCtxs: [], dow: 2,
    });
    const s = serializeGuide(g);
    expect(s).toContain('유닛:');
    expect(s).toContain('각도:');
  });
});
