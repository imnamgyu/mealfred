/**
 * /foods — 식재료 도감 (care.html UI 포팅)
 *
 * "우리 아이 친해지기 훈련" — 식재료별 노출/먹음 카운터 + 30가지 목표 진척.
 * 로그인: meal_logs에서 식재료 빈도 집계. 비로그인: 0 (기록 유도).
 * SEO: 147 상세는 /foods/[slug] SSG가 담당, 이 메인은 앱 도감.
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';

const STORAGE_KEY = 'mealfred_care_logs';

type Ing = { nm: string; cat: string; grade: string; em: string };
type Stat = { exposure: number; eat: number };

// 카테고리 → 필터 그룹 매핑
const CAT_FILTER: Record<string, string> = {
  '잎채소': 'leaf', '뿌리채소': 'root', '열매채소': 'fruitveg', '십자화과': 'fruitveg',
  '콩_콩제품': 'bean', '콩제품': 'bean', '생선': 'fish', '갑각_조개': 'fish', '해조류': 'fish',
  '버섯': 'mushroom', '과일': 'fruit', '유제품': 'dairy', '곡물_탄수': 'grain', '곡류': 'grain',
  '고기': 'meat', '계란': 'meat', '견과_씨앗': 'nut', '기타채소': 'etc', '향신_허브': 'etc',
  '발효식품': 'etc', '가공식품': 'etc',
};
const FILTERS = [
  { k: 'all', label: '전체' },
  { k: 'never', label: '🚨 아직 못 먹음' },
  { k: 'leaf', label: '🥬 잎채소' },
  { k: 'root', label: '🥕 뿌리' },
  { k: 'fruitveg', label: '🎃 열매·박과' },
  { k: 'bean', label: '🫘 콩' },
  { k: 'fish', label: '🐟 생선·해산물' },
  { k: 'meat', label: '🍗 고기·계란' },
  { k: 'mushroom', label: '🍄 버섯' },
  { k: 'fruit', label: '🍓 과일' },
  { k: 'dairy', label: '🥛 유제품' },
  { k: 'grain', label: '🌾 곡물' },
];
// 중요도: 필수 ⭐⭐⭐ · 권장 ⭐⭐ · 일반/향신료 ⭐
const GRADE_META: Record<string, { stars: string; label: string }> = {
  '필수': { stars: '⭐⭐⭐', label: '필수' },
  '권장': { stars: '⭐⭐', label: '권장' },
  '향신료': { stars: '⭐', label: '향신료' },
};
function gradeMeta(g: string) { return GRADE_META[g] || { stars: '⭐', label: '일반' }; }

// 노출 횟수 → 상태 (친해지기 진척)
function statusOf(s: Stat): 'never' | 'trying' | 'familiar' {
  if (s.exposure === 0) return 'never';        // 아직 못 먹음
  if (s.eat < 3 && s.exposure >= 3) return 'trying'; // 노출은 했는데 잘 안 먹음
  return s.eat >= 3 ? 'familiar' : 'trying';
}
const STATUS_META = {
  never: { label: '아직 못 먹음', color: '#9CA3AF', bg: '#FAFAF7', border: '#E5E7EB' },
  trying: { label: '친해지는 중', color: '#F57F17', bg: '#FFF8E1', border: '#F9A825' },
  familiar: { label: '잘 먹어요', color: '#1B5E20', bg: '#E8F5E9', border: '#16A085' },
};
const EXPOSURE_TARGET = 15; // 노출 권고 (8~15회, 편식 심하면 ↑)

export default function FoodsDex() {
  const supabase = createSupabaseBrowser();
  const [pool, setPool] = useState<Ing[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    fetch('/ingredients-light.json').then((r) => r.json()).then((d) => setPool(d.ingredients)).catch(() => {});
    (async () => {
      const counts: Record<string, Stat> = {};
      const add = (nm: string, ate: boolean | null) => {
        if (!counts[nm]) counts[nm] = { exposure: 0, eat: 0 };
        counts[nm].exposure++;
        if (ate !== false) counts[nm].eat++;  // 거부(false)만 안 먹음 처리
      };
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setLoggedIn(true);
        const { data: child } = await supabase.from('children').select('id').eq('parent_id', user.id).limit(1).maybeSingle();
        if (child) {
          const { data: rows } = await supabase.from('meal_logs').select('ingredients,ate_well').eq('child_id', child.id);
          (rows || []).forEach((r: { ingredients: string[] | null; ate_well: boolean | null }) => {
            (r.ingredients || []).forEach((nm) => add(nm, r.ate_well));
          });
        }
      } else {
        try {
          const logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
          Object.values(logs).forEach((day) => {
            Object.values(day as Record<string, { ingredients?: { name: string }[]; ateWell?: boolean | null }>).forEach((e) => {
              (e.ingredients || []).forEach((t) => add(t.name, e.ateWell ?? null));
            });
          });
        } catch {}
      }
      setStats(counts);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getStat = (nm: string): Stat => stats[nm] || { exposure: 0, eat: 0 };

  // 먹어본 종 수 (eat>=1) → 30 / 130 목표
  const eatenCount = pool.filter((p) => getStat(p.nm).eat > 0).length;
  const tryingCount = pool.filter((p) => { const s = getStat(p.nm); return s.exposure > 0 && s.eat === 0; }).length;

  const filtered = pool
    .filter((p) => {
      if (search && !p.nm.includes(search.trim())) return false;
      if (filter === 'all') return true;
      if (filter === 'never') return getStat(p.nm).exposure === 0;
      return CAT_FILTER[p.cat] === filter;
    })
    .sort((a, b) => {
      // 안 먹은 것·노출 적은 것 우선 (친해지기 도전 대상)
      const sa = getStat(a.nm), sb = getStat(b.nm);
      return sa.eat - sb.eat || sa.exposure - sb.exposure;
    });

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      <header className="px-5 pt-6 pb-3" style={{ background: 'linear-gradient(160deg,#FFF5EB,#FFE8D0)' }}>
        <h1 className="text-xl font-extrabold" style={{ color: '#1a2b4a' }}>🗂 우리 아이 식재료 도감</h1>
        <p className="text-xs mt-1" style={{ color: '#8a7a6a' }}>초등 입학 전까지 130가지, 골고루 친해지기</p>
      </header>

      {/* 30 → 130 목표 진척 */}
      <div className="px-5 py-3">
        <div className="rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-xs font-bold opacity-90">먹어본 식재료</div>
              <div className="text-3xl font-extrabold leading-none mt-0.5">{eatenCount}<span className="text-base font-bold">가지</span></div>
            </div>
            <div className="text-right text-[11px] font-semibold opacity-95">
              {eatenCount < 30
                ? <>최소 목표 <strong>30가지</strong>까지 <strong>{30 - eatenCount}개</strong> 더</>
                : <>✓ 30가지 달성! 초등 전 <strong>130가지</strong>까지</>}
              {tryingCount > 0 && <div className="mt-0.5">친해지는 중 {tryingCount}가지</div>}
            </div>
          </div>
          {/* 진척 바 (30 / 130 마커) */}
          <div className="relative h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.3)' }}>
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, (eatenCount / 130) * 100)}%` }} />
            <div className="absolute -top-0.5 w-0.5 h-3" style={{ left: `${(30 / 130) * 100}%`, background: 'rgba(255,255,255,0.7)' }} />
          </div>
          <div className="flex justify-between text-[9px] font-bold mt-1 opacity-80">
            <span>0</span><span style={{ marginLeft: `${(30 / 130) * 100 - 6}%` }}>30 (최소)</span><span>130 (초등 전)</span>
          </div>
        </div>
      </div>

      {/* 검색 + 필터 */}
      <div className="px-5 pb-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 식재료 검색"
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none mb-2" style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB' }} />
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap"
              style={{ background: filter === f.k ? '#1a2b4a' : '#FAFAF7', color: filter === f.k ? 'white' : '#6B7280', border: `1px solid ${filter === f.k ? '#1a2b4a' : '#E5E7EB'}` }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 식재료 카드 리스트 */}
      <div className="flex-1 px-5 py-2 space-y-2.5">
        {filtered.map((p) => {
          const s = getStat(p.nm);
          const st = statusOf(s);
          const meta = STATUS_META[st];
          const ePct = Math.min(100, (s.exposure / EXPOSURE_TARGET) * 100);
          return (
            <a key={p.nm} href={`/foods/${encodeURIComponent(p.nm)}`}
              className="block rounded-2xl p-4 shadow-sm relative" style={{ background: 'white', border: `1.5px solid ${meta.border}` }}>
              <div className="absolute top-3 right-3 text-[10px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</div>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-3xl relative">
                  {p.em || '🍽'}
                  {s.eat > 0 && <span className="absolute -bottom-1 -right-1 text-[9px] font-extrabold text-white px-1.5 rounded-full" style={{ background: '#16A085' }}>{s.eat}회</span>}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>{p.nm}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: p.grade === '필수' ? '#FFF5EB' : '#FAFAF7', color: p.grade === '필수' ? '#C45A00' : '#9CA3AF' }}>{gradeMeta(p.grade).stars} {gradeMeta(p.grade).label}</span>
                  </div>
                  <div className="text-[11px]" style={{ color: '#8a7a6a' }}>{p.cat.replace('_', '·')}</div>
                </div>
              </div>
              {/* 노출/먹음 카운터 */}
              <div className="flex justify-between text-[10.5px] font-bold mb-1" style={{ color: '#6B7280' }}>
                <span>먹음 {s.eat}회 · 노출 {s.exposure}회</span>
                <span style={{ color: meta.color }}>{s.exposure === 0 ? '도전해보세요' : `${EXPOSURE_TARGET}회 목표`}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: '#F0F0F0' }}>
                <div className="h-full rounded-full" style={{ width: `${ePct}%`, background: st === 'familiar' ? '#16A085' : st === 'trying' ? '#F9A825' : '#E5E7EB' }} />
              </div>
              {st === 'trying' && s.exposure >= 5 && (
                <div className="mt-2.5 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: '#FFF5EB' }}>
                  <span>🎯</span>
                  <span className="text-[11px] font-bold flex-1" style={{ color: '#C45A00' }}>{s.exposure}번 만났는데 잘 안 먹어요 — 친해지기 레시피 보기</span>
                  <span style={{ color: '#FF6B1A' }}>›</span>
                </div>
              )}
            </a>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-10 text-sm" style={{ color: '#9CA3AF' }}>검색 결과가 없어요</div>}
        {!loggedIn && (
          <a href="/signup" className="block rounded-xl px-4 py-3 text-center text-xs font-bold my-3" style={{ background: '#FFF5EB', color: '#C45A00', border: '1px solid #FFD0A0' }}>
            🔒 로그인하면 우리 아이가 먹은 식재료가 자동 집계돼요 →
          </a>
        )}
      </div>

      <BottomNav active="/foods" />
    </main>
  );
}
