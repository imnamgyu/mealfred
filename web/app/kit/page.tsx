/**
 * /kit — 편식키트 탭 (구 팁/커뮤니티 탭 개편, 2026-08-10 이사님 결정).
 * 골고루 키트(정기·AI 개인화·주 19,900원 베타 잠정가) + 집중 키트(9종 코스·출시 준비 중·가격 미표기).
 * 사전예약 = 결제 아님(이름·연락처·주소 수집 → 확정 시 개별 연락). 포인트는 확정 시 1P=1원 할인 차감.
 */
'use client';
import { useState, useEffect, useCallback } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import LoginCta from '@/components/LoginCta';
import { FOCUS_COURSES, GOLLO_WEEK_PRICE, ORDER_STATUS_LABEL, normalizePhone, type KitType, type FocusCourse } from '@/lib/kitOrder';

type MyOrder = { id: string; kit_type: KitType; course: string | null; use_points: number; status: string; created_at: string };

const COURSE_EM: Record<FocusCourse, string> = { 당근: '🥕', 양파: '🧅', 두부: '🍲', 버섯: '🍄', 브로콜리: '🥦', 시금치: '🥬', 토마토: '🍅', 파프리카: '🫑', 가지: '🍆' };

export default function KitPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [balance, setBalance] = useState(0);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [form, setForm] = useState<{ open: boolean; type: KitType }>({ open: false, type: 'gollo' });
  const [justDone, setJustDone] = useState<KitType | null>(null);

  const supabase = createSupabaseBrowser();

  const loadMine = useCallback(async (uid: string) => {
    const { data: pb } = await supabase.from('point_balance').select('balance').eq('parent_id', uid).maybeSingle();
    setBalance(pb?.balance ?? 0);
    const { data: os } = await supabase.from('kit_orders')
      .select('id,kit_type,course,use_points,status,created_at')
      .eq('parent_id', uid).order('created_at', { ascending: false }).limit(10);
    setOrders((os as MyOrder[]) || []);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
      if (data.user) loadMine(data.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = (t: KitType) => orders.find((o) => o.kit_type === t && o.status === 'requested');

  return (
    <main className="max-w-md mx-auto w-full min-h-screen flex flex-col overflow-x-hidden" style={{ background: '#FFFDFB' }}>
      <header className="flex items-center justify-between px-5 pt-6 pb-1">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>🎁 키트</h1>
          <span className="text-[11px] font-bold" style={{ color: '#9CA3AF' }}>매주 골고루, 막히면 집중.</span>
        </div>
        {!loggedIn && <LoginCta />}
      </header>

      {/* 포인트 안내 스트립 */}
      <div className="px-5 pt-2 pb-3">
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#FFF8F0,#FFE8D0)', border: '1px solid #FFD0A0' }}>
          <div className="text-[12px] font-bold" style={{ color: '#8a7a6a' }}>
            🪙 내 포인트 <strong className="text-[14px]" style={{ color: '#C45A00' }}>{loggedIn ? balance.toLocaleString() : 0}P</strong>
          </div>
          <div className="text-[10.5px] text-right leading-snug" style={{ color: '#8a7a6a' }}>키트 확정 시 <b style={{ color: '#16A085' }}>1P=1원 할인</b><br />끼니 기록마다 +50P</div>
        </div>
      </div>

      <div className="flex-1 px-5 pb-4 space-y-3">
        {/* 골고루 키트 */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📦</span>
            <h2 className="text-[15px] font-extrabold" style={{ color: '#1a2b4a' }}>골고루 키트</h2>
            <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: '#FFF0E0', color: '#C45A00' }}>정기 · AI 개인화</span>
          </div>
          <div className="mb-2">
            <span className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>주 19,900원</span>
            <span className="text-[11px] ml-1.5" style={{ color: '#9CA3AF' }}>월 약 79,600원 · *베타 잠정가</span>
          </div>
          <ul className="text-[12px] leading-relaxed space-y-1 mb-2.5" style={{ color: '#5a6575' }}>
            <li>🧬 <b>우리 아이 데이터로 매주 배합</b> — 핵심 도전 5종 + 맛보기 2종, 총 7종 소량</li>
            <li>🍽 집 14끼니(아침·저녁) 분량 · 매주 회전 = 한 달 28종 노출</li>
            <li>🃏 식재료마다 <b>&ldquo;왜 왔는지&rdquo; 이유 카드</b> + SOS 단계 가이드 동봉</li>
            <li>🧊 신선 콜드체인 · 매운맛/알레르겐/연령 부적합 자동 제외</li>
          </ul>
          <a href="/" className="block text-[11.5px] font-bold mb-3" style={{ color: '#1565C0' }}>👀 코칭 홈에서 &lsquo;이번 주 우리 아이 박스 구성&rsquo; 미리보기 →</a>
          {pending('gollo') ? (
            <div className="rounded-xl py-3 text-center text-sm font-extrabold" style={{ background: '#EAF6F0', color: '#16A085' }}>✓ 사전예약 접수됨 — 확정 시 연락드려요</div>
          ) : (
            <button onClick={() => loggedIn ? setForm({ open: true, type: 'gollo' }) : undefined} disabled={!loggedIn}
              className="w-full rounded-xl py-3.5 text-sm font-extrabold text-white" style={{ background: loggedIn ? 'linear-gradient(135deg,#FF6B1A,#C45A00)' : '#D1D5DB' }}>
              {loggedIn ? '📦 사전예약 신청하기' : '로그인하면 사전예약할 수 있어요'}
            </button>
          )}
          <a href="https://www.mealfred.com/box-product.html?app=1" target="_blank" rel="noopener" className="block text-center text-[11px] font-bold mt-2" style={{ color: '#9CA3AF' }}>구성·안전 기준 자세히 보기 →</a>
        </section>

        {/* 집중 키트 */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: '#E8E4F0' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎯</span>
            <h2 className="text-[15px] font-extrabold" style={{ color: '#1a2b4a' }}>집중 키트</h2>
            <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: '#EEF2FF', color: '#3949AB' }}>출시 준비 중</span>
          </div>
          <p className="text-[12px] leading-relaxed mb-2" style={{ color: '#5a6575' }}>
            자꾸 막히는 <b>식재료 1가지를 5주간 집중 공략</b>해요 — 1가지 식재료 × 7가지 형태, SOS 6단계 활동 카드, 부모 가이드까지. 주 1회 × 5주 배송.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {FOCUS_COURSES.map((c) => (
              <span key={c} className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#F8F7FC', color: '#3949AB', border: '1px solid #E8E4F0' }}>{COURSE_EM[c]} {c}</span>
            ))}
          </div>
          {pending('focus') ? (
            <div className="rounded-xl py-3 text-center text-sm font-extrabold" style={{ background: '#EAF6F0', color: '#16A085' }}>✓ 출시 사전신청 접수됨 — 출시되면 가장 먼저 알려드려요</div>
          ) : (
            <button onClick={() => loggedIn ? setForm({ open: true, type: 'focus' }) : undefined} disabled={!loggedIn}
              className="w-full rounded-xl py-3 text-sm font-extrabold" style={loggedIn ? { background: 'white', color: '#C45A00', border: '1.5px solid #FF6B1A' } : { background: '#F4F4F5', color: '#B0B0B0', border: '1.5px solid #E5E7EB' }}>
              {loggedIn ? '🔔 출시 사전신청 (가격 확정 전)' : '로그인하면 사전신청할 수 있어요'}
            </button>
          )}
        </section>

        {/* 내 신청 내역 */}
        {orders.length > 0 && (
          <section className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: '#F0E8E0' }}>
            <div className="text-xs font-bold mb-2" style={{ color: '#8a7a6a' }}>📋 내 신청 내역</div>
            <div className="space-y-1.5">
              {orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-[12px]">
                  <span style={{ color: '#1a2b4a', fontWeight: 700 }}>
                    {o.kit_type === 'gollo' ? '📦 골고루 키트' : `🎯 집중 키트${o.course ? ` · ${o.course}` : ''}`}
                    {o.use_points > 0 && <span className="ml-1" style={{ color: '#16A085', fontWeight: 700 }}>(-{o.use_points.toLocaleString()}P 할인 신청)</span>}
                  </span>
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={o.status === 'requested' ? { background: '#FFF0E0', color: '#C45A00' } : o.status === 'cancelled' ? { background: '#F4F4F5', color: '#9CA3AF' } : { background: '#EAF6F0', color: '#16A085' }}>
                    {ORDER_STATUS_LABEL[o.status] || o.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-[10.5px] leading-relaxed px-1" style={{ color: '#9CA3AF' }}>
          사전예약은 결제가 아니에요. 확정되면 입력하신 연락처로 개별 안내드리고, 그때 포인트 할인(1P=1원)이 적용돼요. 신청 정보(이름·연락처·주소)는 키트 배송 안내에만 사용해요.
        </p>
      </div>

      {form.open && (
        <ReserveSheet type={form.type} balance={balance} onClose={() => setForm((f) => ({ ...f, open: false }))}
          onDone={(t) => {
            setForm((f) => ({ ...f, open: false }));
            setJustDone(t); setTimeout(() => setJustDone(null), 3000);
            supabase.auth.getUser().then(({ data }) => data.user && loadMine(data.user.id));
          }} />
      )}
      {justDone && (
        <div className="fixed left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2 text-[12.5px] font-extrabold text-white shadow-md" style={{ bottom: 76, background: '#16A085' }}>
          🎉 신청 완료! 확정 시 연락드려요
        </div>
      )}
      <BottomNav active="/kit" />
    </main>
  );
}

/** 사전예약 바텀시트 — 수취인·연락처·주소(+ 집중은 코스, 골고루는 포인트 할인) 수집. */
function ReserveSheet({ type, balance, onClose, onDone }: { type: KitType; balance: number; onClose: () => void; onDone: (t: KitType) => void }) {
  const [course, setCourse] = useState<FocusCourse | ''>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [usePts, setUsePts] = useState(true);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const maxPts = type === 'gollo' ? Math.min(balance, GOLLO_WEEK_PRICE) : 0;

  async function submit() {
    if (busy) return;
    if (type === 'focus' && !course) return setErr('집중할 코스를 골라주세요');
    if (!name.trim()) return setErr('받는 분 이름을 입력해주세요');
    if (!normalizePhone(phone)) return setErr('휴대폰 번호를 확인해주세요 (예: 010-1234-5678)');
    if (address.trim().length < 5) return setErr('배송 주소를 입력해주세요');
    if (!consent) return setErr('배송 안내용 정보 수집에 동의해주세요');
    setErr(null); setBusy(true);
    const r = await fetch('/api/kit/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kit_type: type, course: course || undefined, recipient_name: name, phone, address, use_points: usePts ? maxPts : 0 }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.ok) onDone(type);
    else setErr(r?.error === 'duplicate' ? '이미 접수된 신청이 있어요 — 확정 시 연락드려요' : '신청에 실패했어요. 잠시 후 다시 시도해주세요');
  }

  const inputStyle = { border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 12px', fontSize: 14, width: '100%', color: '#1a2b4a', background: 'white' } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(26,43,74,0.45)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-7 max-h-[85vh] overflow-y-auto" style={{ background: '#FFFDFB' }} onClick={(e) => e.stopPropagation()}>
        <div className="text-[15px] font-extrabold mb-1" style={{ color: '#1a2b4a' }}>
          {type === 'gollo' ? '📦 골고루 키트 사전예약' : '🎯 집중 키트 출시 사전신청'}
        </div>
        <p className="text-[11.5px] mb-3.5" style={{ color: '#8a7a6a' }}>
          {type === 'gollo' ? '결제가 아니에요 — 확정 시 연락드리고, 그때 포인트 할인이 적용돼요.' : '가격 확정 전이라 신청만 받아요 — 출시되면 가장 먼저 안내드려요.'}
        </p>

        {type === 'focus' && (
          <div className="mb-3">
            <div className="text-[12px] font-bold mb-1.5" style={{ color: '#5a6575' }}>집중할 식재료 코스</div>
            <div className="flex flex-wrap gap-1.5">
              {FOCUS_COURSES.map((c) => (
                <button key={c} onClick={() => setCourse(c)} className="text-[12px] font-bold px-3 py-1.5 rounded-full"
                  style={course === c ? { background: '#1a2b4a', color: 'white', border: '1px solid #1a2b4a' } : { background: 'white', color: '#3949AB', border: '1px solid #E8E4F0' }}>
                  {COURSE_EM[c]} {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2.5 mb-3">
          <input style={inputStyle} placeholder="받는 분 이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <input style={inputStyle} placeholder="휴대폰 번호 (010-1234-5678)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={13} />
          <input style={inputStyle} placeholder="배송 주소" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
        </div>

        {type === 'gollo' && maxPts > 0 && (
          <label className="flex items-center gap-2 mb-3 text-[12.5px] font-bold" style={{ color: '#1a2b4a' }}>
            <input type="checkbox" checked={usePts} onChange={(e) => setUsePts(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#FF6B1A' }} />
            <span>보유 포인트로 <b style={{ color: '#16A085' }}>{maxPts.toLocaleString()}P 할인</b> 신청 <span className="font-normal text-[11px]" style={{ color: '#9CA3AF' }}>(확정 시 차감)</span></span>
          </label>
        )}

        <label className="flex items-start gap-2 mb-4 text-[11.5px] leading-snug" style={{ color: '#5a6575' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 16, height: 16, marginTop: 1, accentColor: '#FF6B1A' }} />
          <span>키트 배송 안내를 위해 이름·연락처·주소를 수집·이용하는 데 동의해요 <b>(필수)</b></span>
        </label>

        {err && <p className="text-[12px] font-bold mb-2.5" style={{ color: '#C62828' }}>{err}</p>}

        <button onClick={submit} disabled={busy} className="w-full rounded-xl py-3.5 text-sm font-extrabold text-white" style={{ background: busy ? '#9CA3AF' : 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>
          {busy ? '접수 중…' : type === 'gollo' ? '사전예약 접수하기' : '출시 사전신청 접수하기'}
        </button>
      </div>
    </div>
  );
}
