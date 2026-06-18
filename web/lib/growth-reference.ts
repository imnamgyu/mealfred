/**
 * lib/growth-reference.ts — 성장도표 LMS (신장·체중·BMI for-age). ⭐국내 정본 (KDCA 2017)
 *
 * 정본: 질병관리청 「2017 소아청소년 성장도표」 '성장도표 데이터 테이블.xls'
 *   (knhanes.kdca.go.kr/knhanes/grtcht → 성장도표 다운로드 dataNo=7) → lib/kdca-growth-lms.json.
 *   이 표는 0~35개월(만3세 미만)에 WHO 기준을, 36개월+에 국내 기준을 이미 병합한 완성본.
 *     - 신장(height)·체중(weight): 0~227개월 (남/여 각 228행)
 *     - 체질량지수(BMI): 24~227개월 (남/여 각 204행)
 *   ⚠️ KDCA는 24개월 미만 BMI-for-age를 정의하지 않음(신장별체중 사용) → 영아 BMI는
 *     WHO BMI-for-age(아래 BMI_LMS, 0~35개월)로 폴백. 신장·체중은 0개월부터 정본 사용.
 *   검증: LMS→percentile 역산이 KDCA 공식 percentile과 일치(tests/growth-reference.test.ts).
 *     · BMI 남5세 M15.92→P50 / 신장 남5세 P3=101.6·P97=118 / 체중 남5세 P3=15.4·P97=24.3.
 *
 * 퍼센타일: z = ((X/M)^L − 1)/(L·S),  percentile = Φ(z)·100
 */
import KDCA from './kdca-growth-lms.json';
export type Sex = 'M' | 'F';
type LmsRow = { m: number; L: number; M: number; S: number };
type Metric = { boys: LmsRow[]; girls: LmsRow[] };
const G = KDCA as { height: Metric; weight: Metric; bmi: Metric };

const table = (metric: Metric, sex: Sex): LmsRow[] => (sex === 'M' ? metric.boys : metric.girls);

/** 월령으로 LMS 선형보간. 표 범위 밖은 양끝 클램프. 빈 표면 null. (행 간격 불규칙해도 안전) */
function lmsAt(rows: LmsRow[], ageMonths: number): [number, number, number] | null {
  if (!rows || rows.length === 0) return null;
  const m = Math.max(rows[0].m, Math.min(rows[rows.length - 1].m, ageMonths));
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1].m <= m) i++;
  const a = rows[i], b = rows[i + 1] || a;
  const span = (b.m - a.m) || 1, f = (m - a.m) / span;
  return [a.L + (b.L - a.L) * f, a.M + (b.M - a.M) * f, a.S + (b.S - a.S) * f];
}

const zFromLms = (x: number, [L, M, S]: [number, number, number]): number =>
  Math.abs(L) > 1e-9 ? (Math.pow(x / M, L) - 1) / (L * S) : Math.log(x / M) / S;

