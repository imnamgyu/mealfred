/**
 * care 앱 하단 탭 네비게이션 (코칭·기록·도감·키트·내 정보).
 * 아이콘 = gen-ui-icons.mjs로 생성한 밀프레드 두톤 세트(/icons/ui/tab-*.png) — 이모지 금지 규칙(이사님 2026-08-10).
 * 비활성 탭은 CSS grayscale로 톤다운(별도 비활성 에셋 불필요).
 */
const TABS = [
  { href: '/', icon: '/icons/ui/tab-coach.png', label: '코칭' },
  { href: '/care', icon: '/icons/ui/tab-care.png', label: '기록' },
  { href: '/foods', icon: '/icons/ui/tab-foods.png', label: '도감' },
  { href: '/kit', icon: '/icons/ui/tab-kit.png', label: '키트' },
  { href: '/care/me', icon: '/icons/ui/tab-me.png', label: '내 정보' },
];

// 항상 화면 하단에 고정. sticky는 페이지 <main>의 overflow-x-hidden(도감 줌 픽스) 때문에
// 스크롤 컨테이너가 바뀌어 깨졌다(탭이 콘텐츠 끝에 붙어 끝까지 스크롤해야 보임).
// → fixed로 뷰포트 하단 고정 + 같은 높이 스페이서를 흐름에 넣어 마지막 콘텐츠가 안 가리게.
const NAV_H = 58;

export default function BottomNav({ active }: { active: string }) {
  return (
    <>
      <div aria-hidden style={{ height: NAV_H }} />
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t" style={{ borderColor: '#E5E7EB' }}>
        <div className="grid grid-cols-5 max-w-md mx-auto w-full">
          {TABS.map((t) => {
            const on = t.href === active;
            return (
              <a key={t.href} href={t.href}
                className="flex flex-col items-center py-2.5"
                style={{ color: on ? '#FF6B1A' : '#9CA3AF' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.icon} alt="" width={22} height={22}
                  style={{ width: 22, height: 22, objectFit: 'contain', filter: on ? 'none' : 'grayscale(1) opacity(0.5)' }} />
                <span className="text-[10px] font-bold mt-0.5">{t.label}</span>
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
}
