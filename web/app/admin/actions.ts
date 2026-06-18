'use server';
/**
 * /admin 서버 액션 — 수동 새로고침.
 * 캐시('admin' 태그)를 즉시 만료(expire:0)시켜 다음 렌더가 곧장 fresh를 받게 한다.
 * (사용자가 직접 누르는 '↻ 새로고침'은 stale-while-revalidate보다 '지금 즉시'가 맞음 → expire:0.)
 */
import { revalidateTag } from 'next/cache';

export async function refreshAdmin() {
  revalidateTag('admin', { expire: 0 });
}
