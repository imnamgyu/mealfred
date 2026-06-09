/**
 * lib/coachWeekly.ts — 주간 코칭 닻(작전층). coaching-weekly-plan.html §2·§13·§14.
 *
 *  일요일: runWeeklyPlanning(Sonnet) → 다가올 주 닻(mission·target·budget·의사 소견 impression).
 *          결핍 후보가 없거나 LLM 실패 → coldSynth(결정론·비LLM)로 degrade(닻은 생기되 안전).
 *  월~토 : planFromWeekly — 닻의 mission_target을 '잠그고'(휙휙 차단) 무브만 회전 +
 *          채근 캡(주1회·ledger.pushUsed) + 행동지연(firstServe 전엔 push 금지·§13).
 *
 *  ⭐ 안전 제1원칙: 이 모듈은 throw하지 않는다(synthesis는 try/catch로 cold 폴백, planFromWeekly는 null 반환).
 *     닻이 없거나 실패하면 호출자(cron)가 현행 planFor로 폴백 → daily 엔진은 닻 유무와 무관하게 항상 동작.
 *
 *  모델: 주간 종합=Sonnet 4.6(자녀당 주 1회 → 비싼 모델 OK). 일간=Haiku(coach.ts).
 */
import { callClaude, buildCoachPlan, planSignature, MOVE_KEYS, MOVE_MENU, SNACK_CHANNEL, type CoachPlan } from './coach';
import { SCENARIOS, type CoachScenario, type CoachSignals } from './coachScenarios';

const WEEKLY_MODEL = process.env.COACH_WEEKLY_MODEL || 'claude-sonnet-4-6';

