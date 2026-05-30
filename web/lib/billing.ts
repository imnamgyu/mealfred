/**
 * 과금 + 바이럴(초대) 엔진
 *
 * 정책(2026-06~):
 *   - 가입 후 1개월 무조건 무료(trial).
 *   - 내 전용 초대링크로 5명 이상 '방문'(가입 불필요)하면 아이 1명 평생 무료(lifetime).
 *   - 그 외에는 아이 1명당 월 1,900원.
 *
 * 결제(PG) 연동 전이라 상태 "계산 + 표기"만. 방문 카운트는 referrals/referral_visits(서비스 로우).
 */

export const MONTHLY_PRICE = 1900;            // 아이 1명당 월 구독료(원)
export const FREE_TRIAL_DAYS = 30;            // 가입 후 무조건 무료 일수
export const REFERRAL_GOAL = 5;               // 이만큼 방문하면 평생 무료

export type ReferralBilling = {
  plan: 'lifetime_free' | 'trial' | 'paid';
  freeUntil: string | null;     // trial 종료일 (lifetime은 null)
  daysLeft: number | null;
  visits: number;
  goal: number;
  label: string;
};

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * 초대 방문수 + 가입시각 → 과금 상태.
 * createdAtISO: referrals.created_at(가입≈최초 사용 앵커). todayStr: kstToday().
 */
export function referralBilling(createdAtISO: string | null | undefined, visits: number, todayStr: string): ReferralBilling {
  const goal = REFERRAL_GOAL;
  const need = Math.max(0, goal - visits);
  if (visits >= goal) {
    return { plan: 'lifetime_free', freeUntil: null, daysLeft: null, visits, goal, label: '🎉 평생 무료 — 초대 5명 달성!' };
  }
  const start = (createdAtISO || '').slice(0, 10) || todayStr;
  const fu = addDays(start, FREE_TRIAL_DAYS);
  const days = Math.round((Date.parse(fu) - Date.parse(todayStr)) / 86400000);
  if (days >= 0) {
    return { plan: 'trial', freeUntil: fu, daysLeft: days, visits, goal, label: `무료 체험 ${days}일 남음 · 친구 ${need}명만 더 방문하면 평생 무료` };
  }
  return { plan: 'paid', freeUntil: fu, daysLeft: days, visits, goal, label: `무료 체험 종료 · 월 ${MONTHLY_PRICE.toLocaleString()}원 (친구 ${need}명 방문 시 평생 무료)` };
}

export const PROMO_DEADLINE = '2026-06-30';   // (legacy) 출생연도 기반 프로모 — 아래 함수에서만 사용

/**
 * 초등 2학년 졸업 시점(무료 종료일) 계산.
 * 한국 초등 입학 = 만 6세가 되는 해의 "다음 해" 3월 → 입학연도 ≈ 출생연도 + 7.
 * 초2 졸업 = 입학연도 + 2 = 출생연도 + 9, 2월 말.
 */
export function freeUntil(birthYear: number | null | undefined): string | null {
  if (!birthYear) return null;
  return `${birthYear + 9}-02-28`;
}

export type Billing = {
  plan: 'promo_free' | 'paid' | 'unknown';
  freeUntil: string | null;     // YYYY-MM-DD
  daysLeft: number | null;      // 무료 종료까지 남은 일수(음수면 만료)
  label: string;                // 사람이 읽는 한 줄 표기
};

/**
 * 자녀 출생연도 + 오늘(KST today, 'YYYY-MM-DD') → 과금 상태.
 * todayStr은 호출부에서 kstToday()로 주입(서버/클라 앵커 일치).
 */
export function billingOf(birthYear: number | null | undefined, todayStr: string): Billing {
  const fu = freeUntil(birthYear);
  if (!fu) return { plan: 'unknown', freeUntil: null, daysLeft: null, label: '아이 생일을 입력하면 무료 기간이 표시돼요' };
  const days = Math.round((Date.parse(fu) - Date.parse(todayStr)) / 86400000);
  const yr = fu.slice(0, 4);
  if (days >= 0) {
    return {
      plan: 'promo_free', freeUntil: fu, daysLeft: days,
      label: `✨ 초등학교 2학년 졸업할 때까지 무료 · ~${yr}.02`,
    };
  }
  return {
    plan: 'paid', freeUntil: fu, daysLeft: days,
    label: `무료 기간이 끝났어요 · 월 ${MONTHLY_PRICE.toLocaleString()}원`,
  };
}
