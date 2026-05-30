/** /care/me — 내 정보 (자녀 프로필·로그아웃, M5 기본) */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import type { ReferralBilling } from '@/lib/billing';

type Child = { nickname: string; age_band: string; birth_year: number | null; birth_month: number | null; allergens: string[] | null };
type Referral = { code: string; visits: number; billing: ReferralBilling };
const AGE_LABEL: Record<string, string> = {
  younger: '만 3세 미만', '3-4y': '만 3–4세', '5y': '만 5세', '6-7y': '만 6–7세',
};

export default function MePage() {
  const supabase = createSupabaseBrowser();
  const [child, setChild] = useState<Child | null>(null);
  const [nickname, setNickname] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState<Referral | null>(null);
  const [refErr, setRefErr] = useState<string>('');   // 초대 카드가 안 뜰 때 원인 표시
  const [refLoading, setRefLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  async function loadReferral() {
    setRefLoading(true); setRefErr('');
    try {
      const r = await fetch('/api/referral', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d?.code) { setRef(d); setRefErr(''); }
        else setRefErr('코드 없음');
      } else {
        const body = await r.json().catch(() => ({}));
        setRefErr(`${r.status} ${body?.error || ''}`.trim());
      }
    } catch (e) {
      setRefErr(e instanceof Error ? e.message : '네트워크 오류');
    } finally {
      setRefLoading(false);
    }
  }

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
      loadReferral();   // 초대 코드·방문수·과금 상태
    })();
  }, [supabase]);

  const inviteUrl = ref ? `https://app.mealfred.com/r/${ref.code}` : '';
  async function copyInvite() {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  async function shareInvite() {
    if (!inviteUrl) return;
    const text = '우리 아이 편식, 밀프레드로 매일 코칭받고 있어요! 이 링크로 들어와 보세요 👇';
    if (navigator.share) { try { await navigator.share({ title: '밀프레드', text, url: inviteUrl }); return; } catch {} }
    copyInvite();
  }

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
              <></>
            )}

            {/* 구독 + 초대(바이럴) — 1개월 무료 / 5명 방문 시 평생무료 */}
            {ref && (
              <div className="rounded-2xl p-4 mb-3 border" style={{ background: ref.billing.plan === 'lifetime_free' ? '#E8F5E9' : '#FFF8F0', borderColor: ref.billing.plan === 'lifetime_free' ? '#A5D6A7' : '#FFE8D0' }}>
                <div className="text-xs font-bold mb-1" style={{ color: '#8a7a6a' }}>구독</div>
                <div className="text-sm font-extrabold mb-2" style={{ color: ref.billing.plan === 'lifetime_free' ? '#1B5E20' : '#1a2b4a' }}>{ref.billing.label}</div>

                {ref.billing.plan !== 'lifetime_free' && (<>
                  {/* 초대 진행도 N/5 */}
                  <div className="flex items-center gap-1.5 mb-2">
                    {Array.from({ length: ref.billing.goal }).map((_, i) => (
                      <div key={i} className="flex-1 h-2 rounded-full" style={{ background: i < ref.visits ? '#16A085' : '#F0E0D0' }} />
                    ))}
                    <span className="text-[11px] font-extrabold ml-1" style={{ color: '#16A085' }}>{ref.visits}/{ref.billing.goal}</span>
                  </div>
                  <div className="text-[11px] mb-2.5" style={{ color: '#8a7a6a' }}>내 링크로 <strong style={{ color: '#C45A00' }}>5명 방문</strong>하면 <strong>아이 1명 평생 무료</strong> (가입 안 해도 카운트)</div>

                  {/* 링크 + 공유 */}
                  <div className="flex items-center gap-1.5">
                    <input readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 text-[11px] px-2.5 py-2 rounded-lg" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280' }} />
                    <button onClick={copyInvite} className="text-[11px] font-bold px-3 py-2 rounded-lg" style={{ background: copied ? '#16A085' : '#1a2b4a', color: 'white' }}>{copied ? '복사됨' : '복사'}</button>
                    <button onClick={shareInvite} className="text-[11px] font-bold px-3 py-2 rounded-lg text-white" style={{ background: '#FF6B1A' }}>공유</button>
                  </div>
                </>)}
              </div>
            )}

            {/* 초대 카드가 아직/실패로 안 떴을 때 — 항상 무언가 보이게 + 원인 표시 */}
            {!ref && (
              <div className="rounded-2xl p-4 mb-3 border" style={{ background: '#FFF8F0', borderColor: '#FFE8D0' }}>
                <div className="text-xs font-bold mb-1" style={{ color: '#8a7a6a' }}>구독 · 친구 초대</div>
                {refLoading ? (
                  <div className="text-sm" style={{ color: '#9CA3AF' }}>초대 링크 불러오는 중…</div>
                ) : (
                  <>
                    <div className="text-[12.5px] mb-2" style={{ color: '#8a7a6a' }}>초대 링크를 불러오지 못했어요{refErr ? ` (${refErr})` : ''}.</div>
                    <button onClick={loadReferral} className="text-[12px] font-bold px-3 py-2 rounded-lg text-white" style={{ background: '#FF6B1A' }}>다시 시도</button>
                  </>
                )}
              </div>
            )}

            {!child && (
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
