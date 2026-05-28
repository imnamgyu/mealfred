/**
 * / — 밀프레드 앱 홈 (care 대시보드)
 *
 * 로그인 시: 자녀 인사 + 오늘 기록 현황 + 영양 신호등 요약 + 거부 식재료 코스 + 빠른 진입
 * 비로그인 시: 가입 유도 + 도감 둘러보기
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { computeSignals } from '@/lib/nutrition';
import BottomNav from '@/components/BottomNav';

const STORAGE_KEY = 'mealfred_care_logs';
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const supabase = createSupabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState<string>('');
  const [childName, setChildName] = useState<string>('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [signalSummary, setSignalSummary] = useState({ green: 0, yellow: 0, red: 0, days: 0 });
  const [refused, setRefused] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10);
      });
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setLoggedIn(true);
        setNickname((user.user_metadata?.nickname as string) || '');
        const { data: child } = await supabase.from('children')
          .select('id,nickname').eq('parent_id', user.id).limit(1).maybeSingle();
        if (child) {
          setChildName(child.nickname);
          const { data: rows } = await supabase.from('meal_logs')
            .select('log_date,slot,ingredients,refused').eq('child_id', child.id).gte('log_date', dates[6]);
          const byDate: Record<string, string[]> = {};
          const ref: string[] = [];
          let tCount = 0;
          (rows || []).forEach((r: { log_date: string; slot: string; ingredients: string[] | null; refused: string | null }) => {
            if (!byDate[r.log_date]) byDate[r.log_date] = [];
            (r.ingredients || []).forEach((i) => byDate[r.log_date].push(i));
            if (r.refused) ref.push(r.refused);
            if (r.log_date === todayStr()) tCount++;
          });
          setTodayCount(tCount);
          const byDay = Object.values(byDate).filter((a) => a.length);
          if (byDay.length) {
            const sig = computeSignals(byDay);
            setSignalSummary({
              green: sig.filter((s) => s.level === 'green').length,
              yellow: sig.filter((s) => s.level === 'yellow').length,
              red: sig.filter((s) => s.level === 'red').length,
              days: byDay.length,
            });
          }
          setRefused([...new Set(ref)]);
        }
      } else {
        try {
          const logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
          const today = logs[todayStr()];
          if (today) setTodayCount(Object.keys(today).length);
        } catch {}
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = childName ? `${childName} 보호자님` : nickname ? `${nickname}님` : '안녕하세요';

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      <header className="px-5 pt-7 pb-4" style={{ background: 'linear-gradient(160deg,#FFF5EB,#FFE8D0)' }}>
        <div className="text-xs font-bold mb-1" style={{ color: '#C45A00' }}>밀프레드</div>
        <h1 className="text-xl font-extrabold" style={{ color: '#1a2b4a' }}>
          {loading ? '...' : `${greeting}, 오늘도 한 걸음 🌱`}
        </h1>
        <p className="text-xs mt-1" style={{ color: '#8a7a6a' }}>편식 교정의 핵심은 소량 반복 노출 30번이에요</p>
      </header>

      <div className="flex-1 px-5 py-4">
        <a href="/care" className="block rounded-2xl p-4 mb-3 text-white" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold opacity-90">오늘 식사 기록</div>
              <div className="text-2xl font-extrabold mt-0.5">{todayCount} / 6 끼</div>
            </div>
            <div className="text-right">
              <div className="text-3xl">✏️</div>
              <div className="text-[11px] font-bold mt-1">기록하기 →</div>
            </div>
          </div>
        </a>

        {loggedIn && signalSummary.days >= 3 && (
          <a href="/care/report" className="block bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>최근 {signalSummary.days}일 영양 신호등</h3>
              <span className="text-[11px] font-bold" style={{ color: '#C45A00' }}>자세히 →</span>
            </div>
            <div className="flex gap-3">
              <span className="text-sm font-bold" style={{ color: '#16A085' }}>🟢 {signalSummary.green} 충분</span>
              <span className="text-sm font-bold" style={{ color: '#F9A825' }}>🟡 {signalSummary.yellow} 가끔</span>
              <span className="text-sm font-bold" style={{ color: '#E53935' }}>🔴 {signalSummary.red} 부족</span>
            </div>
          </a>
        )}

        {refused.length > 0 && (
          <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
            <h3 className="text-sm font-extrabold mb-1" style={{ color: '#1a2b4a' }}>우리 아이 친해지기 코스</h3>
            <p className="text-[11px] mb-2.5" style={{ color: '#8a7a6a' }}>거부한 식재료, 부드러운 요리부터 천천히 시작해요</p>
            <div className="flex flex-wrap gap-1.5">
              {refused.slice(0, 6).map((f, i) => (
                <a key={i} href={`/foods/${encodeURIComponent(f.split(/[\s,(]/)[0])}`}
                  className="text-xs px-3 py-1.5 rounded-full font-bold" style={{ background: '#FFF5EB', color: '#C45A00', border: '1px solid #FFD0A0' }}>
                  {f.split(/[\s,(]/)[0]} 레시피 →
                </a>
              ))}
            </div>
          </div>
        )}

        {!loading && !loggedIn && (
          <a href="/signup" className="block bg-white rounded-2xl p-4 mb-3 shadow-sm border text-center" style={{ borderColor: '#FFD0A0' }}>
            <div className="text-3xl mb-1">🌱</div>
            <div className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>카카오로 1초 가입</div>
            <div className="text-xs mt-1" style={{ color: '#8a7a6a' }}>기록 클라우드 저장 + 영양 진단 + 맞춤 레시피</div>
          </a>
        )}

        <div className="grid grid-cols-2 gap-3 mt-1">
          <a href="/foods" className="bg-white rounded-2xl p-4 shadow-sm border text-center" style={{ borderColor: '#FFE8D0' }}>
            <div className="text-3xl mb-1">🗂</div>
            <div className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>식재료 도감</div>
            <div className="text-[11px] mt-0.5" style={{ color: '#8a7a6a' }}>147종 영양·레시피</div>
          </a>
          <a href="/care/report" className="bg-white rounded-2xl p-4 shadow-sm border text-center" style={{ borderColor: '#FFE8D0' }}>
            <div className="text-3xl mb-1">📊</div>
            <div className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>영양 진단</div>
            <div className="text-[11px] mt-0.5" style={{ color: '#8a7a6a' }}>신호등 + 부족 보충</div>
          </a>
        </div>
      </div>

      <BottomNav active="/" />
    </main>
  );
}
