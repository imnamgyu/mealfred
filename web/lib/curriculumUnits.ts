/**
 * lib/curriculumUnits.ts — v3 커리큘럼 12유닛 레지스트리 + 신호 추출기 (WBS B-01~B-15)
 *
 * 선언이 곧 명세: 유닛의 사다리(steps)·판정(passWhen)·재발(relapseWhen)·관측 질문(probes)이
 * 전부 이 한 파일에 산다(가드 레지스트리 재편 — 4중 분산 금지). 전부 순수 함수·LLM 0콜.
 * 모든 카운트는 '날짜' 단위(행 단위 부풀림 금지 — 적대감사 M6). 표본 부족이면 null(판정 보류 —
 * "기록 없음≠없음", 보류는 질문 정렬(G)이 메운다).
 *
 * evidence 예약 키(병합기 lib/curriculum.ts가 관리): signalToday(1|0|null)·hitToday(string|null)·
 * hitDays(string[])·passStreakDays·relapseStreakDays·maintStartedAt·maintCoached.
 */
import { type FactRow } from './coachFacts';
import { cleanRefusal } from './coach';

// ── 타입 (B-01) ───────────────────────────────────────────────────────────────
export type CRow = FactRow & { autonomy?: string | null; texture?: string | null; meal_time?: number | null };
export type ProbeAnswer = { q_date: string; unit_id: string; signal: string; value: string };
export type Evidence = Record<string, number | string | string[] | null | undefined>;
export type UnitId =
  | 'pressure-off' | 'hunger-rhythm' | 'table-stage' | 'exposure-savings' | 'fullness-respect' | 'parent-model'
  | 'no-bargain' | 'table-talk' | 'sensory-texture' | 'food-bridge' | 'autonomy-part' | 'link-rhythm';
export type UnitStatus = 'not_started' | 'active' | 'progressing' | 'maintenance' | 'mastered' | 'pivoted' | 'relapsed';
export type ProgressRow = {
  child_id: string; unit_id: UnitId; status: UnitStatus; step: number; evidence: Evidence;
  started_at: string | null; mastered_at: string | null; last_signal_at: string | null;
  stop_reason: string | null; relapse_count: number;
};
export type Goal = { unit_id: UnitId; priority: 1 | 2 | 3; status: 'focus' | 'standby' | 'stopped'; reason?: string };
export type StepDef = { step: number; behavior: string; passWhen: (e: Evidence) => boolean | null; holdWeeks: number };
export type ProbeDef = { id: string; signal: string; q: string; chips: string[]; map: Record<string, { key: string; delta: number }> };
/** E-03 후보 산출용 주간 신호(크론이 StructuredSig·사실 통계에서 채움 — 전부 7일 창). */
export type CandidateSignals = {
  envBadPct: number | null; envCount: number;        // 화면·이동 식사 비율
  selfPct: number | null; autoCount: number;          // 자기주도 비율
  texLow: boolean; texCount: number;                  // 퓨레·다짐 머묾
  mtOver30Pct: number | null; mtCount: number;        // 30분+ 비율
  missingCount: number; refusedCount: number; dcRefusedCount: number;   // 식품 결핍·거부(전체/기관)
  pressureMemoDays: number; bargainMemoDays: number; snackHeavyDays: number; preMealMemoDays: number;
  newFoodCount: number; attendsDaycare: boolean; eatenCount: number;
};
export type UnitDef = {
  id: UnitId; label: string; lever: 'food' | 'environment' | 'autonomy' | 'texture' | 'mixed'; minWeek: number;
  steps: StepDef[]; probes: ProbeDef[];
  extract: (rows: CRow[], answers: ProbeAnswer[], today: string, opt?: { foodTarget?: string | null }) => Evidence;
  relapseWhen: (e: Evidence) => boolean | null;
  /** B-02 trigger — 주간 종합이 이 유닛을 후보로 올리는 발동 신호 강도(0=비발동, 최대 ~3). E-03이 사용. */
  trigger: (s: CandidateSignals) => number;
};

// ── 임계 상수 (B-03) — 전부 여기, 리플레이(I-03)로 보정 ──────────────────────────
export const TH = {
  stallDays: 6,            // 정체 판정: 1차 신호 무관측 일수 (자체 초기값)
  coachedDaysForStall: 3,  // '가르쳤는데 안 됨' 최소 코칭 일수 (B-19)
  maintenanceWeeks: 1,     // 유지 주(코칭 없이 유지) — 졸업 게이트 (v3 설계 §2)
  relapseWindowDays: 14,   // 재발 확정: 임계 미달 연속 일수 ≈ 2주 (설계 §2 표)
  maxPivotsPerWeek: 1,     // 주당 피벗 캡 — 휙휙 방지 (이사님 원칙)
  focusMaxStallWeeks: 2,   // 같은 유닛 focus 연속 정체 한도 (E-06)
  envTableStep1: 0.4, envTableStep2: 0.6,   // 식탁 무대 (자체 — 화면·이동 93% 실측 가정 기준)
  mealOver30Cap: 0.3,      // 30분 초과율 상한 (30분 룰 — 07 §4-2·12장 Q2)
  selfPctStep1: 0.3, selfPctStep2: 0.5,     // 자기주도 (구조화 칩 분포 기준 자체)
  negTagCap: 0.2,          // 부정 태그 상한 (12장 Q5)
  familyDinnerStep1: 3, familyDinnerStep2: 5,   // 가족식사 주5회 (Satter Family Meals)
  exposeWeekly: 2,         // 노출 주2~3회 하한 (USDA NESR·권태 효과)
  exposeTotalForStep2: 8,  // 누적 노출 8회+ (Wardle 2003·NESR 8~15)
  snackHeavyCap: 2,        // 주당 간식 과다일 상한 (proxy — WIC 2~3시간 간접)
  minLoggedDays: 3, minEnvSamples: 3, minMtSamples: 4, minAutoSamples: 4, minTalkSamples: 4, minTexSamples: 3,
  newFoodWeekly: 1,        // 푸드브릿지 주당 신규 1종 (체이닝 한 칸/1~2주)
  linkWindowDays: 4,       // 기관 거부→집 재노출 매칭 창 (격일~주2-3 리듬)
} as const;

