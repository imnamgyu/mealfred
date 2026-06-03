/**
 * lib/kakaoAuth.ts — 카카오 OAuth 시작(가입/로그인 공용)
 *
 * 별도 /signup 페이지 대신 어디서나(모달·버튼) 호출해 카카오 간편가입을 띄운다.
 * scope=profile_nickname 만(Supabase의 account_email 강제 우회) → /auth/kakao/callback 에서 세션 처리.
 */
'use client';

const KAKAO_REST_KEY = process.env.NEXT_PUBLIC_KAKAO_REST_KEY;

/** 카카오 인증 페이지로 이동. ref(초대코드)가 있으면 mf_ref에 보관(가입 후 onboarding이 연결). */
export function startKakaoLogin(opts?: { ref?: string | null }): { ok: boolean; error?: string } {
  if (!KAKAO_REST_KEY) return { ok: false, error: '카카오 설정이 누락되었습니다 (NEXT_PUBLIC_KAKAO_REST_KEY)' };
  try {
    const ref = opts?.ref ?? new URLSearchParams(window.location.search).get('ref');
    if (ref) localStorage.setItem('mf_ref', ref);
  } catch { /* localStorage 차단 환경 무시 */ }
  const redirectUri = `${window.location.origin}/auth/kakao/callback`;
  const authUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_KEY}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=profile_nickname`;
  window.location.href = authUrl;
  return { ok: true };
}

/** 카카오 콜백 에러코드 → 사람이 읽는 안내. */
export function kakaoErrorText(code: string | null | undefined): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    no_code: '카카오 로그인이 취소됐어요. 다시 시도해 주세요.',
    kakao_token: '카카오 인증에 실패했어요. 잠시 후 다시 시도해 주세요.',
    kakao_user: '카카오 사용자 정보를 못 받았어요. 다시 시도해 주세요.',
    link: '로그인 처리 중 문제가 생겼어요. 다시 시도해 주세요.',
    verify: '세션 생성에 실패했어요. 다시 시도해 주세요.',
    no_session: '로그인이 완료되지 않았어요. 다시 시도해 주세요.',
    callback: '로그인 처리 중 오류가 발생했어요. 다시 시도해 주세요.',
  };
  return map[code] || '로그인 중 오류가 발생했어요. 다시 시도해 주세요.';
}
