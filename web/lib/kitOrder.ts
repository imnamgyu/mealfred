/**
 * lib/kitOrder.ts — 편식키트 사전예약 도메인 로직 (검증·포인트 할인 상한).
 * 사전예약 = 결제 아님. 포인트는 신청 시 '사용 의사'만 기록하고 실제 차감은 확정 시(redeem_kit RPC).
 * 골고루 주 19,900원은 베타 잠정가(이사님 2026-05-31 결정) — 집중 키트는 가격 미확정이라 표기·할인 없음.
 */

export const GOLLO_WEEK_PRICE = 19_900;   // 주 1회 배송분(베타 잠정가) — 사전예약 1건 = 첫 주 배송분 기준

export const FOCUS_COURSES = ['당근', '양파', '두부', '버섯', '브로콜리', '시금치', '토마토', '파프리카', '가지'] as const;
export type FocusCourse = (typeof FOCUS_COURSES)[number];

export type KitType = 'gollo' | 'focus';

export type KitOrderInput = {
  kit_type: KitType;
  course: FocusCourse | null;   // focus만 필수
  recipient_name: string;
  phone: string;                // 정규화: 숫자만(01012345678)
  address: string;
  use_points: number;           // 신청자가 요청한 할인 포인트(서버에서 잔액·가격으로 재상한)
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  requested: '접수됨',
  confirmed: '확정 · 배송 준비',
  cancelled: '취소됨',
  fulfilled: '배송 완료',
};

/** 휴대폰 입력 정규화 — 숫자만 남겨 01로 시작하는 10~11자리만 허용. 실패 시 null. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return /^01\d{8,9}$/.test(digits) ? digits : null;
}

/** 사전예약 payload 검증·정규화. 실패 시 null (필드별 이유는 클라가 안내). */
export function validateKitOrder(body: unknown): KitOrderInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const kit_type = b.kit_type;
  if (kit_type !== 'gollo' && kit_type !== 'focus') return null;

  let course: FocusCourse | null = null;
  if (kit_type === 'focus') {
    if (typeof b.course !== 'string' || !(FOCUS_COURSES as readonly string[]).includes(b.course)) return null;
    course = b.course as FocusCourse;
  }

  const recipient_name = typeof b.recipient_name === 'string' ? b.recipient_name.trim() : '';
  if (recipient_name.length < 1 || recipient_name.length > 40) return null;

  const phone = normalizePhone(b.phone);
  if (!phone) return null;

  const address = typeof b.address === 'string' ? b.address.trim() : '';
  if (address.length < 5 || address.length > 200) return null;

  const rawPoints = typeof b.use_points === 'number' && Number.isFinite(b.use_points) ? Math.floor(b.use_points) : 0;
  if (rawPoints < 0) return null;

  return { kit_type, course, recipient_name, phone, address, use_points: rawPoints };
}

/** 포인트 할인 상한 — 잔액·가격(골고루 첫 주 배송분)까지만. 집중은 가격 미확정이라 0. */
export function capUsePoints(requested: number, balance: number, kitType: KitType): number {
  if (kitType !== 'gollo') return 0;
  return Math.max(0, Math.min(Math.floor(requested), Math.floor(balance), GOLLO_WEEK_PRICE));
}