// ── 공용 헬퍼 ─────────────────────────────────────────────────────────────────
const age = (today: string, d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
const last7 = (rows: CRow[], today: string) => rows.filter((r) => { const a = age(today, r.log_date); return a >= 1 && a <= 7; });
const dates = (rows: CRow[]) => [...new Set(rows.map((r) => r.log_date))];
const yest = (today: string) => new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
const memoDays = (rows: CRow[], re: RegExp) => dates(rows.filter((r) => r.note && re.test(r.note)));
const probe7 = (answers: ProbeAnswer[], unit: string, today: string) =>
  answers.filter((a) => a.unit_id === unit && age(today, a.q_date) >= 0 && age(today, a.q_date) <= 7);
/** 특정 답변 값들이 기록된 '날짜' 목록(G-04 답변→evidence 블렌딩용 — 날짜 단위, 행 부풀림 금지) */
const probeDays = (answers: ProbeAnswer[], unit: string, today: string, values: string[]) =>
  [...new Set(probe7(answers, unit, today).filter((a) => values.includes(a.value)).map((a) => a.q_date))];
/** 어제 데이터 기준 1차 신호: 1=관측·0=반대 관측·null=무데이터(보류) */
const sig = (cond: boolean | null): 1 | 0 | null => (cond === null ? null : cond ? 1 : 0);

const PRESSURE_RE = /한\s?입만|다\s?먹어|먹어야|억지로|혼냈|먹이려/;
const PREMEAL_SNACK_RE = /(저녁|밥|끼니)\s?(직전|전)에?\s?(간식|우유|주스)/;
const FORCE_FINISH_RE = /다\s?먹(여|게|을 때까지)|남기지\s?마/;
const BARGAIN_RE = /먹으면\s|줄게|사줄게|상으로|보상으로/;
const BANWORD_RE = /한\s?입만|먹어야지|안\s?먹으면/;
const TEX_ORDER = ['puree', 'mashed', 'finger', 'table'];

// ── 12유닛 레지스트리 (B-02 + B-04~B-15) ─────────────────────────────────────
export const UNITS: Record<UnitId, UnitDef> = {
  'pressure-off': {
    id: 'pressure-off', label: '압박 내려놓기', lever: 'mixed', minWeek: 1,
    extract: (rows, answers, today) => {
      const w = last7(rows, today);
      const tags = probe7(answers, 'pressure-off', today);
      if (dates(w).length < TH.minLoggedDays && tags.length < 2) return { signalToday: null };
      const pressureMemoDays = memoDays(w, PRESSURE_RE).length;
      // ⚠️ 칩 '원문' 비교(다른 추출기와 동일 규약) — 매핑 키('압박') 비교는 파서가 원문을 저장하므로 영원히 0이 되는 잠복 버그였다(G-04에서 적발).
      const NEG_CHIPS = ['먹이느라 실랑이했어요', '속상해서 한마디 했어요'];
      const neg = tags.filter((a) => NEG_CHIPS.includes(a.value)).length;
      const negTagPct7d = tags.length >= 2 ? neg / tags.length : null;
      const yd = w.filter((r) => r.log_date === yest(today));
      return {
        pressureMemoDays, negTagPct7d, talkSamplesPo: tags.length,
        signalToday: sig(yd.length ? !yd.some((r) => r.note && PRESSURE_RE.test(r.note)) : null),
      };
    },
    steps: [
      { step: 1, behavior: '"한 입만"·재촉 멘트 멈추기 — 남겨도 담담히', passWhen: (e) => (typeof e.pressureMemoDays === 'number' ? e.pressureMemoDays === 0 : null), holdWeeks: 1 },
      { step: 2, behavior: '식탁 분위기를 압박 없이 유지(환호·박수도 담담하게)', passWhen: (e) => (e.negTagPct7d == null ? null : (e.negTagPct7d as number) <= TH.negTagCap), holdWeeks: 2 },
    ],
    probes: [
      { id: 'po-tone', signal: 'negTagPct7d', q: '오늘 식탁 분위기는 어땠어요?', chips: ['편안했어요', '보통이었어요', '먹이느라 실랑이했어요', '잘 모르겠어요'], map: { '먹이느라 실랑이했어요': { key: '압박', delta: 1 }, '편안했어요': { key: '편안', delta: 1 } } },
      { id: 'po-react', signal: 'negTagPct7d', q: '아이가 음식을 남기거나 거부할 때 어떠셨어요?', chips: ['담담하게 치웠어요', '속상해서 한마디 했어요', '잘 모르겠어요'], map: { '속상해서 한마디 했어요': { key: '압박', delta: 1 }, '담담하게 치웠어요': { key: '편안', delta: 1 } } },
    ],
    relapseWhen: (e) => (typeof e.pressureMemoDays === 'number' ? (e.pressureMemoDays as number) >= 2 : null),
    trigger: (s) => (s.pressureMemoDays >= 2 ? 2 + Math.min(1, s.pressureMemoDays / 4) : 0),
  },

  'hunger-rhythm': {
    id: 'hunger-rhythm', label: '공복 리듬', lever: 'environment', minWeek: 1,
    extract: (rows, answers, today) => {
      const w = last7(rows, today);
      const ansPreDays = probeDays(answers, 'hunger-rhythm', today, ['직전에 조금 줬어요']);
      const ansGrazeDays = probeDays(answers, 'hunger-rhythm', today, ['수시로 조금씩 먹었어요']);
      if (dates(w).length < TH.minLoggedDays && !ansPreDays.length && !ansGrazeDays.length) return { signalToday: null };
      const byDate: Record<string, number> = {};
      w.forEach((r) => { if ((r.slot || '').includes('snack')) byDate[r.log_date] = (byDate[r.log_date] || 0) + 1; });
      const heavyRowDays = Object.entries(byDate).filter(([, n]) => n >= 3).map(([d]) => d);
      const snackHeavyDays = new Set([...heavyRowDays, ...ansGrazeDays]).size;   // 하루 3회+ 간식 ∪ '수시로' 답변(G-04 블렌딩)
      const preMealMemoDays = new Set([...memoDays(w, PREMEAL_SNACK_RE), ...ansPreDays]).size;
      const y = yest(today);
      const ySnacks = byDate[y] || 0;
      const yLogged = w.some((r) => r.log_date === y);
      const yPre = w.some((r) => r.log_date === y && r.note && PREMEAL_SNACK_RE.test(r.note)) || ansPreDays.includes(y);
      return { snackHeavyDays, preMealMemoDays, signalToday: sig(yLogged ? ySnacks < 3 && !yPre : null) };
    },
    steps: [
      { step: 1, behavior: '끼니 30분 전 간식·우유 멈추기', passWhen: (e) => (typeof e.preMealMemoDays === 'number' ? e.preMealMemoDays === 0 : null), holdWeeks: 1 },
      { step: 2, behavior: '식사·간식 간격 2~3시간 리듬 고정', passWhen: (e) => (typeof e.snackHeavyDays === 'number' ? (e.snackHeavyDays as number) <= TH.snackHeavyCap : null), holdWeeks: 2 },
    ],
    probes: [
      { id: 'hr-gap', signal: 'preMealMemoDays', q: '저녁 전에 간식·우유를 먹였나요?', chips: ['끼니 직전엔 안 줬어요', '직전에 조금 줬어요', '잘 모르겠어요'], map: { '직전에 조금 줬어요': { key: 'preMeal', delta: 1 } } },
      { id: 'hr-graze', signal: 'snackHeavyDays', q: '오늘 간식은 어떤 흐름이었어요?', chips: ['정해진 때에만 줬어요', '수시로 조금씩 먹었어요', '잘 모르겠어요'], map: { '수시로 조금씩 먹었어요': { key: 'graze', delta: 1 } } },
    ],
    relapseWhen: (e) => (typeof e.snackHeavyDays === 'number' ? (e.snackHeavyDays as number) >= 3 : null),
    trigger: (s) => Math.max(s.snackHeavyDays >= 2 ? 2 : 0, s.preMealMemoDays >= 2 ? 2 : 0),
  },

  'table-stage': {
    id: 'table-stage', label: '식탁 무대', lever: 'environment', minWeek: 1,
    extract: (rows, answers, today) => {
      const w = last7(rows, today);
      const env = w.filter((r) => r.environment);
      // G-04 블렌딩: 칩 기록이 모자라면 질문 답이 표본을 보충(표본 부족→질문→적립→판정 루프)
      const ans = probe7(answers, 'table-stage', today).filter((a) => ['식탁에서 화면 없이', '식탁이지만 영상 봤어요', '돌아다니며 먹었어요'].includes(a.value));
      const tableN = env.filter((r) => r.environment === 'table').length + ans.filter((a) => a.value === '식탁에서 화면 없이').length;
      const totalN = env.length + ans.length;
      const envTablePct7d = totalN >= TH.minEnvSamples ? tableN / totalN : null;
      const y = yest(today);
      const yEnv = w.filter((r) => r.log_date === y && r.environment);
      const yAnsTable = answers.some((a) => a.unit_id === 'table-stage' && a.q_date === y && a.value === '식탁에서 화면 없이');
      return { envTablePct7d, envSamples: totalN, signalToday: sig(yEnv.length || yAnsTable ? yEnv.some((r) => r.environment === 'table') || yAnsTable : null) };
    },
    steps: [
      { step: 1, behavior: '하루 한 끼 화면 끄고 식탁에서', passWhen: (e) => (e.envTablePct7d == null ? null : (e.envTablePct7d as number) >= TH.envTableStep1), holdWeeks: 1 },
      { step: 2, behavior: '주 5끼+ 같은 자리·같은 시간', passWhen: (e) => (e.envTablePct7d == null ? null : (e.envTablePct7d as number) >= TH.envTableStep2), holdWeeks: 2 },
    ],
    probes: [
      { id: 'ts-env', signal: 'envTablePct7d', q: '오늘 끼니는 어디서 먹었어요?', chips: ['식탁에서 화면 없이', '식탁이지만 영상 봤어요', '돌아다니며 먹었어요', '잘 모르겠어요'], map: { '식탁에서 화면 없이': { key: 'table', delta: 1 } } },
      { id: 'ts-ritual', signal: 'ritualYes', q: '식사 시작 전 작은 신호(수저 놓기 등)를 해봤어요?', chips: ['아이와 같이 했어요', '오늘은 못 했어요', '잘 모르겠어요'], map: { '아이와 같이 했어요': { key: 'ritual', delta: 1 } } },
    ],
    relapseWhen: (e) => (e.envTablePct7d == null ? null : (e.envTablePct7d as number) < TH.envTableStep1),
    trigger: (s) => (s.envBadPct != null && s.envBadPct >= 0.4 && s.envCount >= 4 ? 2 + s.envBadPct : 0),
  },

  'exposure-savings': {
    id: 'exposure-savings', label: '노출 적금', lever: 'food', minWeek: 2,
    extract: (rows, _a, today, opt) => {
      const t = opt?.foodTarget;
      if (!t) return { signalToday: null };
      const w = last7(rows, today);
      if (dates(w).length < TH.minLoggedDays) return { signalToday: null };
      const hit = (r: CRow) => (r.menus || []).some((m) => m.includes(t)) || String(r.note || '').includes(t);
      const targetDays = dates(w.filter(hit));
      const selfEat = w.filter((r) => hit(r) && r.ate_well === true).length;
      const y = yest(today);
      return {
        targetExposeDays7d: targetDays.length, selfEatCount: selfEat, target: t,
        hitToday: targetDays.includes(y) ? y : null,
        signalToday: sig(w.some((r) => r.log_date === y) ? targetDays.includes(y) : null),
      };
    },
    steps: [
      { step: 1, behavior: '새로운 음식을 아주 조금씩 말없이 식탁에 올려 보기(격일)', passWhen: (e) => (typeof e.targetExposeDays7d === 'number' ? (e.targetExposeDays7d as number) >= TH.exposeWeekly : null), holdWeeks: 1 },
      { step: 2, behavior: '익숙해진 음식을 티스푼 맛보기로 가볍게 초대하기', passWhen: (e) => (Array.isArray(e.hitDays) ? (e.hitDays as string[]).length >= TH.exposeTotalForStep2 : null), holdWeeks: 1 },
    ],
    probes: [
      { id: 'es-react', signal: 'selfEatCount', q: '식탁에 올린 도전 음식, 아이 반응은요?', chips: ['스스로 먹어봤어요', '만지거나 냄새만', '거부했어요', '잘 모르겠어요'], map: { '스스로 먹어봤어요': { key: 'selfEat', delta: 1 } } },
      { id: 'es-touch', signal: 'touchCount', q: '도전 음식을 아이가 만지거나 냄새 맡아봤어요?', chips: ['만지거나 냄새 맡았어요', '쳐다보기만 했어요', '잘 모르겠어요'], map: { '만지거나 냄새 맡았어요': { key: 'touch', delta: 1 } } },
    ],
    relapseWhen: (e) => (typeof e.targetExposeDays7d === 'number' ? e.targetExposeDays7d === 0 : null),
    trigger: (s) => (s.missingCount > 0 || s.refusedCount > 0 ? 1.5 + Math.min(1, (s.missingCount + s.refusedCount) / 4) : 0),
  },

  'fullness-respect': {
    id: 'fullness-respect', label: '배부름 존중', lever: 'mixed', minWeek: 2,
    extract: (rows, answers, today) => {
      const w = last7(rows, today);
      const mt = w.filter((r) => typeof r.meal_time === 'number');
      const over30Pct = mt.length >= TH.minMtSamples ? mt.filter((r) => (r.meal_time as number) >= 30).length / mt.length : null;
      const ansForceDays = probeDays(answers, 'fullness-respect', today, ['몇 입 더 권했어요']);
      const enough = dates(w).length >= TH.minLoggedDays || ansForceDays.length > 0 || probe7(answers, 'fullness-respect', today).length >= 2;
      const forceMemoDays = enough ? new Set([...memoDays(w, FORCE_FINISH_RE), ...ansForceDays]).size : null;
      const yMt = w.filter((r) => r.log_date === yest(today) && typeof r.meal_time === 'number');
      return { over30Pct, forceMemoDays, signalToday: sig(yMt.length ? yMt.every((r) => (r.meal_time as number) < 30) : null) };
    },
    steps: [
      { step: 1, behavior: '"배불러" 인정하고 종료 — 완식 강요 멈추기', passWhen: (e) => (typeof e.forceMemoDays === 'number' ? e.forceMemoDays === 0 : null), holdWeeks: 1 },
      { step: 2, behavior: '30분쯤엔 부담 없이 정리(적게 담고 더 달라면 추가)', passWhen: (e) => (e.over30Pct == null ? null : (e.over30Pct as number) <= TH.mealOver30Cap), holdWeeks: 2 },
    ],
    probes: [
      { id: 'fr-end', signal: 'forceMemoDays', q: '아이가 그만 먹겠다고 할 때 어떻게 했어요?', chips: ['그대로 마무리했어요', '몇 입 더 권했어요', '잘 모르겠어요'], map: { '몇 입 더 권했어요': { key: 'force', delta: 1 } } },
      { id: 'fr-amount', signal: 'smallServe', q: '오늘 양 조절은 어땠어요?', chips: ['적게 담고 더 달라면 줬어요', '한 번에 많이 담았어요', '잘 모르겠어요'], map: { '적게 담고 더 달라면 줬어요': { key: 'smallServe', delta: 1 } } },
    ],
    relapseWhen: (e) => (e.over30Pct == null ? null : (e.over30Pct as number) > 0.5),
    trigger: (s) => (s.mtOver30Pct != null && s.mtOver30Pct > 0.5 && s.mtCount >= 4 ? 2 : 0),
  },

  'parent-model': {
    id: 'parent-model', label: '부모가 메뉴판', lever: 'mixed', minWeek: 2,
    extract: (rows, answers, today) => {
      const w = last7(rows, today);
      if (dates(w).length < TH.minLoggedDays) return { signalToday: null };
      const familyDinnerDays = dates(w.filter((r) => r.slot === 'dinner' && r.place !== 'daycare')).length;
      const modelYes = probe7(answers, 'parent-model', today).filter((a) => ['같이 먹었어요', '곁에서 같이 먹었어요'].includes(a.value)).length;
      const y = yest(today);
      return { familyDinnerDays, modelYes, signalToday: sig(w.some((r) => r.log_date === y) ? w.some((r) => r.log_date === y && r.slot === 'dinner' && r.place !== 'daycare') : null) };
    },
    steps: [
      { step: 1, behavior: '같은 음식을 곁에서 말없이 맛있게(하루 1회)', passWhen: (e) => (typeof e.familyDinnerDays === 'number' ? (e.familyDinnerDays as number) >= TH.familyDinnerStep1 : null), holdWeeks: 1 },
      { step: 2, behavior: '가족 저녁 주 5회(배달·간단식도 OK)', passWhen: (e) => (typeof e.familyDinnerDays === 'number' ? (e.familyDinnerDays as number) >= TH.familyDinnerStep2 : null), holdWeeks: 2 },
    ],
    probes: [
      { id: 'pm-with', signal: 'modelYes', q: '저녁, 아이와 같은 음식을 같이 드셨어요?', chips: ['같이 먹었어요', '아이만 먹였어요', '잘 모르겠어요'], map: { '같이 먹었어요': { key: 'with', delta: 1 } } },
      { id: 'pm-seen', signal: 'modelYes', q: '오늘 아이가 부모님 식사 모습을 봤을까요?', chips: ['곁에서 같이 먹었어요', '아이 먼저 먹였어요', '잘 모르겠어요'], map: { '곁에서 같이 먹었어요': { key: 'with', delta: 1 } } },
    ],
    relapseWhen: (e) => (typeof e.familyDinnerDays === 'number' ? (e.familyDinnerDays as number) < 2 : null),
    trigger: () => 0,   // 식단 데이터만으론 비발동 — Sonnet 재량·기초 폴백 경로로만 선발
  },

  'no-bargain': {
    id: 'no-bargain', label: '달콤한 협상 끊기', lever: 'mixed', minWeek: 2,
    extract: (rows, answers, today) => {
      const w = last7(rows, today);
      if (dates(w).length < TH.minLoggedDays) return { signalToday: null };
      const ansBargainDays = probeDays(answers, 'no-bargain', today, ['먹으면 주기로 했어요', '먹은 다음에 상처럼 줬어요']);
      const bargainMemoDays = new Set([...memoDays(w, BARGAIN_RE), ...ansBargainDays]).size;
      const neutralYes = probe7(answers, 'no-bargain', today).filter((a) => ['거래 없이 차렸어요', '끼니랑 같이 소량 냈어요'].includes(a.value)).length;
      const y = yest(today);
      return { bargainMemoDays, neutralYes, signalToday: sig(w.some((r) => r.log_date === y) ? !(w.some((r) => r.log_date === y && r.note && BARGAIN_RE.test(r.note)) || ansBargainDays.includes(y)) : null) };
    },
    steps: [
      { step: 1, behavior: '"먹으면 ~줄게" 거래 멈추기', passWhen: (e) => (typeof e.bargainMemoDays === 'number' ? e.bargainMemoDays === 0 : null), holdWeeks: 1 },
      { step: 2, behavior: '디저트 지위 중립화(소량을 끼니와 함께·악마화 금지)', passWhen: (e) => (typeof e.bargainMemoDays === 'number' && typeof e.neutralYes === 'number' ? e.bargainMemoDays === 0 && (e.neutralYes as number) >= 1 : null), holdWeeks: 2 },
    ],
    probes: [
      { id: 'nb-deal', signal: 'neutralYes', q: '오늘 디저트·간식은 어떻게 줬어요?', chips: ['거래 없이 차렸어요', '먹으면 주기로 했어요', '잘 모르겠어요'], map: { '거래 없이 차렸어요': { key: 'neutral', delta: 1 }, '먹으면 주기로 했어요': { key: 'bargain', delta: 1 } } },
      { id: 'nb-dessert', signal: 'neutralYes', q: '디저트는 오늘 어떤 자리였어요?', chips: ['끼니랑 같이 소량 냈어요', '먹은 다음에 상처럼 줬어요', '잘 모르겠어요'], map: { '끼니랑 같이 소량 냈어요': { key: 'neutral', delta: 1 }, '먹은 다음에 상처럼 줬어요': { key: 'bargain', delta: 1 } } },
    ],
    relapseWhen: (e) => (typeof e.bargainMemoDays === 'number' ? (e.bargainMemoDays as number) >= 2 : null),
    trigger: (s) => (s.bargainMemoDays >= 1 ? 1.5 + Math.min(1, s.bargainMemoDays / 3) : 0),
  },

  'table-talk': {
    id: 'table-talk', label: '식탁의 말', lever: 'mixed', minWeek: 3,
    extract: (rows, answers, today) => {
      const w = last7(rows, today);
      const banWordDays = dates(w).length >= TH.minLoggedDays ? memoDays(w, BANWORD_RE).length : null;
      const talks = probe7(answers, 'table-talk', today);
      const OBJECT_CHIPS = ['맛이 어떤지 물었어요', '음식 맛·색 이야기였어요'];
      const objectTalkPct = talks.length >= TH.minTalkSamples ? talks.filter((a) => OBJECT_CHIPS.includes(a.value)).length / talks.length : null;
      return { banWordDays, objectTalkPct, talkSamples: talks.length, signalToday: sig(talks.length ? OBJECT_CHIPS.includes(talks[0].value) : null) };
    },
    steps: [
      { step: 1, behavior: '금지어 3종 끊기("한 입만"·"다 먹어야지"·"안 먹으면…")', passWhen: (e) => (typeof e.banWordDays === 'number' ? e.banWordDays === 0 : null), holdWeeks: 1 },
      { step: 2, behavior: '객체 중심 질문("당근이 어땠어?")으로 바꾸기', passWhen: (e) => (e.objectTalkPct == null ? null : (e.objectTalkPct as number) >= 0.7), holdWeeks: 2 },
    ],
    probes: [
      { id: 'tt-talk', signal: 'objectTalkPct', q: '오늘 식탁에서 어떤 말을 가장 많이 건넸어요?', chips: ['맛이 어떤지 물었어요', '먹으라고 챙겼어요', '별말 안 했어요', '잘 모르겠어요'], map: { '맛이 어떤지 물었어요': { key: 'object', delta: 1 }, '먹으라고 챙겼어요': { key: 'press', delta: 1 } } },
      { id: 'tt-topic', signal: 'objectTalkPct', q: '오늘 식탁 대화는 주로 어떤 쪽이었어요?', chips: ['음식 맛·색 이야기였어요', '얼마나 먹는지 이야기였어요', '별 대화 없었어요', '잘 모르겠어요'], map: { '음식 맛·색 이야기였어요': { key: 'object', delta: 1 }, '얼마나 먹는지 이야기였어요': { key: 'press', delta: 1 } } },
    ],
    relapseWhen: (e) => (typeof e.banWordDays === 'number' ? (e.banWordDays as number) >= 2 : null),
    trigger: (s) => (s.pressureMemoDays >= 1 ? 1 : 0),
  },

  'sensory-texture': {
    id: 'sensory-texture', label: '감각·질감 트랙', lever: 'texture', minWeek: 3,
    extract: (rows, answers, today) => {
      const w = last7(rows, today);
      const texList = w.filter((r) => r.texture && TEX_ORDER.includes(r.texture)).map((r) => r.texture as string);
      // G-04 블렌딩: '잘 먹었어요'(새 질감 성공) 답변 = finger 표본 1개로 적립(보수적 — 한 단계 위 일반화 금지)
      probe7(answers, 'sensory-texture', today).filter((a) => a.value === '잘 먹었어요').forEach(() => texList.push('finger'));
      if (texList.length < TH.minTexSamples) return { signalToday: null };
      const cnt: Record<string, number> = {};
      texList.forEach((t) => { cnt[t] = (cnt[t] || 0) + 1; });
      const mode = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
      const texModeIdx = TEX_ORDER.indexOf(mode);
      const y = yest(today);
      const yTex = w.filter((r) => r.log_date === y && r.texture);
      const yAnsUp = answers.some((a) => a.unit_id === 'sensory-texture' && a.q_date === y && a.value === '잘 먹었어요');
      return { texModeIdx, signalToday: sig(yTex.length || yAnsUp ? yTex.some((r) => TEX_ORDER.indexOf(r.texture as string) >= 2) || yAnsUp : null) };
    },
    steps: [
      { step: 1, behavior: '한 끼만 한 단계 위 질감(핑거푸드) — 거부 시 즉시 후퇴', passWhen: (e) => (typeof e.texModeIdx === 'number' ? (e.texModeIdx as number) >= 2 : null), holdWeeks: 1 },
      { step: 2, behavior: '일반식 비중 올리기', passWhen: (e) => (typeof e.texModeIdx === 'number' ? (e.texModeIdx as number) >= 3 : null), holdWeeks: 2 },
    ],
    probes: [
      { id: 'st-step', signal: 'texModeIdx', q: '오늘 새 질감(덩어리·핑거푸드)을 시도해봤어요?', chips: ['잘 먹었어요', '만지긴 했어요', '거부해서 되돌렸어요', '잘 모르겠어요'], map: { '잘 먹었어요': { key: 'texUp', delta: 1 } } },
      { id: 'st-touch', signal: 'touchCount', q: '새 질감을 먹기 전에 손으로 만져보게 해봤어요?', chips: ['만져봤어요', '아직요', '잘 모르겠어요'], map: { '만져봤어요': { key: 'touch', delta: 1 } } },
    ],
    relapseWhen: (e) => (typeof e.texModeIdx === 'number' ? (e.texModeIdx as number) <= 1 : null),
    trigger: (s) => (s.texLow && s.texCount >= 3 ? 2 : 0),
  },

  'food-bridge': {
    id: 'food-bridge', label: '확장 트랙(음식 다리)', lever: 'food', minWeek: 3,
    extract: (rows, _a, today) => {
      // 주의: 28일 창 필요 — 호출자는 rows를 28일치로 전달(JSDoc·H-02). 집 끼니만(M5).
      const home = rows.filter((r) => r.place !== 'daycare');
      const w7 = last7(home, today);
      if (dates(w7).length < TH.minLoggedDays) return { signalToday: null };
      const prior = home.filter((r) => age(today, r.log_date) > 7 && age(today, r.log_date) <= 28);
      const seen = new Set(prior.flatMap((r) => r.menus || []));
      const newFoods = [...new Set(w7.flatMap((r) => r.menus || []).filter((m) => m && !seen.has(m)))];
      const y = yest(today);
      const yNew = w7.filter((r) => r.log_date === y).flatMap((r) => r.menus || []).some((m) => newFoods.includes(m));
      return { newFoodCount7d: newFoods.length, signalToday: sig(w7.some((r) => r.log_date === y) ? yNew : null) };
    },
    steps: [
      { step: 1, behavior: '잘 먹는 음식의 사촌 1종을 식탁에(한 축만 변형)', passWhen: (e) => (typeof e.newFoodCount7d === 'number' ? (e.newFoodCount7d as number) >= TH.newFoodWeekly : null), holdWeeks: 1 },
      { step: 2, behavior: '사슬 다음 칸으로(찍어먹기 짝짓기 활용)', passWhen: (e) => (typeof e.newFoodCount7d === 'number' ? (e.newFoodCount7d as number) >= TH.newFoodWeekly : null), holdWeeks: 2 },
    ],
    probes: [
      { id: 'fb-new', signal: 'newFoodCount7d', q: '이번 주 새로운 음식을 식탁에 올려봤어요?', chips: ['새 음식을 시도했어요', '익숙한 것만 차렸어요', '잘 모르겠어요'], map: { '새 음식을 시도했어요': { key: 'newFood', delta: 1 } } },
      { id: 'fb-dip', signal: 'dipCount', q: '좋아하는 소스에 찍어 먹기를 해봤어요?', chips: ['해봤어요', '아직요', '잘 모르겠어요'], map: { '해봤어요': { key: 'dip', delta: 1 } } },
    ],
    relapseWhen: (e) => (typeof e.newFoodCount7d === 'number' ? e.newFoodCount7d === 0 : null),
    trigger: (s) => (s.newFoodCount === 0 && s.eatenCount > 0 ? 1.2 : 0),
  },

  'autonomy-part': {
    id: 'autonomy-part', label: '자율성·참여 트랙', lever: 'autonomy', minWeek: 3,
    extract: (rows, answers, today) => {
      const w = last7(rows, today);
      const auto = w.filter((r) => r.autonomy);
      // G-04 블렌딩: 자율성 칩이 모자라면 'ap-self' 답이 표본 보충
      const ansSelf = probe7(answers, 'autonomy-part', today).filter((a) => a.value === '스스로 먹었어요').length;
      const ansFed = probe7(answers, 'autonomy-part', today).filter((a) => a.value === '대부분 떠먹여 줬어요').length;
      const selfN = auto.filter((r) => r.autonomy === 'self').length + ansSelf;
      const totalN = auto.length + ansSelf + ansFed;
      const selfPct7d = totalN >= TH.minAutoSamples ? selfN / totalN : null;
      const roleYes = probe7(answers, 'autonomy-part', today).filter((a) => a.value === '역할을 줬어요').length;
      const y = yest(today);
      const yAuto = w.filter((r) => r.log_date === y && r.autonomy);
      const yAnsSelf = answers.some((a) => a.unit_id === 'autonomy-part' && a.q_date === y && a.value === '스스로 먹었어요');
      return { selfPct7d, roleYes, signalToday: sig(yAuto.length || yAnsSelf ? yAuto.some((r) => r.autonomy === 'self') || yAnsSelf : null) };
    },
    steps: [
      { step: 1, behavior: '두 가지 중 아이가 고르게 + 하루 한 끼 스스로 떠먹기', passWhen: (e) => (e.selfPct7d == null ? null : (e.selfPct7d as number) >= TH.selfPctStep1), holdWeeks: 1 },
      { step: 2, behavior: '셀프 서빙·상차림 역할 주기', passWhen: (e) => (e.selfPct7d == null ? null : (e.selfPct7d as number) >= TH.selfPctStep2), holdWeeks: 2 },
    ],
    probes: [
      { id: 'ap-role', signal: 'roleYes', q: '오늘 식사 준비에서 아이에게 작은 역할을 줬어요?', chips: ['역할을 줬어요', '오늘은 못 줬어요', '잘 모르겠어요'], map: { '역할을 줬어요': { key: 'role', delta: 1 } } },
      { id: 'ap-self', signal: 'selfPct7d', q: '오늘 한 끼라도 아이가 스스로 떠먹었어요?', chips: ['스스로 먹었어요', '대부분 떠먹여 줬어요', '잘 모르겠어요'], map: { '스스로 먹었어요': { key: 'self', delta: 1 } } },
    ],
    relapseWhen: (e) => (e.selfPct7d == null ? null : (e.selfPct7d as number) < TH.selfPctStep1),
    trigger: (s) => (s.selfPct != null && s.selfPct < 0.3 && s.autoCount >= 4 ? 2 + (0.3 - s.selfPct) : 0),
  },

  'link-rhythm': {
    id: 'link-rhythm', label: '연계·리듬 트랙', lever: 'food', minWeek: 3,
    extract: (rows, _a, today) => {
      const dc = rows.filter((r) => r.place === 'daycare' && r.refused);
      if (!dc.length) return { signalToday: null };   // 비등원/기관 거부 없음 = no-op
      const inLast7 = (d: string) => age(today, d) >= 1 && age(today, d) <= 7;
      let matches = 0; let yMatch = false;
      dc.forEach((r) => {
        String(r.refused).split(/[,，·]/).forEach((tok) => {
          const k = cleanRefusal(tok); if (!k) return;
          // 재노출 매칭: 거부일 이후 linkWindowDays 안에 집 끼니 메뉴로 재등장(코드 계산 — P2 연계)
          const retry = rows.find((h) =>
            h.place !== 'daycare' && h.log_date > r.log_date &&
            age(h.log_date, r.log_date) <= TH.linkWindowDays &&
            (h.menus || []).some((m) => m.includes(k)));
          if (retry && inLast7(retry.log_date)) { matches++; if (retry.log_date === yest(today)) yMatch = true; }
        });
      });
      return { dcRefuseHomeRetry7d: matches, signalToday: sig(rows.some((r) => r.log_date === yest(today)) ? yMatch : null) };
    },
    steps: [
      { step: 1, behavior: '기관에서 거부한 식재료를 집에서 저압력으로 다시(주 1회+)', passWhen: (e) => (typeof e.dcRefuseHomeRetry7d === 'number' ? (e.dcRefuseHomeRetry7d as number) >= 1 : null), holdWeeks: 1 },
      { step: 2, behavior: '격일 리듬으로 재노출 이어가기(주 2회)', passWhen: (e) => (typeof e.dcRefuseHomeRetry7d === 'number' ? (e.dcRefuseHomeRetry7d as number) >= 2 : null), holdWeeks: 2 },
    ],
    probes: [
      { id: 'lr-retry', signal: 'dcRefuseHomeRetry7d', q: '어린이집에서 안 먹은 음식, 집에서 다시 올려봤어요?', chips: ['다시 올려봤어요', '아직요', '잘 모르겠어요'], map: { '다시 올려봤어요': { key: 'retry', delta: 1 } } },
      { id: 'lr-menu', signal: 'menuCheck', q: '이번 주 어린이집 식단표를 본 적 있어요?', chips: ['봤어요', '아직요', '잘 모르겠어요'], map: { '봤어요': { key: 'menuCheck', delta: 1 } } },
    ],
    relapseWhen: (e) => (typeof e.dcRefuseHomeRetry7d === 'number' ? e.dcRefuseHomeRetry7d === 0 : null),
    trigger: (s) => (s.attendsDaycare && s.dcRefusedCount > 0 ? 1.5 : 0),
  },
};

export const UNIT_IDS = Object.keys(UNITS) as UnitId[];
