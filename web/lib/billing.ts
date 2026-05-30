/**
 * 과금 토대 (M-billing 골격)
 *
 * 정책(2026-06 성장 프로모):
 *   - 6월 중 가입 → 아이가 "초등학교 2학년 졸업"할 때까지 무료.
 *   - 이후 아이 1명당 월 1,900원.
 *
 * 지금은 결제(PG) 연동 전이라 무료기간 "계산 + 표기"만. 실제 구독/청구는 토스페이먼츠 연동 시 추가.
 * 무료 종료일은 자녀 출생연도로 결정되므로 별도 테이블 없이 순수 계산으로 산출한다.
 * (구독 상태/영수증이 필요해지면 subscriptions 테이블을 그때 도입 — sql/ 참고 주석)
 */

export const MONTHLY_PRICE = 1900;            // 아이 1명당 월 구독료(원)
export const PROMO_DEADLINE = '2026-06-30';   // 이 날까지 가입 시 프로모 적용

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
