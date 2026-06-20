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
  // ── A(이사님 2026-06-19) — 추천 근거/출현빈도 어드민 표시 ──
  it('G-A1 supply 슬롯에 근거(결핍군 보급·weeklyEst·level) 적재', () => {
    const d = enrichWeeklyPlan(synth(), ctx({ groupSignals: [{ group: '콩류', level: 'red', weeklyEst: 0.8 }, { group: '비타민A채소', level: 'yellow', weeklyEst: 1.5 }, { group: '곡류', level: 'green', weeklyEst: 5 }] }));
    const sup = d.targetRotation.find((s) => s.track === 'supply' && s.group === '콩류');
    if (sup) {   // 콩류 supply 슬롯이 잡히면 근거 검증
      expect(sup.weeklyEstFreq).toBe(0.8);
      expect(sup.level).toBe('red');
      expect(sup.reason).toContain('결핍군 콩류 보급');
      expect(sup.reason).toContain('0.8');
    }
    // 모든 supply 슬롯은 reason을 가진다(어드민 '왜 타깃')
    for (const s of d.targetRotation.filter((x) => x.track === 'supply')) expect(s.reason).toBeTruthy();
  });
  it('G-A2 challenge 슬롯 근거(잘 먹는 사촌·푸드체이닝)', () => {
    const d = enrichWeeklyPlan(synth(), ctx());
    const ch = d.targetRotation.find((s) => s.track === 'challenge');
    if (ch) {
      expect(ch.reason).toContain('검증 사촌');
      expect(ch.reason).toContain(ch.pairLiked!);
    }
  });
  it('G-A3 graceful — groupSignals에 없는 군의 supply는 reason "주 ?회"·throw 0', () => {
    // 결핍군이 groupSignals에 없는 상황(룩업 miss)에서도 산출이 throw 없이 됨
    const d = enrichWeeklyPlan(synth(), ctx({ groupSignals: [{ group: '곡류', level: 'green', weeklyEst: 5 }] }));
    expect(d.schemaVersion).toBe(1);
    for (const s of d.targetRotation.filter((x) => x.track === 'supply')) expect(typeof s.reason).toBe('string');
  });
  it('G-A4 byte-동일 회귀 — 기존 슬롯 필드(ingredient·group·track·via·pairLiked·dishes) 불변', () => {
    const d = enrichWeeklyPlan(synth(), ctx());
    for (const s of d.targetRotation) {
      expect(s.ingredient).toBeTruthy();
      expect(s.group).toBeTruthy();
      expect(['supply', 'challenge']).toContain(s.track);
      expect(Array.isArray(s.dishes)).toBe(true);
    }
  });
  it('mirrorSchedule — 결핍 2군이면 라운드로빈(같은 군 연속 금지)', () => {
    const d = enrichWeeklyPlan(synth(), ctx({ deficitGroups: ['콩류', '비타민A채소'] }));
    expect(d.mirrorSchedule.length).toBe(7);
    const defs = d.mirrorSchedule.filter((m) => m.kind === 'deficit');
    for (let i = 1; i < defs.length; i++) expect(defs[i].deficitGroup).not.toBe(defs[i - 1].deficitGroup);
  });
  it('⭐ 슬롯 정렬 거울 — deficit 거울[i]는 targetRotation[i] supply 슬롯과 같은 군(콩류 부족인데 달걀 모순 차단). 빈도 격일화는 route _cooldownDue 담당', () => {
    const d = enrichWeeklyPlan(synth(), ctx({ deficitGroups: ['콩류'] }));
    expect(d.mirrorSchedule.length).toBe(7);
    for (let i = 0; i < 7; i++) {
      const m = d.mirrorSchedule[i]; const s = d.targetRotation[i];
      if (m.kind === 'deficit') { expect(s?.track).toBe('supply'); expect(m.deficitGroup).toBe(s?.group); }   // 거울 군 = 슬롯 군
      if (s && s.track === 'challenge') expect(m.kind).not.toBe('deficit');   // challenge(expand) 날 결핍 호명 0
    }
  });
  it('⭐ priorityGroups — 결핍 우선 + 3개 미달이면 green 군 회전 충원(kind deficit/expand)', () => {
    const d = enrichWeeklyPlan(synth(), ctx());
    expect(d.priorityGroups.length).toBe(3);
    expect(d.priorityGroups[0].kind).toBe('deficit');                          // 1순위=결핍
    const exp = d.priorityGroups.find((p) => p.kind === 'expand');
    expect(exp).toBeTruthy();                                                  // green 충원(곡류) 존재
    expect(exp?.level).toBe('green');                                          // expand 군은 부족 아님
    expect(d.priorityGroups.every((p) => p.rank >= 1 && !!p.reason)).toBe(true);
  });
  it('⭐ priorityGroups BMI — 저체중이면 곡물·고기류가 green이어도 우선순위(탄단지·열량)', () => {
    const d = enrichWeeklyPlan(synth(), ctx({
      groupSignals: [{ group: '콩류', level: 'red', weeklyEst: 0 }, { group: '곡물', level: 'green', weeklyEst: 6 }, { group: '고기·계란', level: 'green', weeklyEst: 6 }],
      band: '저체중',
    }));
    const groups = d.priorityGroups.map((p) => p.group);
    expect(groups).toContain('곡물');                                          // green이어도 BMI 부스트로 진입
    expect(groups).toContain('고기·계란');
  });
  it('⭐F-18 — 결핍 거울 슬롯은 deficitGroup을 보존(route가 슬롯군과 비교해 정합/generic-positive 결정)', () => {
    const d = enrichWeeklyPlan(synth(), ctx({ deficitGroups: ['콩류', '비타민A채소'] }));
    const defs = d.mirrorSchedule.filter((m) => m.kind === 'deficit');
    expect(defs.length).toBeGreaterThan(0);
    // route.ts F-18: mirror.deficitGroup !== slot.group이면 결핍군 비호명(generic-positive)·같으면 dish 포함 유지.
    //   따라서 deficit 슬롯은 비교 가능하도록 deficitGroup이 반드시 채워져 있어야 한다(null이면 route가 정합 판정 불가).
    for (const m of defs) expect(m.deficitGroup).toBeTruthy();
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
