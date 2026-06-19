/**
 * 주간계획 모듈 골든 — enrichWeeklyPlan(오케스트레이션) + pickPlanSlot(유연성 가드).
 * 이사님 2026-06-18: 빈약한 카테고리 1개 타깃(콩류)이 일간 반복의 근원 → 주간계획이 다른 모듈을 종합해
 *   7일치 구체 dish 회전·2트랙·BMI/탄단지 macro·anti-stall·거울 쿨다운을 미리 굽고 일간이 slot 소비.
 */
import { describe, it, expect } from 'vitest';
import { enrichWeeklyPlan, pickPlanSlot, type EnrichContext, type WeeklySynthesis } from '../lib/coachWeekly';

const synth = (over: Partial<WeeklySynthesis> = {}): WeeklySynthesis => ({
  mission: null, mission_target: '콩류', target_pool: ['콩류', '비타민A채소'], secondary_axis: null,
  budget: { expose: 2, push: 1, cadenceMinGap: 1, pushWindow: [2, 3, 4], lever: 'food' },
  impression: null, source: 'weekly_llm', behaviorGoal: null, teachingArc: null, checkMethod: null,
  goals: [{ unit_id: 'table-stage', priority: 1, status: 'focus' }, { unit_id: 'exposure-savings', priority: 2, status: 'standby' }],
  ...over,
});
const ctx = (over: Partial<EnrichContext> = {}): EnrichContext => ({
  groupSignals: [{ group: '콩류', level: 'red', weeklyEst: 0 }, { group: '비타민A채소', level: 'red', weeklyEst: 0 }, { group: '곡류', level: 'green', weeklyEst: 5 }],
  likedIngredients: ['소고기', '감자', '미역', '계란'], freqMap: undefined,
  deficitGroups: ['콩류', '비타민A채소'], coveredGroups: ['곡류', '고기·계란'],
  band: '정상', heightTrack: null, weightTrack: null,
  goals: synth().goals, focusHistory: [], arcWeek: 2, attendsDaycare: true,
  ...over,
});

describe('enrichWeeklyPlan — 7일치 구체 계획 오케스트레이션', () => {
  it('targetRotation = 구체 식재료+dish(카테고리 아님)·슬롯마다 다른 식재료(콩류 도돌이표 차단)', () => {
    const d = enrichWeeklyPlan(synth(), ctx());
    expect(d.schemaVersion).toBe(1);
    expect(d.targetRotation.length).toBeGreaterThan(0);
    // 각 슬롯은 식품군이 아니라 '구체 식재료'(두부·당근 등) — 카테고리명('콩류')이 ingredient로 오면 안 됨
    for (const s of d.targetRotation) {
      expect(s.ingredient).toBeTruthy();
      expect(['콩류', '비타민A채소', '과일', '곡류']).not.toContain(s.ingredient);   // 카테고리 금지
      expect(s.group).toBeTruthy();
    }
    // 연속 동일 식재료 금지(회전 다양성)
    for (let i = 1; i < d.targetRotation.length; i++) expect(d.targetRotation[i].ingredient).not.toBe(d.targetRotation[i - 1].ingredient);
  });
  it('supply + challenge 2트랙 — challenge는 잘 먹는 음식의 사촌(콩류 결핍 밖 확장)', () => {
    const d = enrichWeeklyPlan(synth(), ctx());
    expect(['supply', 'challenge', 'mixed']).toContain(d.poolMode);
    expect(Array.isArray(d.supplyPool)).toBe(true);
    // challenge 슬롯이 있으면 pairLiked(어떤 잘먹는 음식의 사촌인지) 기록
    const ch = d.targetRotation.find((s) => s.track === 'challenge');
    if (ch) expect(ch.pairLiked).toBeTruthy();
  });
  it('mirrorSchedule — 결핍 2군이면 라운드로빈(같은 군 연속 금지)', () => {
    const d = enrichWeeklyPlan(synth(), ctx({ deficitGroups: ['콩류', '비타민A채소'] }));
    expect(d.mirrorSchedule.length).toBe(7);
    const defs = d.mirrorSchedule.filter((m) => m.kind === 'deficit');
    for (let i = 1; i < defs.length; i++) expect(defs[i].deficitGroup).not.toBe(defs[i - 1].deficitGroup);
  });
  it('⭐K-04b — 단일 결핍(콩류만)은 격일 쿨다운(매일 같은 콩류 클로징 앵무새 차단)', () => {
    const d = enrichWeeklyPlan(synth(), ctx({ deficitGroups: ['콩류'] }));
    const deficitSlots = d.mirrorSchedule.filter((m) => m.kind === 'deficit').length;
    expect(deficitSlots).toBeLessThanOrEqual(4);   // 7슬롯 중 격일 이하(매일 7회가 아님)
    expect(d.mirrorSchedule.some((m) => m.kind !== 'deficit')).toBe(true);   // 쿨다운 슬롯 존재
  });
});

