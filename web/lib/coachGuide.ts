/**
 * lib/coachGuide.ts — v3 두뇌 가이드 합성 (WBS v2-하이브리드 EPIC B)
 *
 * 사상: v3의 '두뇌'(진단·계획·커리큘럼)를 LLM용 '가이드 브리프'로 합성한다.
 *   결정·진단=결정론(이 함수가 unit_ko·lever·stepBehavior·arcStage·why·재서술 금지목록을 못 박는다).
 *   문장·도입·톤=LLM(작문가 몫). ⚠️ 고정 블록/byte 거울 금지 — guide는 LLM에 주는 *가이드*이지 출력 문장이 아니다.
 *   why는 수치·사실 조각이고, LLM이 그대로 베끼지 않고 '재료'로 쓴다(정형 문장 강요 금지).
 *
 * buildTeachingGuide(p)가 단일 진입점 — decideDailyV3 결과 + 주간 닻을 받아 TeachingGuide를 반환.
 *   출력은 coachRecos/coachMaterials 재료와 합쳐 Letter B 입력(LetterInput)이 된다(조립=EPIC 외부 C/H).
 *
 * ⭐ EPIC B · Letter B 전용 — A(planFor+composeLetter)는 이 모듈을 import하지 않는다(대조군 보존).
 *   이 파일은 coach.ts(Letter A 경로)를 import하지 않는다(A 경로 비오염 보장).
 *   전부 순수 함수(fs/HTTP·시계·LLM 미호출 — today/dow 등은 인자). LLM 클라이언트 미import.
 *
 * 원자: B-01 타입·계약 · B-02 unit/step/lever 매핑 · B-03 mode→arcStage · B-04 why 수치근거 ·
 *       B-05 weeklyImpressionSoft · B-06 doNotRestate · B-07 온보딩/무기록 분기 · B-08 통합 ·
 *       B-09 진도 영속 계약 · B-10 0회 식재료 누설 가드.
 */
import { UNITS, TH, type UnitDef, type Goal, type ProgressRow } from './curriculumUnits';
import { type DailyDecision } from './curriculum';
import { type WeeklyAnchor, type WeeklyArcStage } from './coachWeekly';
import { type DailyV3Result, recentIntroUnitsOf } from './coachDaily';

// ── B-01 — TeachingGuide 계약 ────────────────────────────────────────────────────
/**
 * v3 두뇌를 LLM 재료로 전달하는 단일 계약. 모든 필드는 '코드가 못 박는 사실/가이드'이며,
 * 완성 문장 작문(도입·톤·전개)은 LLM 몫이다. 어떤 필드도 그대로 편지에 붙는 byte 슬롯이 아니다.
 *  - unit_ko   = UNITS[unit].label (오늘 가르치는 유닛의 한국어 이름)
 *  - lever     = UNITS[unit].lever (food|environment|autonomy|texture|mixed — 코칭 축)
 *  - stepBehavior = 현재 step의 behavior 문구(LLM이 풀어 쓸 '행동 사실' — 온보딩/관찰이면 '')
 *  - why       = '왜 이 코칭인가'의 수치·사실 조각(모호 기간어 없음 · ≤120자 · LLM이 재료로 인용)
 *  - arcStage  = 편지를 쓸 각도(intro/how/obstacle/observe/reinforce — mode·요일·진척으로 결정)
 *  - weeklyImpressionSoft = 주간 닻 소견의 부모용 부드러운 배경 한 구절(내부어/진단어 제거·직접 인용 금지) 또는 null
 *  - doNotRestate = '이건 다시 말하지 마라' 목록(재도입·거울 사실 재인용 금지 — D-04 사실 재서술 원장)
 *  - stepN     = 현재 단계 번호(1-base · 클램프됨)
 *  - mode      = decideDailyV3의 일간 전개 모드(advance/deepen/pivot/maintain/celebrate/observe)
 */
