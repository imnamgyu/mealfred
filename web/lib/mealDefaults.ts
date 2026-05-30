/**
 * 식단입력 패턴 prefill — 끼니(slot) × 주중/주말별로 과거 입력의 최빈값을 뽑아
 * 새 입력 폼의 장소·시간·식감을 미리 채운다(부모는 토글로 덮어쓸 수 있음).
 *
 * 식단은 주기성·패턴성이 강해서(평일 점심은 늘 기관 12시, 주말 아침은 집 8시 등)
 * 끼니·요일타입으로 쪼개면 prefill 적중률(=부모가 그대로 확정할 확률)이 높아진다.
 *
 * 순수 함수 — 클라이언트(/care)에서 본인 기록으로 즉시 계산하거나,
 * 새벽 크론이 미리 계산해 저장(children.meal_defaults)하는 데 함께 쓴다.
 */

export type DayType = 'weekday' | 'weekend';

/** 'YYYY-MM-DD'(KST) → 주중/주말. 시간성분 없이 로컬 자정으로 파싱(tz 이동 없음). */
export function dayTypeOf(dateStr: string): DayType {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return 'weekday';
  const dow = new Date(y, m - 1, d).getDay();   // 0=일 … 6=토
  return dow === 0 || dow === 6 ? 'weekend' : 'weekday';
}

export type SlotDefault = {
  place?: string | null; mealTime?: number | null; texture?: string | null;
  autonomy?: string | null; environment?: string | null; durationMin?: number | null;
};
export type MealDefaults = Record<string, Partial<Record<DayType, SlotDefault>>>; // slot → daytype → 최빈값

type HistRow = {
  slot: string; log_date: string; place?: string | null; meal_time?: number | null; texture?: string | null;
  autonomy?: string | null; environment?: string | null; duration_min?: number | null;
};

// 최빈값(가장 자주 나온 값) — 동률이면 먼저 본 값. null/빈값은 무시.
function mode<T>(vals: (T | null | undefined)[]): T | null {
  const cnt = new Map<T, number>();
  for (const v of vals) { if (v === null || v === undefined || v === '') continue; cnt.set(v, (cnt.get(v) || 0) + 1); }
  let best: T | null = null, bestN = 0;
  for (const [v, n] of cnt) { if (n > bestN) { best = v; bestN = n; } }
  return best;
}

/**
 * 과거 식단 행들 → 끼니×요일타입별 최빈 장소/시간/식감.
 * 표본이 너무 적은(1건) 칸도 일단 채운다(없는 것보단 단서가 됨).
 */
export function computeMealDefaults(rows: HistRow[]): MealDefaults {
  const bucket = new Map<string, HistRow[]>();   // `${slot}|${daytype}`
  for (const r of rows) {
    if (!r.slot || !r.log_date) continue;
    const k = `${r.slot}|${dayTypeOf(r.log_date)}`;
    (bucket.get(k) || bucket.set(k, []).get(k)!).push(r);
  }
  const out: MealDefaults = {};
  for (const [k, rs] of bucket) {
    const [slot, dt] = k.split('|') as [string, DayType];
    (out[slot] ||= {})[dt] = {
      place: mode(rs.map((r) => r.place)),
      mealTime: mode(rs.map((r) => r.meal_time)),
      texture: mode(rs.map((r) => r.texture)),
      autonomy: mode(rs.map((r) => r.autonomy)),
      environment: mode(rs.map((r) => r.environment)),
      durationMin: mode(rs.map((r) => r.duration_min)),
    };
  }
  return out;
}

/** prefill 값 조회 — 해당 끼니의 (요일타입 → 없으면 반대 요일타입) 순으로 폴백. */
export function pickDefault(defaults: MealDefaults | null | undefined, slot: string, dateStr: string): SlotDefault {
  if (!defaults?.[slot]) return {};
  const dt = dayTypeOf(dateStr);
  const other: DayType = dt === 'weekday' ? 'weekend' : 'weekday';
  const here = defaults[slot][dt] || {};
  const back = defaults[slot][other] || {};
  return {
    place: here.place ?? back.place ?? null,
    mealTime: here.mealTime ?? back.mealTime ?? null,
    texture: here.texture ?? back.texture ?? null,
    autonomy: here.autonomy ?? back.autonomy ?? null,
    environment: here.environment ?? back.environment ?? null,
    durationMin: here.durationMin ?? back.durationMin ?? null,
  };
}
