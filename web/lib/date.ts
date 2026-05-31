/**
 * lib/date.ts — KST(UTC+9) 기준 날짜. 한국 사용자 대상.
 *
 * 클라(브라우저 로컬 TZ)와 서버(UTC)·크론이 letter_date/q_date를 같은 기준으로 읽고 쓰도록
 * 모두 이 함수를 공유한다. (코칭엔진 스펙 §7 — 새벽 크론이 KST로 생성, 아침에 부모가 read)
 * 순수 함수만 — 클라이언트 번들에 안전.
 */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 n일 전 날짜 (YYYY-MM-DD) */
export function kstDateNDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400 * 1000).toISOString().slice(0, 10);
}

/** KST 날짜+시간 표기 (YYYY-MM-DD HH:mm). timeZone 옵션으로 정확 — 수동 +9 계산 안 함(서버 UTC여도 한국시간). */
export function kstDateTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
}

/** UTC timestamp → KST 날짜만 (YYYY-MM-DD). timeZone 옵션. */
export function kstDateOf(ts: string | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
}
