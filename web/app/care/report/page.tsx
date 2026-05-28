/**
 * /care/report — 영양 신호등 + 진단 (M6)
 *
 * 최근 7일 식사 기록 → KDRI 핵심 영양소 신호등 + 식품군 다양성 + 부족 영양소 추천.
 * 로그인 시 Supabase meal_logs, 비로그인 시 localStorage.
 * 한계: 식재료 존재 기반 (정량 g 아님) — 참고용.
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { computeSignals, computeFoodGroups, NUTRIENT_FOODS, type NutrientSignal } from '@/lib/nutrition';
import BottomNav from '@/components/BottomNav';

const STORAGE_KEY = 'mealfred_care_logs';
const LEVEL_COLOR = { green: '#16A085', yellow: '#F9A825', red: '#E53935' };
const LEVEL_BG = { green: '#E8F5E9', yellow: '#FFF8E1', red: '#FFEBEE' };
const LEVEL_LABEL = { green: '충분', yellow: '가끔', red: '부족' };

type DayIngredients = string[][];

export default function ReportPage() {
  const supabase = createSupabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [daysWithData, setDaysWithData] = useState(0);
  const [signals, setSignals] = useState<NutrientSignal[]>([]);
  const [foodGroups, setFoodGroups] = useState<{ covered: string[]; missing: string[] }>({ covered: [], missing: [] });
  const [refusedFoods, setRefusedFoods] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      // 최근 7일 날짜
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return d.toISOString().slice(0, 10);
      });

      const byDay: DayIngredients = [];
      const allIng: string[] = [];
      const refused: string[] = [];
      let daysCount = 0;

      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: child } = await supabase.from('children').select('id').eq('parent_id', user.id).limit(1).maybeSingle();
        if (child) {
          const { data: rows } = await supabase.from('meal_logs')
            .select('log_date,ingredients,refused')
            .eq('child_id', child.id).gte('log_date', dates[6]);
          const byDate: Record<string, string[]> = {};
          (rows || []).forEach((r: { log_date: string; ingredients: string[] | null; refused: string | null }) => {
            if (!byDate[r.log_date]) byDate[r.log_date] = [];
            (r.ingredients || []).forEach((i) => { byDate[r.log_date].push(i); allIng.push(i); });
            if (r.refused) refused.push(r.refused);
          });
          Object.values(byDate).forEach((arr) => { if (arr.length) { byDay.push(arr); daysCount++; } });
        }
      } else {
        // localStorage
        try {
          const logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
          for (const d of dates) {
            const dayLog = logs[d];
            if (!dayLog) continue;
            const dayIng: string[] = [];
            Object.values(dayLog).forEach((entry) => {
              const e = entry as { ingredients?: { name: string }[]; refused?: string };
              (e.ingredients || []).forEach((t) => { dayIng.push(t.name); allIng.push(t.name); });
              if (e.refused) refused.push(e.refused);
            });
            if (dayIng.length) { byDay.push(dayIng); daysCount++; }
          }
        } catch {}
      }

      setDaysWithData(daysCount);
      setSignals(computeSignals(byDay));
      setFoodGroups(computeFoodGroups(allIng));
      setRefusedFoods([...new Set(refused)]);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reds = signals.filter((s) => s.level === 'red');
  const greens = signals.filter((s) => s.level === 'green');

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      <header className="px-5 pt-6 pb-3 border-b" style={{ borderColor: '#FFE8D0' }}>
        <h1 className="text-xl font-extrabold" style={{ color: '#1a2b4a' }}>영양 진단</h1>
        <p className="text-xs mt-1" style={{ color: '#8a7a6a' }}>최근 7일 식사 기록 기준 · 참고용</p>
      </header>

      <div className="flex-1 px-5 py-4">
        {loading ? (
          <p className="text-sm text-center py-10" style={{ color: '#9CA3AF' }}>분석 중...</p>
        ) : daysWithData < 3 ? (
          <div className="text-center py-10">
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-lg font-extrabold mb-2" style={{ color: '#1a2b4a' }}>아직 데이터가 적어요</h2>
            <p className="text-sm leading-relaxed mb-1" style={{ color: '#8a7a6a' }}>
              현재 <strong style={{ color: '#FF6B1A' }}>{daysWithData}일</strong> 기록됨 · 3일 이상이면 신호등이 나와요
            </p>
            <a href="/care" className="inline-block mt-5 px-5 py-3 rounded-xl font-bold text-white text-sm" style={{ background: '#FF6B1A' }}>
              식사 기록하러 가기 →
            </a>
          </div>
        ) : (
          <>
            {/* 요약 */}
            <div className="rounded-2xl p-4 mb-3 text-white" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>
              <div className="text-xs font-bold opacity-90 mb-1">최근 {daysWithData}일 영양 신호등</div>
              <div className="flex gap-4 mt-2">
                <div><span className="text-2xl font-extrabold">{greens.length}</span><span className="text-xs ml-1">충분</span></div>
                <div><span className="text-2xl font-extrabold">{signals.filter(s=>s.level==='yellow').length}</span><span className="text-xs ml-1">가끔</span></div>
                <div><span className="text-2xl font-extrabold">{reds.length}</span><span className="text-xs ml-1">부족</span></div>
              </div>
            </div>

            {/* 신호등 그리드 */}
            <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
              <h3 className="text-sm font-extrabold mb-3" style={{ color: '#1a2b4a' }}>영양소 신호등</h3>
              <div className="grid grid-cols-2 gap-2">
                {signals.map((s) => (
                  <div key={s.nutrient} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: LEVEL_BG[s.level] }}>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: LEVEL_COLOR[s.level] }} />
                    <span className="text-xs font-bold flex-1" style={{ color: '#1a2b4a' }}>{s.nutrient}</span>
                    <span className="text-[10px] font-bold" style={{ color: LEVEL_COLOR[s.level] }}>{LEVEL_LABEL[s.level]}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] mt-3" style={{ color: '#9CA3AF' }}>
                ※ 식재료 종류 기준 추정 (실제 섭취량 미반영) · 참고용
              </p>
            </div>

            {/* 부족 영양소 → 추천 */}
            {reds.length > 0 && (
              <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFCDD2' }}>
                <h3 className="text-sm font-extrabold mb-2" style={{ color: '#C62828' }}>이 영양소를 채워보세요</h3>
                <div className="space-y-2">
                  {reds.slice(0, 5).map((s) => (
                    <div key={s.nutrient} className="text-xs" style={{ color: '#374151' }}>
                      <strong style={{ color: '#C62828' }}>{s.nutrient}</strong> → {(NUTRIENT_FOODS[s.nutrient] || []).slice(0, 4).join(' · ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 식품군 다양성 */}
            <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
              <h3 className="text-sm font-extrabold mb-2" style={{ color: '#1a2b4a' }}>
                식품군 다양성 <span className="text-xs font-semibold" style={{ color: '#C45A00' }}>{foodGroups.covered.length}/8</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {foodGroups.covered.map((g) => (
                  <span key={g} className="text-[11px] px-2.5 py-1 rounded-full font-bold text-white" style={{ background: '#16A085' }}>{g} ✓</span>
                ))}
                {foodGroups.missing.map((g) => (
                  <span key={g} className="text-[11px] px-2.5 py-1 rounded-full font-bold" style={{ background: '#FAFAF7', color: '#9CA3AF', border: '1px solid #E5E7EB' }}>{g}</span>
                ))}
              </div>
            </div>

            {/* 거부 식재료 */}
            {refusedFoods.length > 0 && (
              <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
                <h3 className="text-sm font-extrabold mb-1" style={{ color: '#1a2b4a' }}>최근 거부한 음식</h3>
                <p className="text-[11px] mb-2" style={{ color: '#8a7a6a' }}>천천히 친해지는 코스를 추천해드릴 식재료예요</p>
                <div className="flex flex-wrap gap-1.5">
                  {refusedFoods.map((f, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full" style={{ background: '#FFF5F5', color: '#C62828', border: '1px solid #FFCDD2' }}>{f}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav active="/care/report" />
    </main>
  );
}