// WHO BMI-for-age LMS (0~35개월) — KDCA가 만3세 미만에 채택. 24개월 미만 BMI 폴백 전용.
// index = 개월(0..35), 값 = [L, M, S]
export const BMI_LMS: Record<Sex, [number, number, number][]> = {
  M: [
  [-0.3053, 13.4069, 0.0956],
  [0.2738, 14.914, 0.09035],
  [0.1113, 16.3231, 0.08676],
  [0.0077, 16.895, 0.08496],
  [-0.0732, 17.1594, 0.08378],
  [-0.1366, 17.2914, 0.08297],
  [-0.1919, 17.3424, 0.08233],
  [-0.2384, 17.3289, 0.08183],
  [-0.2808, 17.2633, 0.08139],
  [-0.3177, 17.1659, 0.08102],
  [-0.3512, 17.0503, 0.08068],
  [-0.383, 16.9231, 0.08037],
  [-0.4113, 16.7992, 0.08009],
  [-0.4384, 16.6731, 0.07982],
  [-0.4629, 16.5553, 0.07958],
  [-0.4867, 16.4393, 0.07934],
  [-0.5082, 16.3335, 0.07913],
  [-0.5286, 16.2343, 0.07893],
  [-0.5485, 16.1388, 0.07873],
  [-0.5667, 16.0536, 0.07854],
  [-0.5847, 15.9737, 0.07836],
  [-0.6013, 15.9043, 0.07818],
  [-0.6176, 15.8405, 0.07802],
  [-0.6328, 15.7853, 0.07786],
  [-0.6473, 15.7356, 0.07771],
  [-0.584, 15.9799, 0.07792],
  [-0.5501, 15.9418, 0.07799],
  [-0.5164, 15.9034, 0.07809],
  [-0.4853, 15.867, 0.07818],
  [-0.4549, 15.8303, 0.07829],
  [-0.4275, 15.7954, 0.07841],
  [-0.4013, 15.7601, 0.07854],
  [-0.3782, 15.7267, 0.07867],
  [-0.3575, 15.6939, 0.07882],
  [-0.3388, 15.6609, 0.07897],
  [-0.3233, 15.6297, 0.07913],
],
  F: [
  [-0.0631, 13.3363, 0.09272],
  [0.3481, 14.5422, 0.09559],
  [0.1743, 15.7713, 0.09371],
  [0.0652, 16.3531, 0.09255],
  [-0.0197, 16.6722, 0.09166],
  [-0.086, 16.8379, 0.09096],
  [-0.1436, 16.9086, 0.09035],
  [-0.1915, 16.9021, 0.08984],
  [-0.2351, 16.839, 0.08938],
  [-0.2726, 16.7404, 0.08898],
  [-0.3064, 16.62, 0.08862],
  [-0.3382, 16.4867, 0.08827],
  [-0.3665, 16.3578, 0.08797],
  [-0.3934, 16.2298, 0.08768],
  [-0.4176, 16.1132, 0.08741],
  [-0.441, 16.0013, 0.08716],
  [-0.4623, 15.9017, 0.08693],
  [-0.4823, 15.8108, 0.08671],
  [-0.5018, 15.726, 0.0865],
  [-0.5197, 15.6524, 0.08631],
  [-0.5374, 15.585, 0.08611],
  [-0.5536, 15.5281, 0.08594],
  [-0.5697, 15.4782, 0.08576],
  [-0.5846, 15.4381, 0.0856],
  [-0.5989, 15.4052, 0.08545],
  [-0.5684, 15.6589, 0.08452],
  [-0.5684, 15.6311, 0.08449],
  [-0.5684, 15.6036, 0.08446],
  [-0.5684, 15.5779, 0.08444],
  [-0.5684, 15.5521, 0.08443],
  [-0.5684, 15.5277, 0.08444],
  [-0.5684, 15.503, 0.08448],
  [-0.5684, 15.4798, 0.08455],
  [-0.5684, 15.4575, 0.08467],
  [-0.5684, 15.4355, 0.08484],
  [-0.5684, 15.4157, 0.08506],
],
};

// 표준정규 CDF (Abramowitz–Stegun erf 근사, 오차 ~1e-7)
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function normCdf(z: number): number { return 0.5 * (1 + erf(z / Math.SQRT2)); }
const toPct = (z: number | null): number | null => (z === null ? null : Math.max(0.1, Math.min(99.9, normCdf(z) * 100)));

/** BMI(=kg/m²) → BMI-for-age z. 24개월+=KDCA 2017(정본)·24개월 미만=WHO 폴백. 무효 입력 null. */
export function bmiZ(bmi: number, sex: Sex, ageMonths: number): number | null {
  if (!(bmi > 0)) return null;
  if (ageMonths >= 24) {
    const lms = lmsAt(table(G.bmi, sex), ageMonths);
    return lms ? zFromLms(bmi, lms) : null;
  }
  // 24개월 미만 — WHO BMI-for-age(0~35개월) 폴백
  const tab = BMI_LMS[sex]; if (!tab) return null;
  const m = Math.max(0, Math.min(35, ageMonths));
  const lo = Math.floor(m), hi = Math.min(35, lo + 1), f = m - lo;
  const it = (i: number) => tab[lo][i] + (tab[hi][i] - tab[lo][i]) * f;
  return zFromLms(bmi, [it(0), it(1), it(2)]);
}

