/**
 * /care/calendar — 엄마가 기록한 끼니 회고(월 달력).
 * "내가 우리 아이 뭐 먹였더라" — 기록한 식단을 달력처럼 한눈에. 날짜 탭 → 그 날 기록으로.
 */
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import { kstToday } from '@/lib/date';

type Row = { log_date: string; slot: string; menus: string[] | null; place: string | null };
const WD = ['일', '월', '화', '수', '목', '금', '토'];

export default function MealCalendar() {
  const supabase = createSupabaseBrowser();
  const [childId, setChildId] = useState<string | null>(null);
  const [childName, setChildName] = useState('');
  const [month, setMonth] = useState(() => kstToday().slice(0, 7));   // 'YYYY-MM'
  const [byDate, setByDate] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);
  const [showFuture, setShowFuture] = useState(false);   // 미래 식단표(미리입력분) 접기 — 어제·최근 기록을 가리지 않게
  const [diag, setDiag] = useState<{ oneliner: string; letter_date: string } | null>(null);   // 최근 식단 진단(코치 편지 oneliner) — 홈에서 달력으로 이동

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const sel = typeof window !== 'undefined' ? localStorage.getItem('mf_child') : null;
      let q = supabase.from('children').select('id,nickname').eq('parent_id', user.id);
      if (sel) q = q.eq('id', sel);
      const { data: child } = await q.order('id', { ascending: true }).limit(1).maybeSingle();
      if (child) {
        setChildId(child.id); setChildName(child.nickname || '우리 아이');
        // 최근 식단 진단 — 코치 편지의 oneliner(엔진 진단 한 줄). 홈에서 이 자리(달력)로 이동.
        supabase.from('coach_letters').select('oneliner,letter_date').eq('child_id', child.id)
          .not('oneliner', 'is', null).order('letter_date', { ascending: false }).limit(1).maybeSingle()
          .then(({ data }) => { if (data?.oneliner) setDiag({ oneliner: data.oneliner, letter_date: data.letter_date }); });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!childId) return;
    setLoading(true);
    const [y, m] = month.split('-').map(Number);
    const nd = new Date(Date.UTC(y, m, 1));   // 다음 달 1일 — '…-31' 하드코딩은 6·4·9·11월·2월에 무효날짜라 쿼리 에러(0건) 났음
    const nextStart = `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, '0')}-01`;
    supabase.from('meal_logs').select('log_date,slot,menus,place')
      .eq('child_id', childId).gte('log_date', `${month}-01`).lt('log_date', nextStart)
      .then(({ data }) => {
        const g: Record<string, Row[]> = {};
        (data as Row[] | null || []).forEach((r) => { (g[r.log_date] ||= []).push(r); });
        setByDate(g); setLoading(false);
      });
  }, [childId, month]);

  const [y, m] = month.split('-').map(Number);
  const firstWd = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(firstWd).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  const todayKst = kstToday();
  const shiftMonth = (delta: number) => { const d = new Date(Date.UTC(y, m - 1 + delta, 1)); setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`); };

  const loggedDays = Object.keys(byDate).length;
  const totalMeals = Object.values(byDate).reduce((a, rs) => a + rs.length, 0);

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      <header className="px-5 pt-6 pb-3 border-b" style={{ borderColor: '#FFE8D0' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold" style={{ color: '#1a2b4a' }}>📅 식단 달력</h1>
          <Link href="/care" className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#FFF5EB', color: '#C45A00' }}>＋ 기록하기</Link>
        </div>
        <p className="text-xs mt-1" style={{ color: '#8a7a6a' }}>{childName ? `${childName}가 ` : ''}이번 달 먹은 끼니를 한눈에 — 날짜를 누르면 그 날 기록으로 가요</p>
      </header>

      {/* 월 네비 */}
      <div className="flex items-center justify-between px-5 py-3">
        <button onClick={() => shiftMonth(-1)} className="text-lg px-3 py-1 rounded-lg" style={{ background: '#FAFAF7', color: '#6B7280' }}>‹</button>
        <div className="text-center">
          <div className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>{y}년 {m}월</div>
          {!loading && <div className="text-[11px]" style={{ color: '#16A085' }}>기록 {loggedDays}일 · {totalMeals}끼</div>}
        </div>
        <button onClick={() => shiftMonth(1)} disabled={month >= todayKst.slice(0, 7)} className="text-lg px-3 py-1 rounded-lg" style={{ background: '#FAFAF7', color: month >= todayKst.slice(0, 7) ? '#D1D5DB' : '#6B7280' }}>›</button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 px-3 mb-1">
        {WD.map((w, i) => <div key={w} className="text-center text-[10px] font-bold" style={{ color: i === 0 ? '#E07A5F' : i === 6 ? '#5B8DEF' : '#9CA3AF' }}>{w}</div>)}
      </div>

      {/* 달력 그리드 */}
      <div className="grid grid-cols-7 gap-1 px-3">
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} />;
          const ds = `${month}-${String(d).padStart(2, '0')}`;
          const rows = byDate[ds] || [];
          const menus = [...new Set(rows.flatMap((r) => r.menus || []))];
          const isToday = ds === todayKst;
          const isFuture = ds > todayKst;
          const hasHome = rows.some((r) => r.place !== 'daycare');
          return (
            <Link key={ds} href={`/care?date=${ds}`} className="rounded-lg p-1.5 min-h-[74px] flex flex-col"
              style={{ background: isToday ? '#FFF5EB' : rows.length ? '#FFFFFF' : '#FAFAF7', border: `1px solid ${isToday ? '#FFB870' : rows.length ? '#FFE8D0' : '#F0F0F0'}`, opacity: isFuture ? 0.45 : 1 }}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-extrabold" style={{ color: isToday ? '#C45A00' : '#374151' }}>{d}</span>
                {rows.length > 0 && <span className="text-[8px] font-bold px-1 rounded-full" style={{ background: hasHome ? '#EAF6F0' : '#EEF2FB', color: hasHome ? '#16A085' : '#5B8DEF' }}>{rows.length}</span>}
              </div>
              <div className="flex-1 overflow-hidden mt-0.5">
                {menus.slice(0, 3).map((mn, k) => <div key={k} className="text-[9.5px] leading-tight truncate" style={{ color: '#6B7280' }}>{mn}</div>)}
                {menus.length > 3 && <div className="text-[8.5px]" style={{ color: '#B0B0B0' }}>+{menus.length - 3}</div>}
              </div>
            </Link>
          );
        })}
      </div>

      {/* 이번 달 먹은 메뉴 — 날짜별 풀 메뉴(달력 셀이 좁아 안 보이던 것 해소) */}
      {!loading && loggedDays > 0 && (
        <div className="px-4 mt-5">
          <div className="text-[12px] font-extrabold mb-2" style={{ color: '#8a7a6a' }}>📋 날짜별 먹은 메뉴</div>
          {(() => {
            const entries = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
            const renderRow = ([ds, rows]: [string, Row[]]) => {
              const menus = [...new Set(rows.flatMap((r) => r.menus || []))];
              if (!menus.length) return null;
              const [, mm, dd] = ds.split('-');
              const future = ds > todayKst;
              return (
                <Link key={ds} href={`/care?date=${ds}`} className="flex gap-3 py-2.5" style={{ borderBottom: '1px solid #F5EFE7', opacity: future ? 0.8 : 1 }}>
                  <div className="text-[12.5px] font-extrabold flex-shrink-0 w-10" style={{ color: future ? '#9CA3AF' : '#C45A00' }}>{Number(mm)}/{Number(dd)}</div>
                  <div className="flex-1 flex flex-wrap gap-1">
                    {menus.map((mn, k) => <span key={k} className="text-[11.5px] px-2 py-0.5 rounded-full" style={{ background: '#FFF5EB', color: '#5a4a3a' }}>{mn}</span>)}
                  </div>
                </Link>
              );
            };
            const past = entries.filter(([ds]) => ds <= todayKst);     // 오늘·과거 = 실제 회고(최신 먼저)
            const future = entries.filter(([ds]) => ds > todayKst);    // 미래 = 미리 입력한 식단표 → 접어둠
            return (
              <>
                {past.map(renderRow)}
                {future.length > 0 && (
                  <div className="mt-2">
                    <button onClick={() => setShowFuture((v) => !v)} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-extrabold rounded-xl" style={{ background: '#FAFAF7', color: '#8a7a6a', border: '1px solid #EFE7DC' }}>
                      📅 앞으로의 식단표 {future.length}일분 {showFuture ? '접기 ▲' : '펼치기 ▾'}
                    </button>
                    {showFuture && <div className="mt-1">{future.map(renderRow)}</div>}
                  </div>
                )}
                {past.length === 0 && future.length === 0 && null}
              </>
            );
          })()}
        </div>
      )}

      {/* 최근 식단 진단 — 코치 편지 한 줄 진단(홈에서 달력으로 이동). 이 달 회고와 같은 자리에서 본다 */}
      {diag && (
        <div className="mx-5 mb-3 rounded-2xl p-4 shadow-sm border" style={{ borderColor: '#FFE8D0', background: 'white' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-sm font-bold" style={{ color: '#1a2b4a' }}>📊 최근 식단 진단</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#FFF0E0', color: '#C45A00' }}>{diag.letter_date.slice(5)}</span>
          </div>
          <p className="text-[12.5px] leading-relaxed" style={{ color: '#5a4a3a' }}>{diag.oneliner}</p>
          <div className="text-[10px] mt-2" style={{ color: '#9CA3AF' }}>학계 기준(WHO·KDRI·SOS·HabEat)으로 자동 분석 · 매일 새 진단</div>
        </div>
      )}

      {!loading && loggedDays === 0 && (
        <div className="text-center mt-8 px-8">
          <div className="text-3xl mb-2">🍽️</div>
          <p className="text-[13px]" style={{ color: '#8a7a6a' }}>이번 달 기록이 아직 없어요.<br /><Link href="/care" className="font-bold" style={{ color: '#C45A00' }}>오늘 끼니 기록하기 →</Link></p>
        </div>
      )}
      {loading && <div className="text-center mt-8 text-xs" style={{ color: '#9CA3AF' }}>불러오는 중…</div>}

      <div className="flex-1" />
      <BottomNav active="/care" />
    </main>
  );
}