// ── 날짜 헬퍼(KST 'YYYY-MM-DD') ───────────────────────────────────────────────
/** 요일 0=일 … 6=토. 1970-01-01=목(4) 기준. */
export function kstDow(today: string): number {
  const days = Math.floor(Date.parse(today + 'T00:00:00Z') / 86400000);
  return (((days + 4) % 7) + 7) % 7;
}
export function addDaysStr(today: string, n: number): string {
  return new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

// ── 닻 타입 ───────────────────────────────────────────────────────────────────
export type WeeklyBudget = { expose: number; push: number; cadenceMinGap: number; pushWindow: number[] };
export type WeeklyLedger = { pushUsed: boolean; exposeCount: Record<string, number>; lastExposeDow: number | null; arcWeek: number; reanchorUsed: boolean; adviceGivenAt: string | null; firstServeDow: number | null; progressWeek: number };
export type WeeklyAnchor = {
  child_id: string; week_key: string; status: string; source: string;
  mission: string | null; mission_target: string | null; target_pool: string[] | null; secondary_axis: string | null;
  budget: WeeklyBudget | null; ledger: WeeklyLedger | null; impression: string | null; arc_week: number | null;
  basis_hash: string | null; basis_attends_daycare: boolean | null;
};
export const DEFAULT_BUDGET: WeeklyBudget = { expose: 2, push: 1, cadenceMinGap: 1, pushWindow: [2, 3, 4] };  // 노출 2·채근 1·간격 1일·push 윈도우 화수목(dow 2,3,4)
export const DEFAULT_LEDGER: WeeklyLedger = { pushUsed: false, exposeCount: {}, lastExposeDow: null, arcWeek: 1, reanchorUsed: false, adviceGivenAt: null, firstServeDow: null, progressWeek: 1 };

// ── 일요일 종합 (Sonnet 의사식 회진) ──────────────────────────────────────────
const SYSTEM_WEEKLY = `당신은 영유아 편식을 돕는 임상 코치입니다. 한 아이의 지난 한 주(최대 4주) 데이터를 의사처럼 종합해, 다음 한 주의 '방향'을 잡습니다.

[원칙]
- 식단(무엇을 먹었나/거부)만 보지 말고 구조화 입력(식감·자율성·식사환경·식사시간)·전환·만성질환까지 종합한다.
- 35개 국제 편식 이론으로 '이 아이의 지금 패턴에 어느 방법론이 맞나'를 진단한다: 신공포→SOS 감각 사다리, 자율성 다툼→Satter 식사 분담, 정체→푸드 체이닝, 환경 문제→무압력 식사 구조화, 반복 노출 부족→격일 재노출.
- '한 번에 하나' — 이번 주 초점 타깃은 1개. 보조는 식품이 아니라 환경/자율성 축이어야 한다(식품 2개 동시 금지).
- 채근(직접 밀기)은 주 1회까지. 강한 결핍이고 거부가 잦으면 push=1, 약하거나 ARFID 의심(적신호)·휴면이면 push=0.
- 진단·처방 단어 금지(코치는 의사 아님). 소견은 따뜻하고 담담하게.

[반드시]
- mission_target은 반드시 아래 '결핍/거부 후보 목록' 안에서만 고른다(목록 밖 금지). 없는 결핍 지어내기 금지.
- impression(의사 소견)은 부모에게 보이지 않는 내부 메모다 — 솔직하게: 지난주 무엇이 늘고/막혔고, 이번 주 왜 이 타깃·이 접근인지 2~3문장.
- mission은 부모 편지에 자연스럽게 녹일 '한 줄'(권유형, 명령·과제 금지). '미션'이라는 단어는 쓰지 마라.

JSON만: {"mission_target":"콩류","secondary_axis":"식사환경"|null,"expose":2,"push":1,"mission":"이번 주는 ...","impression":"지난주 ... 이번 주는 ..."}`;

export type WeeklyInput = {
  childName?: string; ageBand?: string;
  reds: string[]; missing: string[]; homeMissing: string[];
  refused: string[]; favoriteFoods: string[]; transitions: string[];
  structuredSummary?: string;        // 구조화 분포 요약(식감·자율성·환경·식사시간)
  chronicGuidance?: string;
  lastMission?: string | null; lastImpression?: string | null; lastTarget?: string | null; icfqRiskCount?: number;
};
export type WeeklySynthesis = { mission: string | null; mission_target: string | null; target_pool: string[]; secondary_axis: string | null; budget: WeeklyBudget; impression: string | null; source: string };

/** 결핍/거부 후보(타깃 화이트리스트 — 환각 차단). 집부족 > 전체부족 > 거부 순. */
function candidateTargets(i: WeeklyInput): string[] {
  return [...new Set([...(i.homeMissing || []), ...(i.missing || []), ...(i.refused || [])])].filter(Boolean);
}

function buildWeeklyUser(i: WeeklyInput, cands: string[]): string {
  return `[아이] ${(i.childName || '아이').slice(0, 20)} (${i.ageBand || '유아'})
[지난 4주 분석값]
부족 영양소: ${i.reds.join(', ') || '없음'}
집 부족 식품군: ${i.homeMissing.join(', ') || '없음'} · 전체 부족 식품군: ${i.missing.join(', ') || '없음'}
거부 음식: ${i.refused.join(', ') || '없음'}
잘 먹는 음식: ${i.favoriteFoods.slice(0, 8).join(', ') || '파악 중'}
거부→수용 전환: ${i.transitions.join(' / ') || '없음'}
구조화 입력(식감·자율성·환경·식사시간): ${i.structuredSummary || '기록 적음'}
${i.chronicGuidance ? `만성질환 방향: ${i.chronicGuidance}\n` : ''}${i.lastTarget ? `지난주 초점: ${i.lastTarget}${i.lastImpression ? ` — 소견: ${i.lastImpression}` : ''}\n` : ''}${(i.icfqRiskCount || 0) >= 2 ? '⚠️ 최근 식사 적신호 누적(ARFID 가능) — push=0, 무압력 우선.\n' : ''}
[mission_target 후보(이 안에서만 고르기)] ${cands.join(', ')}

위 데이터를 의사처럼 종합해 다음 한 주의 초점 타깃 1개·예산·소견을 JSON으로.`;
}

/** 일요일 종합(Sonnet). 후보 없음/LLM 실패 → coldSynth(비LLM). */
export async function runWeeklyPlanning(i: WeeklyInput): Promise<WeeklySynthesis> {
  const cands = candidateTargets(i);
  if (!cands.length) return coldSynth(i, 'cold_synth');           // 결핍 후보 없음 = 관찰 닻(LLM 미호출)
  try {
    const out = await callClaude(buildWeeklyUser(i, cands), 900, SYSTEM_WEEKLY, WEEKLY_MODEL);
    const target = typeof out.mission_target === 'string' && cands.includes(out.mission_target) ? out.mission_target : cands[0];   // 화이트리스트 강제
    const pool = [target, ...cands.filter((c) => c !== target)].slice(0, 4);
    const expose = Math.min(3, Math.max(2, Number(out.expose) || 2));
    const arfid = (i.icfqRiskCount || 0) >= 2;
    const push = (arfid || out.push === 0 || out.push === false) ? 0 : 1;   // ARFID 의심이면 채근 0회 선잠금(§13)
    return {
      mission: typeof out.mission === 'string' ? out.mission.slice(0, 300) : null,
      mission_target: target, target_pool: pool,
      secondary_axis: typeof out.secondary_axis === 'string' ? out.secondary_axis : null,
      budget: { ...DEFAULT_BUDGET, expose, push },
      impression: typeof out.impression === 'string' ? out.impression.slice(0, 600) : null,
      source: 'weekly_llm',
    };
  } catch {
    return coldSynth(i, 'cold_synth');   // LLM 실패 → 결정론 폴백(닻은 생기되 비LLM)
  }
}

function coldSynth(i: WeeklyInput, source: string): WeeklySynthesis {
  const cands = candidateTargets(i);
  const arfid = (i.icfqRiskCount || 0) >= 2;
  return {
    mission: null, mission_target: cands[0] || null, target_pool: cands.slice(0, 4), secondary_axis: null,
    budget: { ...DEFAULT_BUDGET, push: (cands.length && !arfid) ? 1 : 0 }, impression: null, source,
  };
}

// ── 월~토 닻 실행 ─────────────────────────────────────────────────────────────
const PUSH_MOVES = new Set(['mix', 'beside']);   // '직접 밀기'(채근) 무브 — 주1회 캡 대상
const moveTextOf = (key: string): string | null => { const i = MOVE_KEYS.indexOf(key); return i >= 0 ? MOVE_MENU[i] : null; };

/**
 * 닻(weekly_plans) 안에서 오늘의 계획 산출. planFor와 동일 형태({scenario,plan,varyOpener}) + ledger 패치·push 적용 여부.
 * 반환 null = 닻을 못 쓰는 경우(호출자가 planFor 폴백).
 */
export function planFromWeekly(p: {
  anchor: WeeklyAnchor; signals: CoachSignals; recentPlans: CoachPlan[];
  targetExposeWtd: number;   // 이번 주 누적 노출(실제 차림) 횟수 — 행동지연 게이트
  daySeed: number; cidHash: number; dow: number;
}): { scenario: CoachScenario; plan: CoachPlan; varyOpener: boolean; ledgerPatch: Partial<WeeklyLedger>; pushApplied: boolean } | null {
  const { anchor, signals, recentPlans, daySeed, cidHash, dow } = p;
  const sc = (id: string) => SCENARIOS.find((s) => s.id === id)!;

  // 1) 안전 인터럽트 — 전환 축하/적신호/기록공백은 닻보다 우선(그날만, 채근 안 함)
  const fired = SCENARIOS.filter((s) => { try { return s.trigger(signals); } catch { return false; } }).sort((a, b) => b.priority - a.priority);
  const interrupt = fired.find((s) => s.id === 'progress-celebrate' || s.id === 'neophobia-arfid-watch' || s.id === 'low-data-gap');
  if (interrupt) {
    const bp = buildCoachPlan({ frame: interrupt.id, targetPool: [], recentPlans, daySeed, cidHash });
    return { scenario: interrupt, plan: bp, varyOpener: recentPlans[0]?.frame === interrupt.id, ledgerPatch: {}, pushApplied: false };
  }

  // 2) 타깃 잠금 — 닻의 mission_target(여전히 결핍이면) → pool 내 다음 → 없으면 정체기(쉬어가기)
  const deficit = new Set([...signals.reds, ...signals.missing, ...signals.homeMissing, ...signals.homeReds, ...signals.refused, ...signals.homeRefused, ...signals.daycareRefused]);
  const pool = [...new Set(([anchor.mission_target, ...(anchor.target_pool || [])].filter(Boolean) as string[]))].filter((t) => deficit.has(t));
  if (!pool.length) {
    const bp = buildCoachPlan({ frame: 'plateau', targetPool: [], recentPlans, daySeed, cidHash });
    return { scenario: sc('plateau'), plan: bp, varyOpener: recentPlans[0]?.frame === 'plateau', ledgerPatch: {}, pushApplied: false };
  }
  const target = pool[0];   // 닻 우선(mission_target이 pool[0])
  const isRefused = signals.refused.includes(target) || signals.homeRefused.includes(target) || signals.daycareRefused.includes(target);
  const frame = SNACK_CHANNEL.has(target) ? 'nutrient-gap'
    : isRefused ? 'new-refusal'
    : (signals.attendsDaycare && signals.missing.length === 0) ? 'home-daycare-gap' : 'nutrient-gap';
  let bp: CoachPlan = buildCoachPlan({ frame, targetPool: [target], recentPlans, daySeed, cidHash });

  // 3) 채근 캡 + 행동지연 — push 무브(mix/beside)는 '적기'(예산 남음 && 윈도우 && 이번 주 1회+ 차림)에만
  const budget = anchor.budget || DEFAULT_BUDGET;
  const ledger = anchor.ledger || DEFAULT_LEDGER;
  const pushAllowed = (budget.push || 0) > 0 && !ledger.pushUsed && (budget.pushWindow || []).includes(dow) && p.targetExposeWtd >= 1;
  let pushApplied = false;
  if (bp.moveKey && PUSH_MOVES.has(bp.moveKey)) {
    if (pushAllowed) pushApplied = true;
    else {
      // 강등: 비push 무브로 교체(타깃 유지=반복 노출 지속, 들이밀기만 제거). 최근 시그니처 안 겹치는 첫 것.
      const cands = MOVE_KEYS.filter((k) => !PUSH_MOVES.has(k));
      const alt = cands.find((k) => !recentPlans.some((rp) => rp.signature === planSignature(frame, target, k))) || cands[(daySeed % cands.length + cands.length) % cands.length];
      bp = { frame, target, moveKey: alt, move: moveTextOf(alt), signature: planSignature(frame, target, alt) };
    }
  }
  const ledgerPatch: Partial<WeeklyLedger> = { lastExposeDow: dow };
  if (pushApplied) ledgerPatch.pushUsed = true;
  return { scenario: sc(frame), plan: bp, varyOpener: recentPlans[0]?.frame === frame, ledgerPatch, pushApplied };
}
