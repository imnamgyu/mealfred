'use client';
/**
 * 펀넬 새로고침 — 수동 + '실시간' 토글(기본 OFF).
 *
 * 이 페이지는 force-dynamic이라 그릴 때마다 auth.users·children·meal_logs·app_visitors를 집계한다(무겁다).
 * 그래서 자동 폴링을 기본 OFF로 두고, 관리자가 '실시간'을 켰을 때만 20초마다 router.refresh()를 돈다
 * (런칭처럼 지켜보는 동안만 라이브, 아무도 안 볼 땐 부하 0). router.refresh()는 서버 컴포넌트만 다시 태워 화면이 안 깜빡인다.
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition, useEffect } from 'react';

const INTERVAL = 20000;

export default function RefreshButton({ renderedAt }: { renderedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState(renderedAt);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      startTransition(() => {
        router.refresh();
        setLast(new Date().toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' }));
      });
    }, INTERVAL);
    return () => clearInterval(id);
  }, [live, router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' }}>조회 {last}{pending ? ' …' : ''}</span>
      <button
        onClick={() => setLive((v) => !v)}
        style={{ fontSize: 12, fontWeight: 800, color: live ? '#fff' : '#6B7280', background: live ? '#DC2626' : '#F1F1F0', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        title="켜면 20초마다 자동 새로고침 (런칭 모니터링용)"
      >
        {live ? '🔴 LIVE · 20s' : '⚪ 실시간'}
      </button>
      <button
        onClick={() => startTransition(() => { router.refresh(); setLast(new Date().toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' })); })}
        disabled={pending}
        style={{ fontSize: 12, fontWeight: 800, color: pending ? '#9CA3AF' : '#1a2b4a', background: '#F1F1F0', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: pending ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
      >
        {pending ? '갱신 중…' : '↻'}
      </button>
    </div>
  );
}
