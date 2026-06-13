'use client';
/** AdminSidebar — 어드민 좌측 네비. 현재 경로 하이라이트(usePathname). app/admin/layout.tsx에서 렌더. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/admin', icon: '📊', label: '대시보드', exact: true },
  { href: '/admin/nutrition', icon: '🥕', label: '식재료' },
  { href: '/admin/nong', icon: '🌾', label: '농진청 DB' },
  { href: '/admin/food-graph', icon: '🕸', label: '궁합 매트릭스' },
  { href: '/admin/community', icon: '🏡', label: '커뮤니티' },
  { href: '/admin/funnel', icon: '📈', label: '펀넬' },
  { href: '/admin/curriculum', icon: '📚', label: '진도 보드' },
  { href: '/admin/compare', icon: '⚖️', label: 'A/B 비교' },
  { href: '/admin/cron', icon: '🌙', label: '크론' },
  { href: '/admin/grant', icon: '🎟', label: '평생무료' },
];

export default function AdminSidebar() {
  const path = usePathname();
  return (
    <nav style={{ width: 184, flexShrink: 0, borderRight: '1px solid #ECECEC', background: '#fff', padding: '18px 12px', position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh', overflowY: 'auto' }}>
      <Link href="/admin" style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: '#1a2b4a', padding: '0 8px 16px', textDecoration: 'none' }}>🛠 밀프레드 관리자</Link>
      {NAV.map((n) => {
        const active = n.exact ? path === n.href : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 9, marginBottom: 3,
            textDecoration: 'none', fontSize: 13.5, fontWeight: active ? 800 : 600,
            color: active ? '#C45A00' : '#4B5563', background: active ? '#FFF4E5' : 'transparent',
          }}>
            <span style={{ fontSize: 15 }}>{n.icon}</span><span>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
