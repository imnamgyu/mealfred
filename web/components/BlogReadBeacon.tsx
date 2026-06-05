'use client';
/** 블로그 열람 기록(fire-and-forget) — 추천 크론이 읽은 글을 뒤로 보내 다음 글을 위로. */
import { useEffect } from 'react';

export default function BlogReadBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    fetch('/api/blog/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);
  return null;
}
