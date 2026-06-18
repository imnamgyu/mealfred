'use client';
/**
 * /admin 수동 새로고침 버튼.
 *
 * 이제 admin 읽기는 Data Cache에 박혀 있어 router.refresh()만으론 캐시를 못 깬다.
 * → 서버 액션 refreshAdmin()으로 'admin' 태그를 즉시 만료시킨 뒤 router.refresh()로 다시 그린다.
 * 평소엔 캐시(빠름)·편지 쓰면 자동 갱신·그래도 즉시 보고 싶으면 이 버튼(강제 fresh).
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { refreshAdmin } from '@/app/admin/actions';

export default function AdminRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {last && <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' }}>갱신 {last}</span>}
      <button
        onClick={() => startTransition(async () => {
          await refreshAdmin();
          router.refresh();
          setLast(new Date().toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' }));
        })}
        disabled={pending}
        style={{ fontSize: 12, fontWeight: 800, color: pending ? '#9CA3AF' : '#1a2b4a', background: '#F1F1F0', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: pending ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
      >
        {pending ? '갱신 중…' : '↻ 새로고침'}
      </button>
    </div>
  );
}
