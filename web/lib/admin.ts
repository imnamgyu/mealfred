/**
 * 어드민 접근 제어 — 코칭 QA 콘솔(/admin)은 전 계정 PII를 보므로 관리자만.
 *
 * 카카오 OAuth 사용자는 실제 이메일이 없을 수 있어(kakao_{id}@kakao.local),
 * uid(auth.users.id) 화이트리스트를 1차로 본다. 이메일은 보조.
 *
 * 설정: Vercel 환경변수 ADMIN_UIDS = "uid1,uid2" (콤마 구분).
 * 본인 uid를 모르면 /admin 접근 시 화면에 표시되니, 그걸 ADMIN_UIDS에 넣으면 된다(self-bootstrap).
 */
export const ADMIN_EMAILS = [
  'continueing@gmail.com',
];

function envUids(): string[] {
  return (process.env.ADMIN_UIDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAdmin(user: { id?: string | null; email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const uids = envUids();
  if (user.id && uids.includes(user.id)) return true;
  if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) return true;
  return false;
}

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
