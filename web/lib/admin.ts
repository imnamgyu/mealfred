/**
 * 어드민 접근 제어 — 코칭 QA 콘솔(/admin)은 전 계정 PII를 보므로 관리자만.
 *
 * 규칙: **@mealfred.com 도메인 이메일(구글 워크스페이스)로만** 접근.
 *   - 부모(카카오) 계정은 합성 이메일(kakao_*@kakao.local)이라 절대 통과 못 함 → 안전.
 *   - 구글 워크스페이스 gyu@mealfred.com 등으로 로그인해야 함.
 *
 * break-glass: 도메인 메일이 막히는 비상시를 위해 Vercel 환경변수 ADMIN_UIDS="uid1,uid2"에
 *   uid를 넣으면 예외 허용(기본 비어 있음). 평상시엔 도메인 규칙만으로 충분.
 */
export const ADMIN_DOMAIN = 'mealfred.com';

function envUids(): string[] {
  return (process.env.ADMIN_UIDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAdmin(user: { id?: string | null; email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase();
  if (email.endsWith('@' + ADMIN_DOMAIN)) return true;     // 도메인 이메일 = 관리자
  if (user.id && envUids().includes(user.id)) return true;  // break-glass(기본 off)
  return false;
}