export type TeachingGuide = {
  unit_ko: string;
  lever: UnitDef['lever'];
  stepBehavior: string;
  why: string;
  arcStage: WeeklyArcStage;
  weeklyImpressionSoft: string | null;
  doNotRestate: string[];
  stepN: number;
  mode: DailyDecision['mode'];
};

// ── B-09 — 진도 영속 정책 박제(설계 상수) ─────────────────────────────────────────
/**
 * A/B 구조에서 '진도를 누가 굴리나'를 못 박는 정책 상수. buildTeachingGuide는 진도를 변경하지 않는
 * 읽기 전용·순수 함수이고, 진도 영속(curriculum_progress upsert · 닻 goals 저장)은 크론(EPIC H)이
 * decideDailyV3의 updates·goalsAfter로 수행한다 — 그 형태만 여기 nextProgressState가 계산한다.
 */
export const GUIDE_PERSISTENCE_NOTE =
  'Letter B만 decideDailyV3.updates를 curriculum_progress에, goalsAfter를 weekly_plans.goals(닻)에 upsert한다(SQL 실행=크론 H). ' +
  'A(planFor+composeLetter)는 진도 비참여(대조군 — v2 경로만, 진도 무관). ' +
  '피벗 시 goalsAfter의 focus 플립을 닻에 저장해야 다음날 피벗이 되돌려지지 않는다(B-26 리플레이 교훈).';

// ── B-02 — decision → unit_ko·lever·stepBehavior·stepN 매핑 ──────────────────────
/** decision.step을 def.steps의 유효 범위[1, len]로 클램프(curriculum.evolveRow가 step 0~len을 다룸 — 방어). */
function clampStep(step: number | undefined | null, len: number): number {
  const s = Math.floor(Number(step) || 0);
  return Math.max(1, Math.min(s, Math.max(1, len)));
}

// ── B-04 — why(코칭 근거) 수치 근거 생성 ──────────────────────────────────────────
// 유닛·단계별 '판정 신호 키 + 임계'를 TH에서만 읽어 사실 조각을 만든다(매직넘버 금지·환각 0).
//   numeric(e) = evidence에서 신호값을 읽어 사실 조각 문자열 또는 null(표본 부족 degrade) 반환.
type WhyFact = (e: Evidence) => string | null;
type Evidence = ProgressRow['evidence'];
const num = (e: Evidence, k: string): number | null => (typeof e?.[k] === 'number' ? (e[k] as number) : null);
const pct = (v: number): number => Math.round(v * 100);

