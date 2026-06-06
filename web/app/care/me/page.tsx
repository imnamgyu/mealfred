/** /care/me — 내 정보. 섹션 순서: 보호자 이름(맨 위) → ① 아이 → ② 결제·포인트 묶음 → 로그아웃(하단) */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import LoginCta from '@/components/LoginCta';
import type { ReferralBilling } from '@/lib/billing';

type Child = { id: string; nickname: string; age_band: string; birth_year: number | null; birth_month: number | null; allergens: string[] | null; chronic_conditions: string | null; created_at: string | null };
type Referral = { code: string; visits: number; billing: ReferralBilling; signups?: number; earned?: number; pending?: number };
const AGE_LABEL: Record<string, string> = {
  younger: '만 3세 미만', '3-4y': '만 3–4세', '5y': '만 5세', '6-7y': '만 6–7세',
};

export default function MePage() {
  const supabase = createSupabaseBrowser();
  const [children, setChildren] = useState<Child[]>([]);   // 다자녀 전제 — per-child 4,900원 BM 대비
  const [nickname, setNickname] = useState<string>('');
  const [account, setAccount] = useState<{ email: string; isKakao: boolean }>({ email: '', isKakao: true });   // 어느 계정으로 로그인했는지(카카오 부모 vs 구글/관리자)
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState<Referral | null>(null);
  const [refErr, setRefErr] = useState<string>('');   // 초대 카드가 안 뜰 때 원인 표시
  const [refLoading, setRefLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [points, setPoints] = useState<{ balance: number; total_earned: number } | null>(null);
  const [ledger, setLedger] = useState<{ kind: string; amount: number; created_at: string; meta: { date?: string } | null }[]>([]);
  const [sub, setSub] = useState<{ lifetime: boolean; paidMs: number } | null>(null);   // 계정 단위: 평생무료 + 포인트 결제분(paid_until). 자녀별 무료체험은 각 아이 created_at 기준으로 계산
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
      const em = user.email || '';
      setAccount({ email: em, isKakao: em.endsWith('@kakao.local') });   // 카카오 부모=kakao_*@kakao.local, 그 외(구글 @mealfred.com 등)=관리자/타 계정
      // BM = 자녀 한 명당 월 4,900원. 무료 첫 달은 자녀별(각 아이 등록 +30일). 계정 평생무료·포인트 결제분(app_subscriptions)은 전체 자녀에 적용(결제 붙기 전 과도기).
      const { data: subRow } = await supabase.from('app_subscriptions').select('paid_until,lifetime').eq('parent_id', user.id).maybeSingle();
      const paidMs = subRow?.paid_until ? new Date(subRow.paid_until + 'T00:00:00+09:00').getTime() : 0;
      setSub({ lifetime: !!subRow?.lifetime, paidMs });
      const { data: kids } = await supabase.from('children')
        .select('id,nickname,age_band,birth_year,birth_month,allergens,chronic_conditions,created_at')
        .eq('parent_id', user.id).order('id', { ascending: true });
      setChildren((kids as Child[]) || []);
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

  async function logout() {
    // scope:'local' = 서버 revoke 네트워크 호출 없이 이 브라우저 세션만 즉시 제거.
    // 기본 'global'은 revoke가 행/실패하면 await가 안 끝나(또는 throw) 리다이렉트가 안 돼 '로그아웃 안 됨'으로 보였음.
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* 무시 — 아래 정리·이동은 무조건 */ }
    try { localStorage.removeItem('mf_child'); } catch {}
    window.location.href = '/';   // 로그아웃 후엔 홈(예시화면)으로 — /signup은 로그인 팝업을 다시 띄워 부적절
  }

  // 자녀별 무료 체험 상태 — 각 아이 등록(created_at)+30일. 계정 평생무료·포인트 결제분은 전체 자녀에 적용(결제 붙기 전 과도기)
  const childStatus = (c: Child) => {
    if (sub?.lifetime) return { label: '🎉 평생무료', daysLeft: 9999, freeUntil: '' };
    const createdMs = c.created_at ? new Date(c.created_at).getTime() : Date.now();
    const effMs = Math.max(createdMs + 30 * 86400e3, sub?.paidMs ?? 0);
    const daysLeft = Math.max(0, Math.ceil((effMs - Date.now()) / 86400e3));
    const freeUntil = new Date(effMs).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
    return { label: daysLeft > 0 ? `무료 D-${daysLeft}` : '체험 종료', daysLeft, freeUntil };
  };

  const sts = children.map(childStatus);
  const activeFree = sts.filter((s) => s.daysLeft > 0).length;
  const soonFree = sts.reduce((m, s) => (s.daysLeft > 0 && s.daysLeft < m ? s.daysLeft : m), 9999);

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      <header className="px-5 pt-6 pb-3 border-b" style={{ borderColor: '#FFE8D0' }}>
        <h1 className="text-xl font-extrabold" style={{ color: '#1a2b4a' }}>내 정보</h1>
      </header>

      <div className="flex-1 px-5 py-4 pb-20">
        {loading ? (
          <p className="text-sm" style={{ color: '#9CA3AF' }}>불러오는 중...</p>
        ) : !account.email ? (
          <div className="text-center mt-12 px-6">
            <div className="text-4xl mb-3">👤</div>
            <p className="text-[14px] font-extrabold mb-1" style={{ color: '#1a2b4a' }}>로그인이 필요해요</p>
            <p className="text-[12px] leading-relaxed mb-5" style={{ color: '#8a7a6a' }}>카카오로 시작하면 우리 아이 정보·포인트·구독을<br />여기서 관리할 수 있어요.</p>
            <div className="flex justify-center"><LoginCta /></div>
          </div>
        ) : (
          <>
            {/* 비카카오 계정 경고 — 이 계정에 아이가 없을 때만(구글 가입 부모는 오탐 X). 데이터가 다른 계정에 있을 때 안내 */}
            {!account.isKakao && children.length === 0 && (
              <div className="rounded-2xl p-4 mb-3 border" style={{ background: '#FFF4E5', borderColor: '#FFD0A0' }}>
                <div className="text-[13px] font-extrabold mb-1" style={{ color: '#C45A00' }}>⚠️ 카카오 부모 계정이 아니에요</div>
                <div className="text-[11.5px] leading-relaxed mb-2.5" style={{ color: '#8a7a6a' }}>지금은 <strong>{account.email}</strong>(구글/관리자)로 로그인되어 있어요. 우리 아이 식단·코칭 데이터는 <strong>카카오 계정</strong>에 있어요 — 카카오로 다시 로그인하면 보여요.</div>
                <button onClick={async () => { try { await supabase.auth.signOut({ scope: 'local' }); } catch {} window.location.href = '/signup'; }} className="rounded-xl px-3.5 py-2 text-[12px] font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>카카오로 다시 로그인 →</button>
              </div>
            )}

            {/* 보호자 — 맨 위(이름) */}
            <div className="bg-white rounded-2xl px-4 py-3 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
              <div className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>{account.isKakao ? `${nickname || '카카오 회원'}님` : account.email}</div>
              <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>{account.isKakao ? '카카오 로그인' : (children.length === 0 ? '구글 로그인 · 부모 데이터는 카카오 계정에 있어요' : '구글 로그인')}</div>
            </div>

            {/* ━━━━━ ① 우리 아이 (보호자 바로 아래) ━━━━━ */}
            <div className="text-[11px] font-extrabold mb-1.5 px-1" style={{ color: '#C45A00' }}>👶 우리 아이</div>
            <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold" style={{ color: '#8a7a6a' }}>우리 아이들{children.length > 0 && <span style={{ color: '#C45A00' }}> · {children.length}명</span>}</div>
                <a href="/onboarding?add=1" className="text-[11px] font-extrabold" style={{ color: '#FF6B1A' }}>+ 자녀 추가</a>
              </div>
              {children.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-sm mb-2" style={{ color: '#8a7a6a' }}>아직 아이 정보가 없어요</p>
                  <a href="/onboarding" className="inline-block px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: '#FF6B1A' }}>아이 등록하기</a>
                </div>
              ) : children.map((c, i) => {
                const st = childStatus(c);
                return (
                  <div key={c.id} className="py-2.5" style={{ borderTop: i ? '1px solid #F5F0EA' : 'none' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>{c.nickname} <span className="text-xs font-semibold" style={{ color: '#C45A00' }}>{AGE_LABEL[c.age_band] || c.age_band}</span></div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={st.daysLeft > 0 ? { background: '#EAF6F0', color: '#16A085' } : { background: '#FDECEA', color: '#C62828' }}>{st.label}</span>
                    </div>
                    {c.birth_year && <div className="text-xs mt-0.5" style={{ color: '#8a7a6a' }}>{c.birth_year}년 {c.birth_month}월생</div>}
                    {(c.allergens?.length || c.chronic_conditions) ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.allergens?.map((a) => <span key={a} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#FFEBEE', color: '#C62828' }}>⚠ {a}</span>)}
                        {c.chronic_conditions?.split(/[,，·]/).map((x) => x.trim()).filter(Boolean).map((x) => <span key={x} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#FFF3E0', color: '#E65100' }}>🩺 {x}</span>)}
                      </div>
                    ) : null}
                    <a href={`/onboarding?edit=${c.id}`} className="inline-block mt-1.5 text-[11px] font-bold" style={{ color: '#FF6B1A' }}>정보·질환 수정 →</a>
                  </div>
                );
              })}
            </div>

            {/* ━━━━━ ② 결제 · 포인트 (한 묶음) ━━━━━ */}
            <div className="text-[11px] font-extrabold mb-1.5 px-1" style={{ color: '#C45A00' }}>💳 결제 · 포인트</div>

            {/* 구독 — 자녀 한 명당 월 4,900원(per-child) */}
            <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
              <div className="text-xs font-bold mb-1" style={{ color: '#8a7a6a' }}>구독 <span style={{ color: '#B0B0B0' }}>· 자녀 한 명당 월 4,900원</span></div>
              {sub?.lifetime ? (
                <div className="text-base font-extrabold" style={{ color: '#16A085' }}>🎉 평생 무료 <span className="text-[11px] font-semibold" style={{ color: '#9CA3AF' }}>· 전체 자녀 감사 혜택</span></div>
              ) : children.length === 0 ? (
                <div className="text-[12px]" style={{ color: '#9CA3AF' }}>아이를 등록하면 첫 달 무료로 시작해요</div>
              ) : activeFree > 0 ? (
                <>
                  <div className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>자녀 {children.length}명 <span style={{ color: '#C45A00' }}>· {activeFree}명 무료 체험 중</span></div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>가장 빠른 만료 D-{soonFree} · 이후 자녀당 월 4,900원{children.length > 1 ? ` (총 ${(children.length * 4900).toLocaleString()}원)` : ''}</div>
                  <a href="/care/upgrade" className="inline-block mt-2.5 rounded-xl px-3.5 py-2 text-[12px] font-extrabold" style={{ background: '#FFF0E0', color: '#C45A00' }}>챌린지·초대로 할인받기 →</a>
                </>
              ) : (
                <>
                  <div className="text-base font-extrabold" style={{ color: '#C62828' }}>무료 체험 종료</div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>계속 이용하려면 구독 · 자녀당 월 4,900원{children.length > 1 ? ` (자녀 ${children.length}명 총 ${(children.length * 4900).toLocaleString()}원)` : ''}</div>
                  <a href="/care/upgrade" className="inline-block mt-2.5 rounded-xl px-3.5 py-2 text-[12px] font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>구독하기 →</a>
                </>
              )}
              {!sub?.lifetime && (points?.balance ?? 0) >= 4900 && (
                <button onClick={redeemSub} disabled={redeeming} className="block w-full mt-2.5 rounded-xl py-2.5 text-[12px] font-extrabold text-white" style={{ background: redeeming ? '#9CA3AF' : '#16A085' }}>{redeeming ? '처리 중…' : '🪙 포인트로 1개월 연장 (4,900P 사용)'}</button>
              )}
            </div>

            {/* 내 포인트 잔액 */}
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
                        <span>{l.kind === 'meal_input' ? '끼니 기록' : l.kind === 'daycare_menu_bonus' ? '식단표 보너스' : l.kind === 'redeem_kit' ? '키트 구매' : l.kind}{l.meta?.date ? ` · ${l.meta.date}` : ''}</span>
                        <span style={{ color: l.amount > 0 ? '#16A085' : '#C62828', fontWeight: 700 }}>{l.amount > 0 ? '+' : ''}{l.amount}P</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* 포인트 모으는 방법 */}
            <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
              <div className="text-xs font-bold mb-2.5" style={{ color: '#8a7a6a' }}>🪙 포인트 모으는 방법 <span style={{ color: '#B0B0B0' }}>· 1P=1원, 키트·구독에 사용</span></div>
              {[
                { ic: '🍽', t: '끼니 기록', p: '+50P', d: '매 끼니 · 하루 5끼까지', on: true },
                { ic: '📋', t: '식단표 등록', p: '+1,000P', d: '어린이집 식단표 사진 업로드(월 1회)', on: true },
                { ic: '✏️', t: '첫 노하우 남기기', p: '+500P', d: <>팁 탭·도감에 우리 아이 노하우를 처음 남기면(1회) · 다른 엄마가 <strong>해봤어요</strong>로 응답해요</>, on: true },
                { ic: '🍳', t: '첫 레시피 올리기', p: '+500P', d: '도감 식재료에 버튼만 눌러 레시피를 처음 올리면(1회) · 그림 설명서처럼 자동 정리', on: true },
                { ic: '👥', t: '친구 가입', p: '+4,900P', d: <>친구가 <strong style={{ color: '#D6453D' }}>아이 첫 끼니를 입력</strong>하면 적립 · 많이 모으면 계속 무료</>, on: true },
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
              <div className="text-[10.5px] mt-2.5 pt-2.5" style={{ color: '#8a7a6a', borderTop: '1px solid #F5F0EA' }}>💡 친구 초대 링크는 아래 <strong>친구 초대</strong> 카드에 있어요. 많이 초대할수록 계속 무료!</div>
            </div>

            {/* 친구 초대 — 가입+첫 기록 시 +4,900P */}
            {ref && (
              <div className="rounded-2xl p-4 mb-3 border" style={{ background: '#FFF8F0', borderColor: '#FFE8D0' }}>
                <div className="text-xs font-bold mb-1" style={{ color: '#8a7a6a' }}>친구 초대 <span style={{ color: '#16A085' }}>· 가입 시 +4,900P</span></div>
                <div className="text-[11.5px] mb-2.5 leading-relaxed" style={{ color: '#8a7a6a' }}>내 링크로 친구가 <strong style={{ color: '#D6453D' }}>가입하고 첫 끼니를 기록</strong>하면 <strong style={{ color: '#C45A00' }}>+4,900P</strong>(한 달 구독값)가 쌓여요. 많이 초대할수록 계속 무료!</div>
                {(ref.signups ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    <span className="text-[10.5px] font-bold px-2 py-1 rounded-full" style={{ background: '#EAF6F0', color: '#16A085' }}>가입 {ref.signups}명</span>
                    <span className="text-[10.5px] font-bold px-2 py-1 rounded-full" style={{ background: '#EAF6F0', color: '#16A085' }}>적립 완료 {ref.earned}명</span>
                    {(ref.pending ?? 0) > 0 && <span className="text-[10.5px] font-bold px-2 py-1 rounded-full" style={{ background: '#FFF0E0', color: '#C45A00' }}>첫 기록 대기 {ref.pending}명</span>}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <input readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 text-[11px] px-2.5 py-2 rounded-lg" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280' }} />
                  <button onClick={copyInvite} className="text-[11px] font-bold px-3 py-2 rounded-lg" style={{ background: copied ? '#16A085' : '#1a2b4a', color: 'white' }}>{copied ? '복사됨' : '복사'}</button>
                  <button onClick={shareInvite} className="text-[11px] font-bold px-3 py-2 rounded-lg text-white" style={{ background: '#FF6B1A' }}>공유</button>
                </div>
              </div>
            )}
            {!ref && (
              <div className="rounded-2xl p-4 mb-3 border" style={{ background: '#FFF8F0', borderColor: '#FFE8D0' }}>
                <div className="text-xs font-bold mb-1" style={{ color: '#8a7a6a' }}>친구 초대</div>
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

            <button onClick={logout} className="w-full mt-4 py-3 rounded-xl text-sm font-bold border" style={{ borderColor: '#E5E7EB', color: '#6B7280' }}>
              로그아웃
            </button>
          </>
        )}
      </div>

      <BottomNav active="/care/me" />
    </main>
  );
}
