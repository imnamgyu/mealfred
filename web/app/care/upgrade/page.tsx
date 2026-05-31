/** /care/upgrade — 페이월. 정상가 4,900원/월·첫 달 무료. 챌린지·초대로 할인.
 *  카드 결제 등록은 아직 비활성(준비 중) — 클릭 진입·가격/혜택 안내까지. */
'use client';
import BottomNav from '@/components/BottomNav';
import Link from 'next/link';

const INCLUDED = [
  '매일 아침 우리 아이 맞춤 코칭 편지',
  '31종 영양소 · 8식품군 다양성 분석',
  '편식 도감 + 우리 아이 맞춤 푸드 브릿지',
  '성장(체위·BMI) 추적',
  '골고루 키트 포인트 적립·사용',
];

export default function UpgradePage() {
  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      <header className="px-5 pt-6 pb-3 border-b" style={{ borderColor: '#FFE8D0' }}>
        <h1 className="text-xl font-extrabold" style={{ color: '#1a2b4a' }}>밀프레드 프리미엄</h1>
      </header>

      <div className="flex-1 px-5 py-4">
        {/* 가격 */}
        <div className="bg-white rounded-2xl p-5 mb-3 shadow-sm border text-center" style={{ borderColor: '#FFD8B0' }}>
          <div className="text-[12px] font-extrabold px-2.5 py-1 rounded-full inline-block" style={{ background: '#EAF6F0', color: '#16A085' }}>첫 달 무료</div>
          <div className="mt-2"><span className="text-4xl font-extrabold" style={{ color: '#1a2b4a' }}>4,900</span><span className="text-base font-bold" style={{ color: '#9CA3AF' }}> 원/월</span></div>
          <div className="text-[11px] mt-1.5" style={{ color: '#9CA3AF' }}>언제든 해지 가능 · 첫 달은 무료로 충분히 써보세요</div>
        </div>

        {/* 포함 가치 */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <div className="text-sm font-extrabold mb-2" style={{ color: '#1a2b4a' }}>프리미엄에 포함돼요</div>
          {INCLUDED.map((t, i) => (
            <div key={i} className="flex gap-2 text-[12.5px] py-1" style={{ color: '#5a4a3a' }}><span style={{ color: '#16A085' }}>✓</span>{t}</div>
          ))}
        </div>

        {/* 할인 — 챌린지·초대·포인트 */}
        <div className="rounded-2xl p-4 mb-3" style={{ background: '#F0FAF6', border: '1.5px solid #A5D6C6' }}>
          <div className="text-sm font-extrabold mb-2" style={{ color: '#1B5E20' }}>💚 이렇게 할인받으세요</div>
          <div className="flex gap-2 text-[12px] py-1" style={{ color: '#3a5a4a' }}><span>🏆</span><div><strong>90일 챌린지 완주</strong> — 매일 기록하면 다음 달 할인</div></div>
          <div className="flex gap-2 text-[12px] py-1" style={{ color: '#3a5a4a' }}><span>👯</span><div><strong>친구 초대</strong> — 초대한 친구가 가입하면 할인(마이페이지 초대 링크)</div></div>
          <div className="flex gap-2 text-[12px] py-1" style={{ color: '#3a5a4a' }}><span>🪙</span><div><strong>포인트 적립</strong> — 끼니 기록마다 +50P를 구독·골고루 키트에 사용</div></div>
        </div>

        {/* 결제 — 아직 비활성 */}
        <button disabled className="w-full rounded-xl py-3.5 text-center font-extrabold text-sm" style={{ background: '#F4F4F5', color: '#B0B0B0', cursor: 'not-allowed' }}>카드 등록 (준비 중)</button>
        <p className="text-[11px] text-center mt-2 leading-relaxed" style={{ color: '#9CA3AF' }}>결제 수단 등록은 곧 열려요. 지금은 <strong>첫 달 무료</strong>로 모든 기능을 쓰실 수 있어요.</p>

        <Link href="/care/me" className="block text-center text-[12px] mt-4 mb-2" style={{ color: '#9CA3AF' }}>← 내 정보로 돌아가기</Link>
      </div>

      <BottomNav />
    </main>
  );
}
