/**
 * lib/replayB.ts — Letter B(하이브리드) 결정론층 다일 리플레이 하네스 (WBS EPIC H · H-09·H-13)
 *
 * 인계서 핵심: '재료까지 LLM 자유면 6통이 당근→미역국으로 수렴'(11세션 사고)을 막는 B 개선의
 *   결정론층(재료 회전 → 조합 정합 → 거울/추천 문장 → 품질 스캔)을 LLM 0콜로 통주해
 *   다일 리플레이 단위로 괴식 0·수렴 0·품질 위반 0을 측정한다.
 *
 * ⚠️ 기존 replayRunner.ts(v3 조립 runV3Family)·replayMetrics.ts(v3 지표)는 무수정 — 이 파일은
 *   Letter B 전용으로 additive하게 별도 추가한다(A 대조군·v3 컷오버 게이트 무영향).
 * 전부 순수 함수 — fs/HTTP·시계·LLM 불사용(작문 LLM은 운영 전용 · 리플레이는 결정론층만).
 *
 * 입력 = ReplayFamily 모양(rows에 ingredients[](real-arin) 또는 menus[](synthetic) 둘 다 수용).
 *   menus만 있는 행은 menuToIng 주입 매퍼로 식재료를 채운다(테스트가 mapMenuLocal을 주입 — 결정론).
 */
import { selectDailyMaterials, type MealRow, type DailyMaterials } from './coachMaterials';
import { serializeMaterials, materialFoodsOf, qualityScan } from './coachGrounding';
import { computeGroupSignals } from './nutrition';

const addD = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dayDiff = (today: string, log: string) => Math.round((Date.parse(today) - Date.parse(log)) / 86400000);

// ── 입력 행(real-arin·synthetic 양쪽 수용) ────────────────────────────────────────
export type BRow = {
  log_date: string;
  slot?: string | null;
  place?: string | null;
  ate_well?: boolean | null;
  refused?: string | null;
  menus?: string[] | null;
  ingredients?: string[] | null;
};

export type BReplayFamily = {
  id: string;
  base: string;
  rows: BRow[];
  attendsDaycare?: boolean;
  name?: string;
  favoriteFoods?: string[];   // 잘 먹는 '음식'(메뉴) — 조합 검증 입력. 없으면 빈(조합 강요 안 함).
};

export type BReplayDay = {
  date: string;
  target: string | null;        // 오늘 결핍 타깃 식품군(없으면 null)
  material: string | null;      // 추천 식재료(회전 산출)
  combo: { dish: string; ingredient: string; ok: boolean } | null;   // 최상위 검증 조합(없으면 null)
  mirror: string | null;        // 직렬화된 재료·근거 텍스트(거울+추천 합본 — 검증 입력)
  quality: string[];            // 품질 위반 사유(빈=통과)
};

export type BReplayResult = { days: BReplayDay[]; materials: DailyMaterials[] };

export type BReplayOptions = {
  days?: number;                                   // base 직전 며칠을 발행할지(기본 14)
  windowDays?: number;                             // 신호 산출 창(기본 28)
  menuToIng?: (menu: string) => string[];          // menus→ingredients 매퍼(테스트 주입 mapMenuLocal). 없으면 ingredients 필드만.
  recordedDaysMin?: number;                        // 분석 모드 진입을 위한 기록일 하한(기본 자동)
};

/**
 * 한 가정의 base 직전 N일을 Letter B 결정론층으로 통주한다(LLM 0콜).
 *  매일: 28일 창 신호 산출 → selectDailyMaterials(재료 회전·조합·근거) → serializeMaterials(거울+추천 합본)
 *       → qualityScan(품질 위반). recentRecos는 직전 3일 추천으로 이어 회전(수렴 방지 시계열).
 *  결정론: 같은 fam·opt 두 번 호출 → 같은 days(시계 미접근·recent 이력만).
 */
