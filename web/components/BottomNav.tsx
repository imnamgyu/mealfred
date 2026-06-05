/** care 앱 하단 탭 네비게이션 (홈·기록·도감·팁·내 정보) */
const TABS = [
  { href: '/', emoji: '🏠', label: '홈' },
  { href: '/care', emoji: '✏️', label: '기록' },
  { href: '/foods', emoji: '🗂', label: '도감' },
  { href: '/community', emoji: '📰', label: '팁' },
  { href: '/care/me', emoji: '👤', label: '내 정보' },
];

export default function BottomNav({ active }: { active: string }) {
  return (
    <nav className="sticky bottom-0 bg-white border-t grid grid-cols-5 max-w-md mx-auto w-full" style={{ borderColor: '#E5E7EB' }}>
      {TABS.map((t) => (
        <a key={t.href} href={t.href}
          className="flex flex-col items-center py-2.5"
          style={{ color: t.href === active ? '#FF6B1A' : '#9CA3AF' }}>
          <span className="text-lg leading-none">{t.emoji}</span>
          <span className="text-[10px] font-bold mt-0.5">{t.label}</span>
        </a>
      ))}
    </nav>
  );
}
