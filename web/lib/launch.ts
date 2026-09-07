/**
 * lib/launch.ts — 정식 출시 전(테스터 모집) 안내의 단일 소스.
 *
 * 2026-09-07 이사님 결정: 앱은 "11월 정식 출시 · 지금은 테스터 모집 중"으로 안내.
 *   - 홈 비로그인 배너·하단 CTA·가입 팝업 혜택 문구·내 정보 '출시 알림' 카드·mealfred.com 제품 카드가 이 값을 본다.
 *   - 출시일(LAUNCH_AT) 이후엔 isPrelaunch()가 false → 문구가 자동으로 사라진다(코드 수정 불필요).
 * 출시 알림 신청은 auth user_metadata.launch_notify(true) + launch_notify_at(ISO)로 저장 — 별도 테이블·RLS 없이
 *   본인이 자기 메타데이터만 갱신(supabase.auth.updateUser). 발송 시 어드민 auth API로 목록 추출.
 */
export const LAUNCH_AT = '2026-11-01T00:00:00+09:00';   // 정식 출시 예정(KST) — 월 단위 안내라 1일로 둠
export const LAUNCH_MONTH_LABEL = '11월';

export function isPrelaunch(now: Date = new Date()): boolean {
  return now.getTime() < new Date(LAUNCH_AT).getTime();
}

/** 화면 문구 묶음 — 출시 전/후 분기 한 곳에서. */
export function launchCopy(now: Date = new Date()) {
  const pre = isPrelaunch(now);
  return {
    pre,
    badge: pre ? `🚀 ${LAUNCH_MONTH_LABEL} 정식 출시 · 테스터 모집 중` : '🎁 첫 달 무료 · 친구 초대마다 한 달 무료',
    homeTitle: pre ? `정식 출시는 ${LAUNCH_MONTH_LABEL} 중이에요 · 지금은 테스터 모집 중` : '아래는 예시 화면이에요 · 가입 없이 둘러보세요',
    homeBody: pre
      ? '아래는 기능 미리보기(예시 화면)예요. 미리 가입해 두면 출시 알림과 테스터 초대를 먼저 받아요.'
      : '식단만 기록하면 — 우리 아이 데이터로 매일 자동으로 채워져요.',
    ctaTitle: pre ? '🔔 카카오로 미리 가입하고 출시 알림 받기' : '🌱 카카오로 1초 시작하기',
    ctaBody: pre ? `${LAUNCH_MONTH_LABEL} 정식 출시 · 테스터로 먼저 써볼 수 있어요` : '가입하면 이 화면이 우리 아이 진짜 데이터로 채워져요 · 첫 달 무료',
    authBenefit: pre ? `🚀 ${LAUNCH_MONTH_LABEL} 정식 출시 · 미리 가입하면 테스터 우선 초대` : '🎁 첫 달 무료 · 친구 초대마다 한 달 무료',
  };
}