/** 유닛·단계 → 사실 조각 생성기(TH 임계 기반). 표본 없으면 null(가짜 수치 금지). */
const WHY_FACTS: Partial<Record<string, Record<number, WhyFact>>> = {
  'table-stage': {
    1: (e) => { const v = num(e, 'envTablePct7d'); return v == null ? null : `식탁 식사 ${pct(v)}%(1차 목표 ${pct(TH.envTableStep1)}%)`; },
    2: (e) => { const v = num(e, 'envTablePct7d'); return v == null ? null : `식탁 식사 ${pct(v)}%(목표 ${pct(TH.envTableStep2)}%)`; },
  },
  'exposure-savings': {
    1: (e) => { const v = num(e, 'targetExposeDays7d'); return v == null ? null : `이번 주 노출 ${v}일(주 ${TH.exposeWeekly}회 목표)`; },
    2: (e) => { const v = Array.isArray(e?.hitDays) ? (e!.hitDays as string[]).length : null; return v == null ? null : `누적 노출 ${v}회(목표 ${TH.exposeTotalForStep2}회)`; },
  },
  'hunger-rhythm': {
    1: (e) => { const v = num(e, 'preMealMemoDays'); return v == null ? null : `끼니 직전 간식 ${v}일`; },
    2: (e) => { const v = num(e, 'snackHeavyDays'); return v == null ? null : `간식 과다 ${v}일(상한 주 ${TH.snackHeavyCap}일)`; },
  },
  'fullness-respect': {
    1: (e) => { const v = num(e, 'forceMemoDays'); return v == null ? null : `완식 권유 ${v}일`; },
    2: (e) => { const v = num(e, 'over30Pct'); return v == null ? null : `30분 초과 ${pct(v)}%(상한 ${pct(TH.mealOver30Cap)}%)`; },
  },
  'parent-model': {
    1: (e) => { const v = num(e, 'familyDinnerDays'); return v == null ? null : `가족 저녁 ${v}일(목표 주 ${TH.familyDinnerStep1}일)`; },
    2: (e) => { const v = num(e, 'familyDinnerDays'); return v == null ? null : `가족 저녁 ${v}일(목표 주 ${TH.familyDinnerStep2}일)`; },
  },
  'no-bargain': {
    1: (e) => { const v = num(e, 'bargainMemoDays'); return v == null ? null : `거래 멘트 ${v}일`; },
    2: (e) => { const v = num(e, 'bargainMemoDays'); return v == null ? null : `거래 멘트 ${v}일(목표 0일)`; },
  },
  'table-talk': {
    1: (e) => { const v = num(e, 'banWordDays'); return v == null ? null : `금지어 ${v}일`; },
    2: (e) => { const v = num(e, 'objectTalkPct'); return v == null ? null : `객체 중심 대화 ${pct(v)}%(목표 70%)`; },
  },
  'sensory-texture': {
    1: (e) => { const v = num(e, 'texModeIdx'); return v == null ? null : `질감 단계 ${v}/3(핑거푸드 목표 2)`; },
    2: (e) => { const v = num(e, 'texModeIdx'); return v == null ? null : `질감 단계 ${v}/3(일반식 목표 3)`; },
  },
  'food-bridge': {
    1: (e) => { const v = num(e, 'newFoodCount7d'); return v == null ? null : `새 음식 ${v}종(주 ${TH.newFoodWeekly}종 목표)`; },
    2: (e) => { const v = num(e, 'newFoodCount7d'); return v == null ? null : `새 음식 ${v}종(주 ${TH.newFoodWeekly}종 목표)`; },
  },
  'autonomy-part': {
    1: (e) => { const v = num(e, 'selfPct7d'); return v == null ? null : `스스로 먹기 ${pct(v)}%(1차 목표 ${pct(TH.selfPctStep1)}%)`; },
    2: (e) => { const v = num(e, 'selfPct7d'); return v == null ? null : `스스로 먹기 ${pct(v)}%(목표 ${pct(TH.selfPctStep2)}%)`; },
  },
  'link-rhythm': {
    1: (e) => { const v = num(e, 'dcRefuseHomeRetry7d'); return v == null ? null : `기관 거부→집 재노출 ${v}회(주 1회 목표)`; },
    2: (e) => { const v = num(e, 'dcRefuseHomeRetry7d'); return v == null ? null : `기관 거부→집 재노출 ${v}회(주 2회 목표)`; },
  },
  'pressure-off': {
    1: (e) => { const v = num(e, 'pressureMemoDays'); return v == null ? null : `압박 멘트 ${v}일(목표 0일)`; },
    2: (e) => { const v = num(e, 'negTagPct7d'); return v == null ? null : `압박 분위기 ${pct(v)}%(상한 ${pct(TH.negTagCap)}%)`; },
  },
};

// mode별 why 각도 — '왜 지금 이 모드인가'를 행동 권유 없이 사실로(maintain은 행동 어휘 금지).
const MODE_ANGLE: Record<DailyDecision['mode'], string> = {
  advance: '단을 올릴 신호 충족',
  deepen: '신호는 있으나 사다리 정체 — 이어가기',
  maintain: '정체 — 행동보다 태도 인정',
  pivot: '이 축이 안 먹혀 목표 전환',
  celebrate: '유지 주 통과',
  observe: '판단할 표본 부족 — 관찰 중',
};

/**
 * why = mode 각도 + 유닛·단계 수치 사실(있으면). evidence 없으면 '표본 부족 — 관찰' degrade(가짜 수치 0).
 * 수치는 넣되 정형 문장 금지 — LLM이 재료로 쓴다. 모호 기간어('요즘·최근') 미사용.
 */
