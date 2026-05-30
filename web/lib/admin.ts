/**
 * 어드민 접근 제어 — 관리자 이메일 화이트리스트.
 * 코칭 QA 콘솔(/admin)은 전 계정 PII를 보므로 관리자만.
 */
export const ADMIN_EMAILS = [
  'continueing@gmail.com',
];

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