describe('enrichWeeklyPlan — BMI/탄단지 macro 트랙(이사님)', () => {
  it('저체중 = macro active·고기류(고기·계란) 타깃 회전 주입', () => {
    const d = enrichWeeklyPlan(synth(), ctx({ band: '저체중' }));
    expect(d.macroTrack.active).toBe(true);
    expect(d.macroTrack.reason).toBe('lowWeight');
    expect(d.macroTrack.boostGroups).toContain('고기·계란');
    // 고기류가 타깃 회전에 들어왔는지(고기·계란군 슬롯 존재)
    expect(d.targetRotation.some((s) => s.group === '고기·계란')).toBe(true);
  });
  it('과체중 = snackRestraint·macro boost 없음', () => {
    const d = enrichWeeklyPlan(synth(), ctx({ band: '과체중' }));
    expect(d.macroTrack.active).toBe(true);
    expect(d.macroTrack.snackRestraint).toBe(true);
    expect(d.macroTrack.boostGroups.length).toBe(0);
  });
  it('성장더딤(track 경고) = macro active growthLag', () => {
    const lag = { metric: 'weight' as const, baselinePct: 50, currentPct: 20, zDrift: -1.4, expected: 15, actual: 13, gapMonths: 2, score: 40, status: '경고' as const };
    const d = enrichWeeklyPlan(synth(), ctx({ band: '정상', weightTrack: lag }));
    expect(d.macroTrack.active).toBe(true);
    expect(d.macroTrack.reason).toBe('growthLag');
  });
  it('정상 BMI·추종 양호 = macro 비활성(불필요한 잔소리 0)', () => {
    const d = enrichWeeklyPlan(synth(), ctx({ band: '정상' }));
    expect(d.macroTrack.active).toBe(false);
    expect(d.macroTrack.phrase).toBeNull();
  });
  it('macro 격주 cadence — arcWeek 짝수만 노출', () => {
    expect(enrichWeeklyPlan(synth(), ctx({ band: '저체중', arcWeek: 2 })).macroTrack.cadenceWeek).toBe(true);
    expect(enrichWeeklyPlan(synth(), ctx({ band: '저체중', arcWeek: 3 })).macroTrack.cadenceWeek).toBe(false);
  });
});

describe('pickPlanSlot — 일간 유연성 가드 소비', () => {
  it('slot=(daySeed+cidHash)%n 결정론 + 자녀/날짜별 분산', () => {
    const d = enrichWeeklyPlan(synth(), ctx());
    const a = pickPlanSlot(d, { daySeed: 100, cidHash: 7, deficitNow: new Set(['콩류', '비타민A채소']) });
    const b = pickPlanSlot(d, { daySeed: 100, cidHash: 7, deficitNow: new Set(['콩류', '비타민A채소']) });
    expect(a?.slotIndex).toBe(b?.slotIndex);   // 결정론
  });
  it('⭐유연성 가드 — supply 슬롯의 group이 더는 결핍 아니면(아이가 받아들임) 다음 유효 슬롯으로', () => {
    const d = enrichWeeklyPlan(synth(), ctx());
    // 콩류가 채워졌다고 가정(deficitNow에서 콩류 제외) → supply 콩류 슬롯은 스킵돼야
    const pick = pickPlanSlot(d, { daySeed: 0, cidHash: 0, deficitNow: new Set(['비타민A채소']) });
    if (pick && pick.slot.track === 'supply') expect(pick.slot.group).not.toBe('콩류');   // 콩류 supply는 스킵
  });
  it('degrade — plan_detail null이면 null(현행 폴백)', () => {
    expect(pickPlanSlot(null, { daySeed: 1, cidHash: 1, deficitNow: new Set() })).toBeNull();
    expect(pickPlanSlot(undefined, { daySeed: 1, cidHash: 1, deficitNow: new Set() })).toBeNull();
  });
});