function whyFor(p: { unit: string; stepN: number; mode: DailyDecision['mode']; evidence: Evidence }): string {
  const angle = MODE_ANGLE[p.mode] || MODE_ANGLE.observe;
  const factGen = WHY_FACTS[p.unit]?.[p.stepN] ?? WHY_FACTS[p.unit]?.[1];
  const fact = factGen ? factGen(p.evidence || {}) : null;
  const body = fact ? `${angle}(${fact})` : (p.mode === 'observe' ? '아직 판단할 표본이 부족 — 관찰 주' : `${angle} — 아직 표본 부족`);
  return body.slice(0, 120);
}

// ── B-05 — weeklyImpressionSoft: 닻 소견의 부모비노출 가공 ────────────────────────
// 내부 개념·진단어를 포함한 문장은 통째 드롭(부모 비노출 — SYSTEM_WEEKLY/SYSTEM_RECAP 규칙과 동일 철학).
const INTERNAL_WORD_RE = /미션|과제|진도|단계|점수|등급|체중|ARFID|신공포|회피|제한성|섭식장애|진단|처방/;
/**
 * anchor.impression(내부 소견)을 '배경 참고(직접 인용 금지)' 한 구절로 정제. 금칙어 든 문장은 드롭.
 * null/공백이면 null. 길이 상한 200자. 결과가 비면 null.
 */
export function softenImpression(impression: string | null | undefined): string | null {
  if (!impression || typeof impression !== 'string' || !impression.trim()) return null;
  const sentences = impression.split(/(?<=[.。!?])\s*|\n+/).map((s) => s.trim()).filter(Boolean);
  const kept = sentences.filter((s) => !INTERNAL_WORD_RE.test(s));
  if (!kept.length) return null;
  const joined = kept.join(' ').trim();
  return joined ? joined.slice(0, 200) : null;
}

// ── B-03 — mode → arcStage 결정론 매핑 ────────────────────────────────────────────
const ROT: WeeklyArcStage[] = ['how', 'obstacle', 'observe'];   // planFromWeekly(coachWeekly.ts:297)와 동일 회전축
/**
 * 일간 mode + 주첫·직전아크·진척·요일로 편지 각도(arcStage)를 결정. planFromWeekly의 아크 규약 재사용:
 *   reinforce 이틀 연속 금지 · intro는 주 첫 편지에만(주중 intro 금지) · 폴백은 dow 회전.
 * 우선순위: ① celebrate→reinforce ② 주첫&(advance|pivot)→intro ③ maintain→observe
 *           ④ progress&직전≠reinforce→reinforce ⑤ 폴백=ROT 요일 회전.
 */
export function arcStageFor(p: {
  mode: DailyDecision['mode']; firstOfWeek: boolean; lastArcStage?: string | null; progress: boolean; dow: number;
}): WeeklyArcStage {
  if (p.mode === 'celebrate') return 'reinforce';                                   // ① 졸업 축하 = 실행 인정 톤
  if (p.firstOfWeek && (p.mode === 'advance' || p.mode === 'pivot')) return 'intro'; // ② 새 유닛/단 도입(introNeededV3 정합)
  if (p.mode === 'maintain') return 'observe';                                       // ③ 정체 위안 — 행동 권유 0
  if (p.progress && p.lastArcStage !== 'reinforce') return 'reinforce';              // ④ 실행 관측(2연속 금지)
  return ROT[(((p.dow + 6) % 7) % ROT.length + ROT.length) % ROT.length];           // ⑤ 요일 회전 폴백
}