/** 신장(cm) → 신장-for-age z. KDCA 2017 정본(0~227개월). 무효 입력 null. */
export function heightZ(heightCm: number, sex: Sex, ageMonths: number): number | null {
  if (!(heightCm > 0)) return null;
  const lms = lmsAt(table(G.height, sex), ageMonths);
  return lms ? zFromLms(heightCm, lms) : null;
}

/** 체중(kg) → 체중-for-age z. KDCA 2017 정본(0~227개월). 무효 입력 null. */
export function weightZ(weightKg: number, sex: Sex, ageMonths: number): number | null {
  if (!(weightKg > 0)) return null;
  const lms = lmsAt(table(G.weight, sex), ageMonths);
  return lms ? zFromLms(weightKg, lms) : null;
}

/** BMI 또래 퍼센타일(0.1~99.9). 입력 무효 시 null. */
export function bmiPercentile(bmi: number, sex: Sex, ageMonths: number): number | null {
  return toPct(bmiZ(bmi, sex, ageMonths));
}
/** 신장 또래 퍼센타일(0.1~99.9). */
export function heightPercentile(heightCm: number, sex: Sex, ageMonths: number): number | null {
  return toPct(heightZ(heightCm, sex, ageMonths));
}
/** 체중 또래 퍼센타일(0.1~99.9). */
export function weightPercentile(weightKg: number, sex: Sex, ageMonths: number): number | null {
  return toPct(weightZ(weightKg, sex, ageMonths));
}

export type BmiBand = '저체중' | '정상' | '과체중' | '비만';
/** 질병관리청 2017 소아청소년 비만 기준 퍼센타일 컷오프. */
export function bmiBand(pct: number): BmiBand {
  if (pct < 5) return '저체중';
  if (pct < 85) return '정상';
  if (pct < 95) return '과체중';
  return '비만';
}

/** 퍼센타일 → 부모가 읽는 평이한 체격 위치('%ile' 용어 제거). */
export function bmiPhrase(pct: number): string {
  if (pct < 5) return '또래보다 가벼운 편';
  if (pct < 25) return '또래보다 약간 가벼운 편';
  if (pct < 75) return '또래 평균 정도';
  if (pct < 85) return '또래보다 약간 묵직한 편';
  if (pct < 95) return '또래보다 묵직한 편';
  return '또래보다 많이 묵직한 편';
}

/** 신장 또래 위치 표현. */
export function heightPhrase(pct: number): string {
  if (pct < 3) return '또래보다 많이 작은 편';
  if (pct < 15) return '또래보다 작은 편';
  if (pct < 85) return '또래 평균 정도';
  if (pct < 97) return '또래보다 큰 편';
  return '또래보다 많이 큰 편';
}

/** 저신장 의심(3rd 미만) — 성장 더딤 신호용. */
export function isShortStature(pct: number): boolean { return pct < 3; }

/**
 * 성장 추세: 이전 신장(또는 체중) 퍼센타일 대비 하향 교차 폭(%p).
 * 성장곡선 이탈/성장 더딤 판단용. 시계열 보관은 호출측(아이 현황 스토어)이 담당.
 */
export function percentileDrop(prevPct: number | null | undefined, curPct: number | null | undefined): number {
  if (prevPct == null || curPct == null) return 0;
  return Math.max(0, prevPct - curPct);
}

export function bmiOf(heightCm: number, weightKg: number): number | null {
  if (!(heightCm > 0) || !(weightKg > 0)) return null;
  const h = heightCm / 100;
  return weightKg / (h * h);
}

