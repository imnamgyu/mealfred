/**
 * lib/progress.ts — 편식 '효과 측정'(CEBQ-lite) + BMI 급변 감지.
 *
 * 설문 없이 meal_logs/growth_logs 기록만으로 추정. 최근 28일 vs 직전 28일을 비교해
 * "편식이 좋아지는 중인지"를 수치로 보여준다(리텐션·증명용). CEBQ Food Fussiness/Enjoyment/Slowness 프록시.
 */

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n)).toISOString().slice(0, 10);
}

export type ProgressRow = {
  log_date: string;
  ingredients: string[] | null;
  refused: string | null;
  ate_well: boolean | null;
  duration_min: number | null;
};

type Agg = { variety: number; refusalPct: number; enjoyPct: number | null; avgDur: number | null; entries: number };

function agg(rows: ProgressRow[]): Agg {
  const freq: Record<string, number> = {};
  const refusedFoods = new Set<string>();
  let refusedEntries = 0, ateT = 0, ateF = 0, durSum = 0, durN = 0;
  rows.forEach((r) => {
    (r.ingredients || []).forEach((i) => { freq[i] = (freq[i] || 0) + 1; });
    if (r.refused) { refusedEntries++; refusedFoods.add(r.refused); }
    if (r.ate_well === true) ateT++; else if (r.ate_well === false) ateF++;
    if (r.duration_min) { durSum += r.duration_min; durN++; }
  });
  const entries = rows.length;
  return {
    variety: Object.keys(freq).filter((i) => freq[i] >= 2 && !refusedFoods.has(i)).length,  // '잘 먹는' = 2회+·비거부
    refusalPct: entries ? Math.round((refusedEntries / entries) * 100) : 0,
    enjoyPct: (ateT + ateF) ? Math.round((ateT / (ateT + ateF)) * 100) : null,
    avgDur: durN ? Math.round(durSum / durN) : null,
    entries,
  };
}

// ── 기간 요약(병원 차트) ─────────────────────────────────────────────────────
export type PeriodMetrics = { variety: number; refusalPct: number; enjoyPct: number | null; avgDur: number | null; entries: number };

/** 'YYYY-MM-DD' → ISO 주차 키 'YYYY-Www'. */
export function isoWeekKey(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const day = dt.getUTCDay() || 7;           // 월=1..일=7
  dt.setUTCDate(dt.getUTCDate() + 4 - day);   // 그 주 목요일
  const yStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((dt.getTime() - yStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}
/** 'YYYY-MM-DD' → 'YYYY-MM'. */
export function monthKey(ymd: string): string { return ymd.slice(0, 7); }

/** 기간 행들의 요약 지표(잘 먹는 다양성·거부율·완식률·식사속도). */
export function periodMetrics(rows: ProgressRow[]): PeriodMetrics {
  const a = agg(rows);
  return { variety: a.variety, refusalPct: a.refusalPct, enjoyPct: a.enjoyPct, avgDur: a.avgDur, entries: a.entries };
}

export type ProgressMetric = { key: string; label: string; recent: number; prior: number; unit: string; betterUp: boolean; improved: boolean };
export type ProgressResult = { hasComparison: boolean; metrics: ProgressMetric[]; improved: number; total: number; verdict: string };

/** 최근 28일 vs 직전 28일. todayStr = kstToday(). */
export function computeProgress(rows: ProgressRow[], todayStr: string): ProgressResult {
  const recentStart = addDays(todayStr, -27);
  const priorStart = addDays(todayStr, -55);
  const priorEnd = addDays(todayStr, -28);
  const recent = agg(rows.filter((r) => r.log_date >= recentStart && r.log_date <= todayStr));
  const prior = agg(rows.filter((r) => r.log_date >= priorStart && r.log_date <= priorEnd));
  const hasComparison = prior.entries >= 3 && recent.entries >= 3;

  const metrics: ProgressMetric[] = [];
  const add = (key: string, label: string, r: number | null, p: number | null, unit: string, betterUp: boolean) => {
    if (r == null || p == null) return;
    metrics.push({ key, label, recent: r, prior: p, unit, betterUp, improved: betterUp ? r > p : r < p });
  };
  add('variety', '잘 먹는 식재료', recent.variety, prior.variety, '종', true);
  add('refusal', '거부 비율', recent.refusalPct, prior.refusalPct, '%', false);
  add('enjoy', '완식 비율', recent.enjoyPct, prior.enjoyPct, '%', true);
  add('dur', '식사 시간', recent.avgDur, prior.avgDur, '분', false);

  const improved = metrics.filter((m) => m.improved).length;
  const total = metrics.length;
  let verdict = '기록이 더 쌓이면 변화가 보여요';
  if (hasComparison && total) {
    verdict = improved >= Math.ceil(total / 2) + (total > 2 ? 1 : 0) ? '편식이 좋아지는 중이에요 👏'
      : improved === 0 ? '지난달과 비슷해요 — 한 걸음씩 가요'
        : '조금씩 나아지고 있어요';
  }
  return { hasComparison, metrics, improved, total, verdict };
}

// ── BMI 급변 감지 ───────────────────────────────────────────────────────────
export type BmiPoint = { measured_on: string; pct: number | null };
export type BmiTrend = { flag: boolean; delta: number; from: number; to: number; note: string } | null;

/** 최근 두 측정의 또래 퍼센타일 변화. |Δ|≥15p면 급변 플래그(비알람 톤). pct는 호출부에서 측정 시점 월령으로 계산해 전달. */
export function bmiTrend(points: BmiPoint[]): BmiTrend {
  const pts = points.filter((p) => p.pct != null).sort((a, b) => (a.measured_on < b.measured_on ? -1 : 1));
  if (pts.length < 2) return null;
  const to = pts[pts.length - 1].pct as number;
  const from = pts[pts.length - 2].pct as number;
  const delta = Math.round(to - from);
  return { flag: Math.abs(delta) >= 15, delta, from: Math.round(from), to: Math.round(to),
    note: delta > 0 ? '최근 또래 대비 체중이 빠르게 늘었어요' : '최근 또래 대비 체중이 빠르게 줄었어요' };
}