// ── B-06 — doNotRestate: 사실 재서술 금지 목록(D-04 원장) ─────────────────────────
type RecentCtx = Record<string, unknown> | null | undefined;
const mirrorTextOf = (c: RecentCtx): string => {
  if (!c || typeof c !== 'object') return '';
  const m = (c as { mirror?: unknown }).mirror;
  return typeof m === 'string' ? m : '';
};
/**
 * 최근 편지 컨텍스트에서 '이미 말한 것'을 모아 LLM '재서술 금지' 목록으로. coachDaily.recentIntroUnitsOf
 * 재사용(중복 구현 금지 — 'X.intro.N' 파싱 일관). focusUnitKo가 이미 intro됐으면 '재도입 금지' 추가.
 * 거울 사실(mirror) 인용이 있으면 '재인용 금지' 추가. 빈/오염 입력이면 [].
 */
export function doNotRestateFrom(ctxs: RecentCtx[], focusUnit: string | null, focusUnitKo: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => { if (s && !seen.has(s)) { seen.add(s); out.push(s); } };
  const introUnits = recentIntroUnitsOf(ctxs || []);             // {유닛 id} — 'common' 제외
  if (focusUnit && introUnits.has(focusUnit)) {
    push(`이미 도입한 코칭(${focusUnitKo || focusUnit})을 다시 '소개'하지 마세요(전개·강화만)`);
  }
  for (const c of ctxs || []) {
    const mirror = mirrorTextOf(c);
    if (mirror) push(`직전 편지가 인용한 사실("${mirror.slice(0, 30)}")을 그대로 다시 인용하지 마세요`);
  }
  return out;
}

// ── B-10 — 0회 식재료 가이드 누설 가드(데이터 정합 I · C 경계) ─────────────────────
export type ZeroFreqViolation = { ing: string; field: 'why' | 'stepBehavior' };
/**
 * 가이드 why/stepBehavior에 freqMap[식재료]===0인(급식 0회) 식재료명이 새어 들어갔는지 탐지.
 * B는 식재료를 새로 만들지 않으므로(C 재료에만 의존) 정상 경로엔 위반 0 — 회귀 가드.
 * freqMap 비면(빈도 정보 없음) 검사 스킵(throw 없음). 0회 식재료만 검사(미상은 무시).
 */
export function assertNoZeroFreqStaple(
  guide: Pick<TeachingGuide, 'why' | 'stepBehavior'>,
  freqMap: Record<string, number> | null | undefined,
): ZeroFreqViolation[] {
  const out: ZeroFreqViolation[] = [];
  if (!freqMap || typeof freqMap !== 'object') return out;
  const zeros = Object.keys(freqMap).filter((k) => freqMap[k] === 0);
  for (const ing of zeros) {
    if (guide.why?.includes(ing)) out.push({ ing, field: 'why' });
    if (guide.stepBehavior?.includes(ing)) out.push({ ing, field: 'stepBehavior' });
  }
  return out;
}

// ── B-07 — 온보딩·무기록 분기 ─────────────────────────────────────────────────────
/** lowData/decision=null이면 분석형(수치 why) 대신 관찰 가이드(가짜 결핍 0·진도 보존). */
function onboardingGuide(p: { decision: DailyDecision | null; unitDef: UnitDef | null }): TeachingGuide {
  const def = p.unitDef;
  return {
    unit_ko: def?.label || '관찰',
    lever: def?.lever || 'mixed',
    stepBehavior: '',                                              // 행동 권유 없음(관찰)
    why: '아직 기록이 적어 패턴 단정 대신 관찰 중',                    // 수치/% 0건(가짜 결핍 금지)
    arcStage: 'observe',
    weeklyImpressionSoft: null,
    doNotRestate: ['아직 없는 식품군 결핍·패턴 단정 금지(환각)'],
    stepN: Math.max(1, p.decision?.step || 1),                     // 복귀 후 이어가기(리셋 아님)
    mode: p.decision?.mode || 'observe',
  };
}

