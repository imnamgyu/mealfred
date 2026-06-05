'use client';
/**
 * 펀넬 수동 새로고침 — 부하 최소 선택(자동 폴링 X).
 *
 * 왜 폴링이 아니라 버튼인가:
 *  이 페이지는 force-dynamic이라 '그릴 때마다' auth.users·children·meal_logs·app_visitors를
 *  통째로 집계한다(1만 명 규모에선 meal_logs 풀스캔이 무겁다). 자동 30초 폴링이면 아무도
 *  안 보고 있어도 그 무거운 집계를 계속 반복 → 부하·비용 누수. 관리자 페이지는 가끔 보는 화면이라
 *  '볼 때 1회만' 다시 받는 수동 새로고침이 서버 부하가 가장 작다.
 *  router.refresh()는 서버 컴포넌트만 다시 태우고 화면은 안 깜빡인다.
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function RefreshButton({ renderedAt }: { renderedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState(renderedAt);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' }}>조회 {last}</span>
      <button
        onClick={() => startTransition(() => { router.refresh(); setLast(new Date().toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' })); })}
        disabled={pending}
        style={{ fontSize: 12, fontWeight: 800, color: pending ? '#9CA3AF' : '#1a2b4a', background: '#F1F1F0', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: pending ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
      >
        {pending ? '갱신 중…' : '↻ 새로고침'}
      </button>
    </div>
  );
}
