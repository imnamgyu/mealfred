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

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const sel = typeof window !== 'undefined' ? localStorage.getItem('mf_child') : null;
      let q = supabase.from('children').select('id,nickname').eq('parent_id', user.id);
      if (sel) q = q.eq('id', sel);
      const { data: child } = await q.order('id', { ascending: true }).limit(1).maybeSingle();
      if (child) { setChildId(child.id); setChildName(child.nickname || '우리 아이'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!childId) return;
    setLoading(true);
    const [y, m] = month.split('-');
    supabase.from('meal_logs').select('log_date,slot,menus,place')
      .eq('child_id', childId).gte('log_date', `${y}-${m}-01`).lte('log_date', `${y}-${m}-31`)
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
    <main className="max-w-md mx-auto min-h-screen flex flex-col pb-20" style={{ background: '#FFFDFB' }}>
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
            <Link key={ds} href={`/care?date=${ds}`} className="rounded-lg p-1 min-h-[58px] flex flex-col"
              style={{ background: isToday ? '#FFF5EB' : rows.length ? '#FFFFFF' : '#FAFAF7', border: `1px solid ${isToday ? '#FFB870' : rows.length ? '#FFE8D0' : '#F0F0F0'}`, opacity: isFuture ? 0.45 : 1 }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold" style={{ color: isToday ? '#C45A00' : '#374151' }}>{d}</span>
                {rows.length > 0 && <span className="text-[8px] font-bold px-1 rounded-full" style={{ background: hasHome ? '#EAF6F0' : '#EEF2FB', color: hasHome ? '#16A085' : '#5B8DEF' }}>{rows.length}</span>}
              </div>
              <div className="flex-1 overflow-hidden mt-0.5">
                {menus.slice(0, 3).map((mn, k) => <div key={k} className="text-[8.5px] leading-tight truncate" style={{ color: '#6B7280' }}>{mn}</div>)}
                {menus.length > 3 && <div className="text-[8px]" style={{ color: '#B0B0B0' }}>+{menus.length - 3}</div>}
              </div>
            </Link>
          );
        })}
      </div>

      {!loading && loggedDays === 0 && (
        <div className="text-center mt-8 px-8">
          <div className="text-3xl mb-2">🍽️</div>
          <p className="text-[13px]" style={{ color: '#8a7a6a' }}>이번 달 기록이 아직 없어요.<br /><Link href="/care" className="font-bold" style={{ color: '#C45A00' }}>오늘 끼니 기록하기 →</Link></p>
        </div>
      )}
      {loading && <div className="text-center mt-8 text-xs" style={{ color: '#9CA3AF' }}>불러오는 중…</div>}

      <BottomNav active="/care" />
    </main>
  );
}
