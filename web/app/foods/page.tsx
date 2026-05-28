/**
 * /foods — 식재료 도감 (care.html 리스팅 UI 포팅)
 *
 * "급식 잘 먹기 — 식재료 친해지기 훈련"
 * 3 통계 셀 + 식재료별 기간/노출 이중 진척바. 실데이터(meal_logs) 집계.
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { NUTRI_MAP } from '@/lib/nutrition';
import BottomNav from '@/components/BottomNav';

const STORAGE_KEY = 'mealfred_care_logs';

type Ing = { nm: string; cat: string; grade: string; em: string };
type Stat = { exposure: number; eat: number; first: string | null; last: string | null };

const CAT_FILTER: Record<string, string> = {
  '잎채소': 'leaf', '뿌리채소': 'root', '열매채소': 'fruitveg', '십자화과': 'fruitveg',
  '콩_콩제품': 'bean', '콩제품': 'bean', '생선': 'fish', '갑각_조개': 'fish', '해조류': 'fish',
  '버섯': 'mushroom', '과일': 'fruit', '유제품': 'dairy', '곡물_탄수': 'grain', '곡류': 'grain',
  '고기': 'meat', '계란': 'meat', '견과_씨앗': 'nut', '기타채소': 'etc', '향신_허브': 'etc',
  '발효식품': 'etc', '가공식품': 'etc',
};
const FILTERS = [
  { k: 'all', label: '전체' }, { k: 'danger', label: '🚨 오래 안 먹음' },
  { k: 'leaf', label: '🥬 잎채소' }, { k: 'fruitveg', label: '🎃 박과' }, { k: 'root', label: '🥕 뿌리' },
  { k: 'bean', label: '🫘 콩' }, { k: 'fish', label: '🐟 생선·해산물' }, { k: 'mushroom', label: '🍄 버섯' },
  { k: 'fruit', label: '🍓 과일' }, { k: 'dairy', label: '🥛 유제품' }, { k: 'grain', label: '🌾 곡물' }, { k: 'meat', label: '🍗 고기·계란' },
];
const GRADE_META: Record<string, { label: string; full: string; cls: string }> = {
  '필수': { label: 'A', full: 'A 필수', cls: 'A' },
  '권장': { label: 'B', full: 'B 권장', cls: 'B' },
  '향신료': { label: 'C', full: 'C 향신료', cls: 'C' },
};
function gradeMeta(g: string) { return GRADE_META[g] || { label: 'D', full: 'D 일반', cls: 'D' }; }
const GRADE_COLOR: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#E8F5E9', fg: '#1B5E20' }, B: { bg: '#E3F2FD', fg: '#1565C0' },
  C: { bg: '#F3E5F5', fg: '#6A1B9A' }, D: { bg: '#FAFAF7', fg: '#9CA3AF' },
};
const EXPOSURE_TARGET = 30;

function monthsSince(s: string | null): number | null {
  if (!s) return null;
  const d = new Date(s), now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}
function periodLabel(m: number | null): string {
  if (m === null) return '아직 못 만남';
  if (m <= 0) return '최근에 먹었어요';
  if (m < 12) return `${m}개월째 안 친해진`;
  const y = Math.floor(m / 12), x = m % 12;
  return x === 0 ? `${y}년째 안 친해진` : `${y}년 ${x}개월째 안 친해진`;
}
function periodBarPct(m: number | null): number { if (m === null) return 6; if (m >= 24) return 100; return Math.min(100, 12 + m * 4); }

// 상태: danger(관심 필요)·warn(주의)·good(잘 진행)
function statusOf(s: Stat): 'danger' | 'warn' | 'good' {
  const m = monthsSince(s.last);
  if (s.exposure === 0) return 'danger';      // 아직 못 만남
  if (s.eat === 0) return 'danger';            // 노출했는데 안 먹음
  if (m !== null && m >= 2) return 'danger';   // 2개월+ 안 먹음
  if (m !== null && m >= 1) return 'warn';
  return 'good';
}
const STATUS = {
  danger: { label: '관심 필요', color: '#C62828', border: '#FFCDD2', bg: '#FFF5F5', bar: '#E53935' },
  warn: { label: '주의', color: '#F57F17', border: '#FFE082', bg: '#FFFBF0', bar: '#F9A825' },
  good: { label: '잘 진행 중', color: '#1B5E20', border: '#C8E6C9', bg: 'white', bar: '#16A085' },
};

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
      const add = (nm: string, ate: boolean | null, date: string) => {
        if (!counts[nm]) counts[nm] = { exposure: 0, eat: 0, first: null, last: null };
        const c = counts[nm];
        c.exposure++;
        if (ate !== false) { c.eat++; if (!c.last || date > c.last) c.last = date; if (!c.first || date < c.first) c.first = date; }
      };
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setLoggedIn(true);
        const { data: child } = await supabase.from('children').select('id').eq('parent_id', user.id).limit(1).maybeSingle();
        if (child) {
          const { data: rows } = await supabase.from('meal_logs').select('ingredients,ate_well,log_date').eq('child_id', child.id);
          (rows || []).forEach((r: { ingredients: string[] | null; ate_well: boolean | null; log_date: string }) => {
            (r.ingredients || []).forEach((nm) => add(nm, r.ate_well, r.log_date));
          });
        }
      } else {
        try {
          const logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
          Object.entries(logs).forEach(([date, day]) => {
            Object.values(day as Record<string, { ingredients?: { name: string }[]; ateWell?: boolean | null }>).forEach((e) => {
              (e.ingredients || []).forEach((t) => add(t.name, e.ateWell ?? null, date));
            });
          });
        } catch {}
      }
      setStats(counts);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getStat = (nm: string): Stat => stats[nm] || { exposure: 0, eat: 0, first: null, last: null };
  const nutriLabel = (nm: string) => (NUTRI_MAP[nm] || []).slice(0, 2).join('·');

  const thisMonth = new Date().toISOString().slice(0, 7);
  const goodCount = pool.filter((p) => getStat(p.nm).eat > 0 && statusOf(getStat(p.nm)) === 'good').length;
  const dangerCount = pool.filter((p) => { const s = getStat(p.nm); return s.exposure > 0 && statusOf(s) === 'danger'; }).length;
  const newCount = pool.filter((p) => getStat(p.nm).first?.startsWith(thisMonth)).length;
  const eatenCount = pool.filter((p) => getStat(p.nm).eat > 0).length;

  const filtered = pool.filter((p) => {
    if (search && !p.nm.includes(search.trim())) return false;
    if (filter === 'all') return true;
    if (filter === 'danger') return getStat(p.nm).exposure > 0 && statusOf(getStat(p.nm)) === 'danger';
    return CAT_FILTER[p.cat] === filter;
  }).sort((a, b) => {
    const sa = getStat(a.nm), sb = getStat(b.nm);
    const rank = { danger: 0, warn: 1, good: 2 };
    const ra = sa.exposure ? rank[statusOf(sa)] : 0.5, rb = sb.exposure ? rank[statusOf(sb)] : 0.5;
    if (ra !== rb) return ra - rb;
    return (monthsSince(sb.last) ?? 99) - (monthsSince(sa.last) ?? 99);
  });

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      <header className="flex items-center justify-between px-5 pt-6 pb-3">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-sm.png" alt="" width={26} height={26} style={{ borderRadius: 7 }} />
          <h1 className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>도감</h1>
        </div>
      </header>

      {/* 3 통계 셀 */}
      <div className="px-5 pb-2">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>급식 잘 먹기 — 친해지기 훈련</h2>
          <span className="text-[11px] font-bold" style={{ color: '#9CA3AF' }}>{new Date().getFullYear()}년 {new Date().getMonth() + 1}월</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl py-3 text-center" style={{ background: '#FAFAF7', border: '1px solid #E5E7EB' }}>
            <div className="text-2xl font-extrabold" style={{ color: '#16A085' }}>{goodCount}<span className="text-[11px] font-bold" style={{ color: '#9CA3AF' }}>종</span></div>
            <div className="text-[11px] font-bold mt-0.5" style={{ color: '#6B7280' }}>잘 먹고 있어요</div>
          </div>
          <div className="rounded-xl py-3 text-center" style={{ background: '#FAFAF7', border: '1px solid #E5E7EB' }}>
            <div className="text-2xl font-extrabold" style={{ color: '#E53935' }}>{dangerCount}<span className="text-[11px] font-bold" style={{ color: '#9CA3AF' }}>종</span></div>
            <div className="text-[11px] font-bold mt-0.5" style={{ color: '#6B7280' }}>오래 안 먹은</div>
          </div>
          <div className="rounded-xl py-3 text-center" style={{ background: '#FAFAF7', border: '1px solid #E5E7EB' }}>
            <div className="text-2xl font-extrabold" style={{ color: '#C45A00' }}>+{newCount}</div>
            <div className="text-[11px] font-bold mt-0.5" style={{ color: '#6B7280' }}>이번 달 새 만남</div>
          </div>
        </div>
        {/* 30→130 진척 */}
        <div className="mt-2 rounded-xl px-3 py-2" style={{ background: '#FFF5EB', border: '1px solid #FFD0A0' }}>
          <div className="flex justify-between text-[11px] font-bold mb-1" style={{ color: '#C45A00' }}>
            <span>먹어본 {eatenCount}가지</span>
            <span>{eatenCount < 30 ? `30가지까지 ${30 - eatenCount}개 더` : `초등 전 130가지까지`}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,107,26,0.2)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (eatenCount / 130) * 100)}%`, background: '#FF6B1A' }} />
          </div>
        </div>
      </div>

      {/* 검색 + 필터 */}
      <div className="px-5 pb-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 식재료 검색"
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none mb-2" style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB' }} />
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k)} className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap"
              style={{ background: filter === f.k ? '#1a2b4a' : '#FAFAF7', color: filter === f.k ? 'white' : '#6B7280', border: `1px solid ${filter === f.k ? '#1a2b4a' : '#E5E7EB'}` }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* 식재료 카드 */}
      <div className="flex-1 px-5 py-2 space-y-3">
        {filtered.map((p) => {
          const s = getStat(p.nm);
          const st = statusOf(s);
          const meta = STATUS[st];
          const g = gradeMeta(p.grade);
          const gc = GRADE_COLOR[g.cls];
          const m = monthsSince(s.last);
          const ePct = Math.min(100, (s.exposure / EXPOSURE_TARGET) * 100);
          const nutri = nutriLabel(p.nm);
          return (
            <a key={p.nm} href={`/foods/${encodeURIComponent(p.nm)}`} className="block rounded-2xl p-4 shadow-sm relative" style={{ background: meta.bg, border: `1.5px solid ${meta.border}` }}>
              {/* 상태 배지 */}
              <div className="absolute top-3.5 right-4 flex items-center gap-1 text-[11px] font-extrabold" style={{ color: meta.color }}>
                <span className="w-2 h-2 rounded-full" style={{ background: meta.bar }} />{meta.label}
              </div>
              {/* 헤드 */}
              <div className="flex items-center gap-3 mb-2.5">
                <div className="relative w-12 h-12 rounded-xl flex items-center justify-center text-3xl" style={{ background: '#F3E5F5' }}>
                  {p.em || '🍽'}
                  {s.eat > 0 && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-extrabold text-white px-1.5 py-0.5 rounded-full" style={{ background: '#1a2b4a' }}>{s.eat}회</span>}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>{p.nm}</span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded" style={{ background: gc.bg, color: gc.fg }}>{g.full}</span>
                  </div>
                  <div className="text-[12px]" style={{ color: '#6B7280' }}>{nutri || p.cat.replace('_', '·')}</div>
                </div>
              </div>
              {/* 기간 + 마지막 */}
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[13px] font-extrabold" style={{ color: st === 'good' ? '#16A085' : meta.color }}>{periodLabel(m)}</span>
                <span className="text-[11px]" style={{ color: '#9CA3AF' }}>{s.last ? `마지막 ${s.last.slice(0, 7)}` : ''}</span>
              </div>
              <div className="h-1.5 rounded-full mb-3" style={{ background: '#F0F0F0' }}>
                <div className="h-full rounded-full" style={{ width: `${periodBarPct(m)}%`, background: meta.bar }} />
              </div>
              {/* 먹은횟수 / 노출 */}
              <div className="flex justify-between items-baseline text-[11px] font-bold mb-1" style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', paddingTop: '8px' }}>
                <span style={{ color: '#6B7280' }}>먹은 횟수 / 노출 <span style={{ color: '#9CA3AF' }}>(권고 30회)</span></span>
                <span style={{ color: '#1a2b4a' }}>{s.eat} 먹음 · {s.exposure}회 노출</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: '#F0F0F0' }}>
                <div className="h-full rounded-full" style={{ width: `${ePct}%`, background: '#FF8A47' }} />
              </div>
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