// ── 성장곡선 추종도 (백분위 채널 추종) ────────────────────────────────────────
// 표준정규 역함수(probit) — Acklam 유리근사, |오차|<1.2e-9 (0<p<1)
function invNormCdf(p: number): number {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
const valueFromLms = (z: number, [L, M, S]: [number, number, number]): number =>
  Math.abs(L) > 1e-9 ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);

/** percentile(0.1~99.9)에 해당하는 신장(cm). 채널 추종 기대치 산출용. */
export function heightAtPercentile(pct: number, sex: Sex, ageMonths: number): number | null {
  const lms = lmsAt(table(G.height, sex), ageMonths);
  return lms ? valueFromLms(invNormCdf(Math.max(0.1, Math.min(99.9, pct)) / 100), lms) : null;
}
/** percentile(0.1~99.9)에 해당하는 체중(kg). */
export function weightAtPercentile(pct: number, sex: Sex, ageMonths: number): number | null {
  const lms = lmsAt(table(G.weight, sex), ageMonths);
  return lms ? valueFromLms(invNormCdf(Math.max(0.1, Math.min(99.9, pct)) / 100), lms) : null;
}

export type GrowthStatus = '양호' | '주의' | '경고' | '정보부족';
export type GrowthTrack = {
  metric: 'height' | 'weight';
  baselinePct: number;   // 첫 측정(기준) 백분위
  currentPct: number;    // 현재 백분위
  zDrift: number;        // 현재 z − 기준 z (음수 = 자기 채널 하향 이탈)
  expected: number;      // 기준 채널 유지 시 현재 월령 기대치
  actual: number;
  gapMonths: number;
  score: number;         // 0~100 채널 추종도(하향 이탈만 감점)
  status: GrowthStatus;
};

/**
 * 성장곡선 추종도 — 첫 측정으로 그 아이의 '백분위 채널'을 잡고, 이후 측정이 그 채널을
 * 유지하는지 점수화. 절대 위치(큼/작음)가 아니라 '자기 곡선을 따라가는가'가 핵심.
 * 채널 변화는 z(표준편차점수, SDS)로 측정: 한 단계(≈0.67 SDS) 하향=주의, 두 단계(≈1.34)=경고.
 * ⚠️ 가정 측정은 노이즈가 큼 → 최소 간격(기본 1개월) 미만이면 '정보부족'으로 판단 보류.
 *    엔진은 단발 하락으로 단정하지 말고 추세(여러 측정)·평활화와 함께 사용할 것.
 */
export function growthTracking(
  baseline: { value: number; ageMonths: number },
  current: { value: number; ageMonths: number },
  sex: Sex, metric: 'height' | 'weight', minGapMonths = 1,
): GrowthTrack | null {
  const zf = metric === 'height' ? heightZ : weightZ;
  const pf = metric === 'height' ? heightPercentile : weightPercentile;
  const bz = zf(baseline.value, sex, baseline.ageMonths);
  const cz = zf(current.value, sex, current.ageMonths);
  const bp = pf(baseline.value, sex, baseline.ageMonths);
  const cp = pf(current.value, sex, current.ageMonths);
  if (bz === null || cz === null || bp === null || cp === null) return null;
  const gap = current.ageMonths - baseline.ageMonths;
  const lms = lmsAt(table(metric === 'height' ? G.height : G.weight, sex), current.ageMonths);
  const expected = lms ? valueFromLms(bz, lms) : current.value;   // 기준 z 유지 시 기대치
  const zDrift = cz - bz;
  const status: GrowthStatus = gap < minGapMonths ? '정보부족'
    : zDrift <= -1.34 ? '경고' : zDrift <= -0.67 ? '주의' : '양호';
  const score = Math.max(0, Math.min(100, Math.round(100 + Math.min(0, zDrift) * 45)));
  return { metric, baselinePct: bp, currentPct: cp, zDrift, expected, actual: current.value, gapMonths: gap, score, status };
}
