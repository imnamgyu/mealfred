/** /care/report — 영양 진단 (M6 예정, 현재 준비 중) */
import BottomNav from '@/components/BottomNav';

export const metadata = { title: '영양 진단 — 밀프레드' };

export default function ReportPage() {
  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      <header className="px-5 pt-6 pb-3 border-b" style={{ borderColor: '#FFE8D0' }}>
        <h1 className="text-xl font-extrabold" style={{ color: '#1a2b4a' }}>영양 진단</h1>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-lg font-extrabold mb-2" style={{ color: '#1a2b4a' }}>곧 만나요</h2>
        <p className="text-sm leading-relaxed" style={{ color: '#8a7a6a' }}>
          며칠 식사를 기록하면<br />
          KDRI 36가지 영양소 신호등과<br />
          7축 식습관 진단을 보여드려요.
        </p>
        <a href="/care" className="mt-6 px-5 py-3 rounded-xl font-bold text-white text-sm" style={{ background: '#FF6B1A' }}>
          식사 기록하러 가기 →
        </a>
      </div>
      <BottomNav active="/care/report" />
    </main>
  );
}
