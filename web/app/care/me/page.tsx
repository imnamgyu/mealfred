/** /care/me — 내 정보 (자녀 프로필·로그아웃, M5 기본) */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import type { ReferralBilling } from '@/lib/billing';

type Child = { nickname: string; age_band: string; birth_year: number | null; birth_month: number | null; allergens: string[] | null; chronic_conditions: string | null };
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
  const [points, setPoints] = useState<{ balance: number; total_earned: number } | null>(null);
  const [ledger, setLedger] = useState<{ kind: string; amount: number; created_at: string; meta: { date?: string } | null }[]>([]);
  const [sub, setSub] = useState<{ lifetime: boolean; freeUntil: string; daysLeft: number } | null>(null);   // 구독 상태(첫 달 무료·6월 평생무료)
  const [chronicInput, setChronicInput] = useState('');   // 만성질환·특이사항
  const [chronicSaved, setChronicSaved] = useState(false);
  const [redeeming, setRedeeming] = useState(false);   // 포인트로 구독 결제 처리 중

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
      // 구독: 첫 달 무료(가입+30일) + 포인트 결제분(app_subscriptions.paid_until). 실제 만료 = max(둘). 6월가입=평생무료.
      const lifetime = user.created_at?.slice(0, 7) === '2026-06';
      const createdMs = user.created_at ? new Date(user.created_at).getTime() : Date.now();
      const freeUntilMs = createdMs + 30 * 86400e3;
      const { data: subRow } = await supabase.from('app_subscriptions').select('paid_until').eq('parent_id', user.id).maybeSingle();
      const paidMs = subRow?.paid_until ? new Date(subRow.paid_until + 'T00:00:00+09:00').getTime() : 0;
      const effMs = Math.max(freeUntilMs, paidMs);
      setSub({ lifetime, freeUntil: new Date(effMs).toISOString().slice(0, 10), daysLeft: Math.max(0, Math.ceil((effMs - Date.now()) / 86400e3)) });
      const { data } = await supabase.from('children')
        .select('nickname,age_band,birth_year,birth_month,allergens,chronic_conditions')
        .eq('parent_id', user.id).order('id', { ascending: true }).limit(1).maybeSingle();
      setChild(data);
      setChronicInput(data?.chronic_conditions || '');
      setLoading(false);
      loadReferral();   // 초대 코드·방문수·과금 상태
      // 포인트 잔액·내역 (M7)
      supabase.from('point_balance').select('balance,total_earned').eq('parent_id', user.id).maybeSingle().then(({ data: pb }) => setPoints(pb));
      supabase.from('point_ledger').select('kind,amount,created_at,meta').eq('parent_id', user.id).order('created_at', { ascending: false }).limit(20).then(({ data: pl }) => setLedger((pl as typeof ledger) || []));
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

  async function redeemSub() {
    if (redeeming) return;   // 더블클릭 차단(서버 멱등 아님 — 의도적 반복 결제 가능)
    setRedeeming(true);
    const r = await fetch('/api/points/redeem', { method: 'POST' }).then((x) => x.json()).catch(() => null);
    setRedeeming(false);
    if (r?.ok) window.location.reload();   // 잔액·만료일 갱신
    else alert(r?.reason === 'insufficient' ? '포인트가 부족해요 — 4,900P가 필요해요. 끼니 기록·친구 초대로 모아보세요!' : '결제에 실패했어요. 잠시 후 다시 시도해주세요.');
  }

  async function saveChronic() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('children').update({ chronic_conditions: chronicInput.trim() || null }).eq('parent_id', user.id);
    setChronicSaved(true); setTimeout(() => setChronicSaved(false), 2000);
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

            {/* 구독 — 첫 달 무료 만료기간 / 6월 평생무료 / 페이월 진입 */}
            <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
              <div className="text-xs font-bold mb-1" style={{ color: '#8a7a6a' }}>구독</div>
              {sub?.lifetime ? (
                <div className="text-base font-extrabold" style={{ color: '#16A085' }}>🎉 평생 무료 <span className="text-[11px] font-semibold" style={{ color: '#9CA3AF' }}>· 6월 가입 혜택</span></div>
              ) : sub && sub.daysLeft > 0 ? (
                <>
                  <div className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>무료 체험 <span style={{ color: '#C45A00' }}>D-{sub.daysLeft}</span></div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>{sub.freeUntil}까지 무료 · 이후 월 4,900원</div>
                  <a href="/care/upgrade" className="inline-block mt-2.5 rounded-xl px-3.5 py-2 text-[12px] font-extrabold" style={{ background: '#FFF0E0', color: '#C45A00' }}>챌린지·초대로 할인받기 →</a>
                </>
              ) : sub ? (
                <>
                  <div className="text-base font-extrabold" style={{ color: '#C62828' }}>무료 체험 종료</div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>계속 이용하려면 구독해주세요 · 월 4,900원</div>
                  <a href="/care/upgrade" className="inline-block mt-2.5 rounded-xl px-3.5 py-2 text-[12px] font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>구독하기 →</a>
                </>
              ) : null}
              {!sub?.lifetime && (points?.balance ?? 0) >= 4900 && (
                <button onClick={redeemSub} disabled={redeeming} className="block w-full mt-2.5 rounded-xl py-2.5 text-[12px] font-extrabold text-white" style={{ background: redeeming ? '#9CA3AF' : '#16A085' }}>{redeeming ? '처리 중…' : '🪙 포인트로 1개월 연장 (4,900P 사용)'}</button>
              )}
            </div>

            {/* 내 포인트 (M7) — 끼니 기록마다 +50P, 골고루 키트 구매에 사용(준비 중) */}
            <div className="rounded-2xl p-4 mb-3 border" style={{ background: 'linear-gradient(135deg,#FFF8F0,#FFE8D0)', borderColor: '#FFD0A0' }}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-bold" style={{ color: '#8a7a6a' }}>내 포인트 <span style={{ color: '#B0B0B0' }}>(1P = 1원)</span></div>
                {points && <div className="text-[10.5px]" style={{ color: '#9CA3AF' }}>누적 {points.total_earned.toLocaleString()}P</div>}
              </div>
              <div className="text-2xl font-extrabold" style={{ color: '#C45A00' }}>{(points?.balance ?? 0).toLocaleString()} <span className="text-sm">P</span></div>
              <div className="text-[11px] mt-1.5 leading-relaxed" style={{ color: '#8a7a6a' }}>끼니를 기록할 때마다 <strong style={{ color: '#C45A00' }}>+50P</strong> 쌓여요 · 모아서 <strong>앱 구독료</strong>나 <strong>골고루 키트</strong> 결제에 쓸 수 있어요</div>
              {ledger.length > 0 && (
                <details className="mt-2.5">
                  <summary className="text-[11px] font-bold cursor-pointer" style={{ color: '#9CA3AF' }}>적립·사용 내역 {ledger.length}건 ▾</summary>
                  <div className="mt-1.5 space-y-1">
                    {ledger.map((l, i) => (
                      <div key={i} className="flex justify-between text-[11px]" style={{ color: '#6B7280' }}>
                        <span>{l.kind === 'meal_input' ? '끼니 기록' : l.kind === 'redeem_kit' ? '키트 구매' : l.kind}{l.meta?.date ? ` · ${l.meta.date}` : ''}</span>
                        <span style={{ color: l.amount > 0 ? '#16A085' : '#C62828', fontWeight: 700 }}>{l.amount > 0 ? '+' : ''}{l.amount}P</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* 포인트 모으는 방법 — 바이럴 리워드 허브(v3) */}
            <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
              <div className="text-xs font-bold mb-2.5" style={{ color: '#8a7a6a' }}>🪙 포인트 모으는 방법 <span style={{ color: '#B0B0B0' }}>· 1P=1원, 키트·구독에 사용</span></div>
              {[
                { ic: '🍽', t: '끼니 기록', p: '+50P', d: '매 끼니 · 하루 5끼까지', on: true },
                { ic: '👥', t: '친구 가입', p: '+4,900P', d: '내 링크로 가입 = 한 달 구독값! 많이 모으면 계속 무료', on: true },
              ].map((x, i) => (
                <div key={i} className="flex items-center gap-2.5 py-1.5" style={{ borderTop: i ? '1px solid #F5F0EA' : 'none' }}>
                  <span className="text-base shrink-0">{x.ic}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-bold" style={{ color: '#1a2b4a' }}>{x.t} <span style={{ color: '#16A085' }}>{x.p}</span></div>
                    <div className="text-[10.5px] leading-snug" style={{ color: '#9CA3AF' }}>{x.d}</div>
                  </div>
                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={x.on ? { background: '#EAF6F0', color: '#16A085' } : { background: '#F4F4F5', color: '#B0B0B0' }}>{x.on ? '가능' : '준비 중'}</span>
                </div>
              ))}
              <div className="text-[10.5px] mt-2.5 pt-2.5" style={{ color: '#8a7a6a', borderTop: '1px solid #F5F0EA' }}>💡 친구 초대 링크는 아래 <strong>구독 카드</strong>에 있어요. 많이 초대할수록 계속 무료!</div>
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
                {/* 만성질환·특이사항 — 코칭·영양 제한 반영 */}
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F5F0EA' }}>
                  <div className="text-[11px] font-bold mb-1.5" style={{ color: '#8a7a6a' }}>만성질환·특이사항 <span style={{ color: '#B0B0B0' }}>(코칭·영양에 반영)</span></div>
                  <textarea value={chronicInput} onChange={(e) => setChronicInput(e.target.value)} placeholder="예: 갑상선 기능저하, 신장질환, 페닐케톤뇨증(PKU), 유당불내증, 당뇨…" rows={2}
                    className="w-full text-[12px] px-2.5 py-2 rounded-lg resize-none" style={{ background: '#FFFDFB', border: '1px solid #E5E7EB', color: '#5a4a3a' }} />
                  <button onClick={saveChronic} className="mt-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: chronicSaved ? '#16A085' : '#FF6B1A' }}>{chronicSaved ? '저장됨 ✓' : '저장'}</button>
                </div>
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
