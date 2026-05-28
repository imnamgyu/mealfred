'use client';

import { useEffect } from 'react';

// 사람 방문자만 결과 렌더 페이지로 이동 (봇은 JS 미실행 → OG 메타만 읽음)
export default function Redirect({ url }: { url: string }) {
  useEffect(() => {
    window.location.replace(url);
  }, [url]);
  return null;
}