// ── B-08 — buildTeachingGuide 통합 진입점 ────────────────────────────────────────
/**
 * v3 두뇌(일간 진단 + 주간 닻 + 12유닛 커리큘럼)를 LLM용 가이드 브리프 한 덩이로 합성한다.
 *   lowData||!decision → 온보딩 가이드(B-07) 즉시 반환.
 *   그 외 → unit/step/lever/stepN/mode(B-02) · arcStage(B-03) · why(B-04) · weeklyImpressionSoft(B-05) · doNotRestate(B-06) 조립.
 *   plateau → arcStage='observe' 강제(행동 0·위안). anchor=null → 닻 의존 필드 null/폴백(throw 없음·안전 제1원칙).
 * 반환은 순수(LLM 미호출·시계 미사용). 내부 warnings(부모 비노출)는 어느 필드에도 누설하지 않는다.
 * ⭐ Letter B 전용 — A(planFor+composeLetter)는 무변경.
 */
export function buildTeachingGuide(p: {
  dailyResult: DailyV3Result;
  anchor: WeeklyAnchor | null;
  firstOfWeek: boolean;
  lastArcStage?: string | null;
  progress: boolean;
  recentCtxs: RecentCtx[];
  dow: number;
  /** 테스트 주입용(생략 시 UNITS[decision.unit] 조회). */
  unitDef?: UnitDef;
}): TeachingGuide {
  const { dailyResult, anchor } = p;
  const decision = dailyResult?.decision || null;
  const def = decision ? (p.unitDef ?? UNITS[decision.unit]) : (p.unitDef ?? null);

  // B-07 — 온보딩/무기록 우선 분기(수치 why 경로 미진입 — 가짜 결핍 0)
  if (dailyResult?.lowData || !decision || !def) {
    return onboardingGuide({ decision, unitDef: def });
  }

  // B-02 — unit/step/lever 매핑(step 경계 클램프)
  const stepN = clampStep(decision.step, def.steps.length);
  const stepBehavior = def.steps[stepN - 1]?.behavior || '';
  const focusEvidence = ((decision.unit && dailyResult.updates.find((u) => u.unit_id === decision.unit)?.evidence) || {}) as Evidence;

  // plateau → observe 강제(행동 0·위안). plateau는 maintain 각도의 why를 쓴다.
  const plateau = !!dailyResult.plateau;
  const mode = decision.mode;
  const arcStage: WeeklyArcStage = plateau
    ? 'observe'
    : arcStageFor({ mode, firstOfWeek: p.firstOfWeek, lastArcStage: p.lastArcStage, progress: p.progress, dow: p.dow });

  // B-04 — why(수치 근거). plateau면 maintain 각도로(태도 인정·행동 권유 0).
  const why = whyFor({ unit: decision.unit, stepN, mode: plateau ? 'maintain' : mode, evidence: focusEvidence });

  // B-05 — 주간 소견 부드러운 배경(닻 없으면 null)
  const weeklyImpressionSoft = softenImpression(anchor?.impression ?? null);

  // B-06 — 재서술 금지 목록
  const doNotRestate = doNotRestateFrom(p.recentCtxs || [], decision.unit, def.label);

  return {
    unit_ko: def.label,
    lever: def.lever,
    stepBehavior,
    why,
    arcStage,
    weeklyImpressionSoft,
    doNotRestate,
    stepN,
    mode,
  };
}

// ── B-09 — 진도 영속 형태 계산(SQL 실행은 H — 여기선 무엇을 저장할지만) ──────────────
export type NextProgressState = { progressUpserts: ProgressRow[]; goalsForAnchor: Goal[] };
/**
 * Letter B 발행 후 크론(H)이 저장할 진도 행·닻 goals를 계산(순수 — DB 미접근). decideDailyV3의
 * updates(진도 행)·goalsAfter(피벗 플립 포함)를 그대로 영속 대상으로 전달한다. lowData면 진도 동결(빈 upsert).
 *   A(planFor)는 이 함수를 호출하지 않는다(진도 비참여 — GUIDE_PERSISTENCE_NOTE).
 */
export function nextProgressState(dailyResult: DailyV3Result): NextProgressState {
  if (!dailyResult || dailyResult.lowData) {
    return { progressUpserts: [], goalsForAnchor: dailyResult?.goalsAfter || [] };
  }
  return { progressUpserts: dailyResult.updates || [], goalsForAnchor: dailyResult.goalsAfter || [] };
}
