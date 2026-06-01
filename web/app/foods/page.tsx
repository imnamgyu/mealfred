/**
 * /foods — 식재료 도감 (care.html 리스팅 UI 포팅)
 *
 * "급식 잘 먹기 — 식재료 친해지기 훈련"
 * 3 통계 셀 + 식재료별 기간/노출 이중 진척바. 실데이터(meal_logs) 집계.
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { NUTRI_MAP, CATEGORY_GROUP } from '@/lib/nutrition';
import { kstDateNDaysAgo } from '@/lib/date';
import BottomNav from '@/components/BottomNav';
import { loadCareLogs } from '@/lib/careCache';   // 비로그인 fallback은 guest 네임스페이스(계정 격리)

type Ing = { nm: string; cat: string; grade: string; em: string; must_eat?: boolean; must_eat_tier?: 'core' | 'good'; must_eat_nutrient?: string };
// exposure/eat/first/last = 전체 누적. recentFreq/recentRefused = '잘 먹는' 판정용(최근 90일 윈도우).
type Stat = { exposure: number; eat: number; first: string | null; last: string | null; recentFreq: number; recentRefused: boolean };

// 필터 = 홈 '식품군 다양성' 8개와 동일(CATEGORY_GROUP). 세부 카테고리(박과·뿌리 등) X.
const FILTERS = [
  { k: 'all', label: '전체' }, { k: 'eaten', label: '✅ 먹어본 것' }, { k: 'noteaten', label: '🆕 안 먹어본 것' },
  { k: 'mustEat', label: '💎 영양 보석' }, { k: 'frequent', label: '⭐⭐⭐ 급식 단골' }, { k: 'danger', label: '🚨 오래 안 먹음' },
  { k: '곡물', label: '🌾 곡물' }, { k: '콩류', label: '🫘 콩' }, { k: '유제품', label: '🥛 유제품' },
  { k: '고기생선', label: '🍗 고기·생선' }, { k: '계란', label: '🥚 계란' },
  { k: '비타민A채소', label: '🥕 녹황색채소' }, { k: '기타채소', label: '🥬 일반채소' }, { k: '과일', label: '🍓 과일' },
];
const GRADE_META: Record<string, { stars: string; full: string; cls: string }> = {
  '자주': { stars: '⭐⭐⭐', full: '⭐⭐⭐ 급식 단골', cls: 'A' },
  '가끔': { stars: '⭐⭐', full: '⭐⭐ 가끔', cls: 'B' },
  '드물게': { stars: '⭐', full: '⭐ 드물게', cls: 'C' },
  '향신료': { stars: '🔸', full: '🔸 향신료', cls: 'D' },
};
function gradeMeta(g: string) { return GRADE_META[g] || { stars: '⭐', full: '⭐ 드물게', cls: 'C' }; }
const GRADE_SORT: Record<string, number> = { '자주': 0, '가끔': 1, '드물게': 2, '향신료': 9 };
const GRADE_COLOR: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#E8F5E9', fg: '#1B5E20' }, B: { bg: '#E3F2FD', fg: '#1565C0' },
  C: { bg: '#F3E5F5', fg: '#6A1B9A' }, D: { bg: '#FAFAF7', fg: '#9CA3AF' },
};
const EXPOSURE_TARGET = 30;
// 홈(app/page.tsx)의 '잘 먹는' 단일 기준과 정합: 최근 90일 내 노출 2회+ & 거부 기록 없음.
const REPERTOIRE_WINDOW_DAYS = 90;
const REPERTOIRE_MIN_FREQ = 2;
// '잘 먹고 있는' = 레퍼토리 멤버(최근 90일·2회+·비거부).
function isWellEaten(s: Stat): boolean { return s.recentFreq >= REPERTOIRE_MIN_FREQ && !s.recentRefused; }

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

// 상태: danger(관심 필요)·warn(주의)·good(잘 먹고 있어요). 홈의 '잘 먹는' 기준과 정합.
function statusOf(s: Stat): 'danger' | 'warn' | 'good' {
  if (s.exposure === 0) return 'danger';       // 아직 못 만남
  if (isWellEaten(s)) return 'good';           // 최근 90일·2회+·비거부 = 레퍼토리(잘 먹고 있어요)
  if (s.eat === 0) return 'danger';            // 노출했는데 한 번도 안 먹음
  if (s.recentRefused) return 'danger';        // 최근 거부 기록
  const m = monthsSince(s.last);
  if (m !== null && m >= 3) return 'danger';   // 3개월(=90일)+ 안 먹음 → 레퍼토리 이탈
  return 'warn';                               // 친해지는 중(최근 1회만 등 아직 미달)
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
  const [filter, setFilter] = useState('eaten');   // 기본 '먹어본 것' (우리 아이가 먹은 것부터 보이게)
  const [search, setSearch] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    fetch('/ingredients-light.json').then((r) => r.json()).then((d) => setPool(d.ingredients)).catch(() => {});
    (async () => {
      const repCut = kstDateNDaysAgo(REPERTOIRE_WINDOW_DAYS);   // 최근 90일 경계 — '잘 먹는' 판정 윈도우
      const counts: Record<string, Stat> = {};
      const add = (nm: string, ate: boolean | null, date: string, refusedName?: string | null) => {
        if (!counts[nm]) counts[nm] = { exposure: 0, eat: 0, first: null, last: null, recentFreq: 0, recentRefused: false };
        const c = counts[nm];
        c.exposure++;
        if (ate !== false) { c.eat++; if (!c.last || date > c.last) c.last = date; if (!c.first || date < c.first) c.first = date; }
        if (date >= repCut) {                  // 홈 기준과 동일: 노출 빈도(ate 무관) 2회+ & 거부 없음
          c.recentFreq++;
          if (refusedName && refusedName === nm) c.recentRefused = true;
        }
      };
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setLoggedIn(true);
        const { data: child } = await supabase.from('children').select('id').eq('parent_id', user.id).limit(1).maybeSingle();
        if (child) {
          const { data: rows } = await supabase.from('meal_logs').select('ingredients,ate_well,refused,log_date').eq('child_id', child.id).lte('log_date', kstDateNDaysAgo(0));   // 미래(미리입력 식단표) 제외 — 홈 레퍼토리와 정합
          (rows || []).forEach((r: { ingredients: string[] | null; ate_well: boolean | null; refused: string | null; log_date: string }) => {
            (r.ingredients || []).forEach((nm) => add(nm, r.ate_well, r.log_date, r.refused));
          });
        }
      } else {
        try {
          const logs = loadCareLogs<Record<string, Record<string, { ingredients?: { name: string }[]; ateWell?: boolean | null; refused?: string | null }>>>(null);
          Object.entries(logs).forEach(([date, day]) => {
            Object.values(day as Record<string, { ingredients?: { name: string }[]; ateWell?: boolean | null; refused?: string | null }>).forEach((e) => {
              (e.ingredients || []).forEach((t) => add(t.name, e.ateWell ?? null, date, e.refused ?? null));
            });
          });
        } catch {}
      }
      setStats(counts);
      // 첫 가입 등 먹어본 음식이 없으면 '먹어본 것' 필터는 빈 화면 → 기본을 '전체'로
      if (Object.values(counts).filter((c) => c.eat > 0).length === 0) setFilter('all');
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getStat = (nm: string): Stat => stats[nm] || { exposure: 0, eat: 0, first: null, last: null, recentFreq: 0, recentRefused: false };
  const nutriLabel = (nm: string) => (NUTRI_MAP[nm] || []).slice(0, 2).join('·');

  const thisMonth = new Date().toISOString().slice(0, 7);
  // '잘 먹고 있는' = 레퍼토리(최근 90일·2회+·비거부) — 홈과 동일 기준. 게이지·통계 단일 소스.
  const goodCount = pool.filter((p) => isWellEaten(getStat(p.nm))).length;
  // '오래 안 먹은' = 노출했으나 레퍼토리 이탈(못 먹음·최근 거부·3개월+ 미식)
  const dangerCount = pool.filter((p) => { const s = getStat(p.nm); return s.exposure > 0 && statusOf(s) === 'danger'; }).length;
  const newCount = pool.filter((p) => getStat(p.nm).first?.startsWith(thisMonth)).length;

  const filtered = pool.filter((p) => {
    if (search && !p.nm.includes(search.trim())) return false;
    if (filter === 'all') return true;
    if (filter === 'eaten') return getStat(p.nm).eat > 0;
    if (filter === 'noteaten') return getStat(p.nm).eat === 0;
    if (filter === 'mustEat') return !!p.must_eat;
    if (filter === 'frequent') return p.grade === '자주';
    if (filter === 'danger') return getStat(p.nm).exposure > 0 && statusOf(getStat(p.nm)) === 'danger';
    return CATEGORY_GROUP[p.cat] === filter;
  }).sort((a, b) => {
    // 1) 등급 우선 (필수 → 권장 → 일반), 2) 관심필요 우선, 3) 오래된 순
    const ga = GRADE_SORT[a.grade] ?? 2, gb = GRADE_SORT[b.grade] ?? 2;
    if (ga !== gb) return ga - gb;
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
            <span>잘 먹고 있는 {goodCount}가지</span>
            <span>{goodCount < 30 ? `30가지까지 ${30 - goodCount}개 더` : `초등 전 130가지까지`}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,107,26,0.2)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (goodCount / 130) * 100)}%`, background: '#FF6B1A' }} />
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
                    {p.must_eat && <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">💎 {p.must_eat_nutrient}</span>}
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
