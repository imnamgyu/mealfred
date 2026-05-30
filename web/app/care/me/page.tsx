/** /care/me — 내 정보 (자녀 프로필·로그아웃, M5 기본) */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';

type Child = { nickname: string; age_band: string; birth_year: number | null; birth_month: number | null; allergens: string[] | null };
const AGE_LABEL: Record<string, string> = {
  younger: '만 3세 미만', '3-4y': '만 3–4세', '5y': '만 5세', '6-7y': '만 6–7세',
};

export default function MePage() {
  const supabase = createSupabaseBrowser();
  const [child, setChild] = useState<Child | null>(null);
  const [nickname, setNickname] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setNickname((user.user_metadata?.nickname as string) || '');
      const { data } = await supabase.from('children')
        .select('nickname,age_band,birth_year,birth_month,allergens')
        .eq('parent_id', user.id).order('id', { ascending: true }).limit(1).maybeSingle();
      setChild(data);
      setLoading(false);
    })();
  }, [supabase]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/signup';
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      <header className="px-5 pt-6 pb-3 border-b" style={{ borderColor: '#FFE8D0' }}>
        <h1 className="text-xl font-extrabold" style={{ color: '#1a2b4a' }}>내 정보</h1>
      </header>

      <div className="flex-1 px-5 py-4">
        {loading ? (
          <p className="text-sm" style={{ color: '#9CA3AF' }}>불러오는 중...</p>
        ) : (
          <>
            <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
              <div className="text-xs font-bold mb-2" style={{ color: '#8a7a6a' }}>보호자</div>
              <div className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>{nickname || '카카오 회원'}님</div>
            </div>

            {child ? (
              <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
                <div className="text-xs font-bold mb-2" style={{ color: '#8a7a6a' }}>우리 아이</div>
                <div className="text-base font-extrabold mb-1" style={{ color: '#1a2b4a' }}>
                  {child.nickname} <span className="text-xs font-semibold" style={{ color: '#C45A00' }}>{AGE_LABEL[child.age_band] || child.age_band}</span>
                </div>
                {child.birth_year && (
                  <div className="text-xs" style={{ color: '#8a7a6a' }}>{child.birth_year}년 {child.birth_month}월생</div>
                )}
                {child.allergens?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {child.allergens.map((a) => (
                      <span key={a} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#FFEBEE', color: '#C62828' }}>⚠ {a}</span>
                    ))}
                  </div>
                ) : null}
                <a href="/onboarding" className="inline-block mt-3 text-xs font-bold" style={{ color: '#FF6B1A' }}>아이 정보 추가/수정 →</a>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border text-center" style={{ borderColor: '#FFE8D0' }}>
                <p className="text-sm mb-2" style={{ color: '#8a7a6a' }}>아직 아이 정보가 없어요</p>
                <a href="/onboarding" className="inline-block px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: '#FF6B1A' }}>아이 등록하기</a>
              </div>
            )}

            <button onClick={logout} className="w-full mt-2 py-3 rounded-xl text-sm font-bold border" style={{ borderColor: '#E5E7EB', color: '#6B7280' }}>
              로그아웃
            </button>
          </>
        )}
      </div>

      <BottomNav active="/care/me" />
    </main>
  );
}
