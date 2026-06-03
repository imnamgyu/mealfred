/**
 * /signup — (페이지 폐지) 홈의 가입/로그인 팝업으로 리다이렉트
 *
 * 별도 가입 페이지를 없애고, 카카오 간편가입은 어디서나 뜨는 팝업(AuthModal)으로 통일했다.
 * 기존 링크(/r/CODE → /signup?ref=…, 카카오 콜백 에러 → /signup?error=…)는 전부 홈으로 흘려보낸다.
 *   - ref(초대코드)는 그대로 전달해 가입 후 연결되게 한다.
 *   - error는 autherr로 넘겨 홈 팝업이 안내 문구로 보여준다.
 */
import { redirect } from 'next/navigation';

export default async function SignupRedirect({ searchParams }: { searchParams: Promise<{ ref?: string; error?: string }> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ auth: '1' });
  if (sp.ref) qs.set('ref', sp.ref);
  if (sp.error) qs.set('autherr', sp.error);
  redirect(`/?${qs.toString()}`);
}
