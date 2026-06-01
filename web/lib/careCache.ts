/**
 * lib/careCache.ts — 끼니 입력 localStorage 캐시(계정별 격리).
 *
 * 배경: 예전엔 전역 키 'mealfred_care_logs' 하나를 모든 계정이 공유했다.
 *   → 계정 A로 입력한 캐시를 계정 B(같은 브라우저)가 그대로 보고, 심지어
 *     care 페이지가 그 캐시를 B의 서버(meal_logs)로 동기화하는 누수가 있었다.
 *
 * 해결: 키를 유저별로 네임스페이스('mealfred_care_logs:<userId>', 비로그인=':guest').
 *   - 로그인 사용자는 server(meal_logs)가 단일 진실. 캐시는 오프라인/낙관적 UX용.
 *   - 비로그인(guest) 입력은 ':guest'에만. 로그인 시 그 guest 기록만 1회 마이그레이션 후 비운다.
 *   - 레거시 전역 키는 진입 시 1회 폐기(purgeLegacyCareCache) — 옛 계정 데이터 노출 차단.
 *
 * 모든 소비자(care/page, care/report, foods, RefusedBadge)는 이 헬퍼만 쓴다(직접 getItem 금지).
 */

const BASE = 'mealfred_care_logs';
const LEGACY_GLOBAL = BASE; // 네임스페이스 없던 옛 키(폐기 대상)

export function careCacheKey(userId: string | null | undefined): string {
  return `${BASE}:${userId || 'guest'}`;
}

/** 해당 유저(없으면 guest)의 캐시를 읽는다. SSR·파싱 실패 시 {}. */
export function loadCareLogs<T = Record<string, unknown>>(userId: string | null | undefined): T {
  if (typeof window === 'undefined') return {} as T;
  try {
    return JSON.parse(localStorage.getItem(careCacheKey(userId)) || '{}') as T;
  } catch {
    return {} as T;
  }
}

/** 해당 유저(없으면 guest)의 캐시를 쓴다. */
export function saveCareLogs(logs: unknown, userId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(careCacheKey(userId), JSON.stringify(logs));
  } catch {}
}

/** 해당 유저(없으면 guest)의 캐시를 비운다. */
export function clearCareLogs(userId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(careCacheKey(userId));
  } catch {}
}

/** 레거시 전역 키(네임스페이스 없던 옛 캐시) 폐기 — 계정 간 누수 차단. 진입 시 1회 호출. */
export function purgeLegacyCareCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LEGACY_GLOBAL);
  } catch {}
}