export function runBFamily(fam: BReplayFamily, opt: BReplayOptions = {}): BReplayResult {
  const days = opt.days ?? 14;
  const windowDays = opt.windowDays ?? 28;
  const rows = fam.rows || [];
  const favoriteFoods = fam.favoriteFoods || [];
  const out: BReplayDay[] = [];
  const materialsOut: DailyMaterials[] = [];
  let recent: string[] = [];

  const ingOf = (r: BRow): string[] => {
    if (Array.isArray(r.ingredients) && r.ingredients.length) return r.ingredients;
    if (opt.menuToIng && Array.isArray(r.menus)) {
      const set = new Set<string>();
      for (const mu of r.menus) for (const ing of opt.menuToIng(mu) || []) if (ing) set.add(ing);
      return [...set];
    }
    return [];
  };

  for (let t = days; t >= 1; t--) {
    const today = addD(fam.base, -(t - 1));
    const win = rows.filter((r) => { const a = dayDiff(today, r.log_date); return a >= 1 && a <= windowDays; });
    // 신호: 28일 창 식재료를 '날짜별' 묶음으로 → computeGroupSignals
    const byDay: Record<string, Set<string>> = {};
    for (const r of win) { (byDay[r.log_date] ||= new Set()); ingOf(r).forEach((x) => byDay[r.log_date].add(x)); }
    const ingDays = Object.values(byDay).map((s) => [...s]);
    const recordedDays = ingDays.length;
    const { signals } = computeGroupSignals(ingDays.length ? ingDays : [[]]);

    // liked 판정용 끼니 행(식재료 단위로 펼침 — place/ate_well/refused 보존)
    const meals: MealRow[] = [];
    for (const r of win) for (const ing of ingOf(r)) {
      meals.push({ food: ing, place: r.place ?? null, ateWell: r.ate_well ?? null, refused: !!r.refused, daysAgo: dayDiff(today, r.log_date), slot: r.slot ?? null });
    }

    const m = selectDailyMaterials({
      signals, meals, favoriteFoods, recentRecos: recent,
      recordedDays: opt.recordedDaysMin != null ? Math.max(recordedDays, opt.recordedDaysMin) : recordedDays,
      onboardingMeta: { hasHeight: true, hasWeight: true, hasConditions: true }, tipSeed: 1,
    });
    materialsOut.push(m);

    if (m.mode === 'onboarding' || !m.recommendedIng) {
      out.push({ date: today, target: m.targetGroup, material: m.recommendedIng, combo: null, mirror: null, quality: [] });
      continue;   // 온보딩·결핍 없음 = 추천 없음(회전 이력 갱신 안 함 — null 끼워넣지 않음)
    }

    const comboInput = m.validatedCombos.map((c) => ({ dish: c.liked, ingredient: c.deficient, score: c.score }));
    const periodFact = m.deficiencyWindow
      ? `${m.deficiencyWindow.group} 최근 7일 중 ${m.deficiencyWindow.daysOf7}일(권장 주 ${m.deficiencyWindow.threshold}일)`
      : '';
    const matInput = { target: m.targetGroup || '', targetIngredient: m.recommendedIng, combos: comboInput, rationale: m.reasonPhrases.join(' '), periodFact, cousins: [] };
    // mirror = 전체 직렬화(검사 입력 + 검수 가독). 품질 스캔은 '사용자 노출 음식 표면'(구조화된 조합·기간·타깃)만:
    //   근거 문구(rationale)는 LLM '입력 힌트'(서술 prose)이지 발행 음식명이 아니다 — offMaterialFood의
    //   DISH_SUFFIX가 '도전(challenge)' 등 동음 명사를 음식명으로 과탐하는 입구라 가드 입력에서 제외(라이브 무수정·하네스 경계).
    const mirror = serializeMaterials(matInput);
    const qualityInput = serializeMaterials({ ...matInput, rationale: '' });
    const materialFoods = materialFoodsOf({ target: m.targetGroup || '', targetIngredient: m.recommendedIng, combos: comboInput, rationale: '', periodFact: '' });
    const quality = qualityScan({ letter: qualityInput, materialFoods });
    // 최상위 검증 조합(있으면). combo.ok = 엔진 검증 점수(score>=2) — 표시형(staple display, 예 귀리→오트밀)이
    //   matrix 키가 아니라 재스코어하면 false 오탐이 나므로, 엔진이 원재료로 매긴 검증 점수를 신뢰한다.
    const top = m.validatedCombos[0] || null;
    const combo = top ? { dish: top.liked, ingredient: top.deficient, ok: top.score >= 2 } : null;

    out.push({ date: today, target: m.targetGroup, material: m.recommendedIng, combo, mirror, quality });
    recent = [m.recommendedIng, ...recent].filter(Boolean).slice(0, 3);   // 직전 3일 창(수렴 방지)
  }

  return { days: out, materials: materialsOut };
}

// ── B축 리플레이 지표(H-13) — v3 replayMetrics와 별개 ─────────────────────────────
export type BReplayReport = {
  letters: number;
  miscombo: number;            // combo.ok===false 건수 — 목표 0(괴식 차단 검증)
  adjacentSame: number;        // material[i]===material[i-1] 건수 — 목표 0(수렴 방지 핵심)
  materialRepeat3d: number;    // 직전 3일 창에 같은 추천 재등장 — 목표 0
  qualityViolations: number;   // quality.length 합 — 목표 0(품질축 봉합)
  materialDiversity: number;   // 고유 추천 식재료 종 수(다양성 sanity)
};

/** BReplayDay[]에서 괴식·수렴·재사용·품질·다양성을 집계(순수·LLM 0콜). 추천 없는 날(material null)은 시계열에서 제외. */
export function bReplayMetrics(days: BReplayDay[]): BReplayReport {
  const seq = [...(days || [])].sort((a, b) => a.date.localeCompare(b.date));
  const mats = seq.map((d) => d.material).filter((x): x is string => !!x);   // 추천 있는 날만 시계열
  let miscombo = 0;
  let qualityViolations = 0;
  for (const d of seq) {
    if (d.combo && d.combo.ok === false) miscombo++;
    qualityViolations += (d.quality || []).length;
  }
  let adjacentSame = 0;
  for (let i = 1; i < mats.length; i++) if (mats[i] === mats[i - 1]) adjacentSame++;
  let materialRepeat3d = 0;
  for (let i = 0; i < mats.length; i++) {
    const window = mats.slice(Math.max(0, i - 2), i);   // 직전 2개(=3일 창: 자신 포함 3)
    if (window.includes(mats[i])) materialRepeat3d++;
  }
  return {
    letters: seq.length,
    miscombo,
    adjacentSame,
    materialRepeat3d,
    qualityViolations,
    materialDiversity: new Set(mats).size,
  };
}

/** H-10 — Letter B 컷오버 0 게이트(미달 사유 문자열[] — 빈 배열 = 통과). 기존 cutoverGate(v3)와 병존. */
export function bCutoverGate(r: BReplayReport): string[] {
  const fails: string[] = [];
  if (r.miscombo > 0) fails.push(`괴식 조합 ${r.miscombo}건(목표 0)`);
  if (r.adjacentSame > 0) fails.push(`인접일 동일 추천(수렴) ${r.adjacentSame}건(목표 0)`);
  if (r.materialRepeat3d > 0) fails.push(`3일 창 추천 재사용 ${r.materialRepeat3d}건(목표 0)`);
  if (r.qualityViolations > 0) fails.push(`품질 위반 ${r.qualityViolations}건(목표 0)`);
  return fails;
}
