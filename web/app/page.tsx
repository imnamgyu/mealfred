/**
 * / — 밀프레드 앱 홈 (care 대시보드, care.html 리치 디자인 포팅)
 *
 * 데이터 없음(비로그인 or 3일 미만): '예시 지우' 목업 + 🔒 기록 유도
 * 3일+ 기록: 실제 meal_logs로 영양 점수·신호등·식품군·친해지기 계산
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { computeSignals, computeFoodGroups, type NutrientSignal } from '@/lib/nutrition';
import BottomNav from '@/components/BottomNav';

const STORAGE_KEY = 'mealfred_care_logs';
const todayStr = () => new Date().toISOString().slice(0, 10);

const FOOD_FAMILY = [
  { key: '곡물', em: '🌾' }, { key: '콩류', em: '🫘' }, { key: '유제품', em: '🥛' },
  { key: '고기생선', em: '🍗' }, { key: '계란', em: '🥚' }, { key: '비타민A채소', em: '🥕' },
  { key: '기타채소', em: '🥬' }, { key: '과일', em: '🍓' },
];
const FAMILY_LABEL: Record<string, string> = {
  곡물: '곡물', 콩류: '콩', 유제품: '유제품', 고기생선: '고기·생선', 계란: '계란',
  비타민A채소: '진한 채소', 기타채소: '기타 채소', 과일: '과일',
};

// 신호등 → 영양 점수 (green=100, yellow=50)
function scoreFromSignals(sig: NutrientSignal[]): number {
  if (!sig.length) return 0;
  const sum = sig.reduce((a, s) => a + (s.level === 'green' ? 100 : s.level === 'yellow' ? 50 : 0), 0);
  return Math.round(sum / sig.length);
}
function gradeOf(score: number) {
  if (score >= 90) return { g: 'S', label: '매우좋음', color: '#1B5E20' };
  if (score >= 70) return { g: 'A', label: '좋음', color: '#16A085' };
  if (score >= 55) return { g: 'B', label: '보통', color: '#F9A825' };
  if (score >= 40) return { g: 'C', label: '주의', color: '#E67E22' };
  return { g: 'D', label: '경고', color: '#C62828' };
}

export default function Home() {
  const supabase = createSupabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [childName, setChildName] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [days, setDays] = useState(0);
  const [signals, setSignals] = useState<NutrientSignal[]>([]);
  const [groups, setGroups] = useState<{ covered: string[]; missing: string[] }>({ covered: [], missing: [] });
  const [ingredientCount, setIngredientCount] = useState(0);
  const [refused, setRefused] = useState<string[]>([]);
  const [aiLetter, setAiLetter] = useState<string>('');
  const [aiOneliner, setAiOneliner] = useState<string>('');
  const [textureInsight, setTextureInsight] = useState<{ pureePct: number } | null>(null);
  const [repeatInsight, setRepeatInsight] = useState<{ menu: string; count: number } | null>(null);
  const [pool, setPool] = useState<{ nm: string; cat: string; grade: string; em: string }[]>([]);
  const [eatenSet, setEatenSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/ingredients-light.json').then((r) => r.json()).then((d) => setPool(d.ingredients)).catch(() => {});
    (async () => {
      const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10); });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setLoggedIn(true);
        const { data: child } = await supabase.from('children').select('id,nickname,age_band').eq('parent_id', user.id).limit(1).maybeSingle();
        if (child) {
          setChildName(child.nickname);
          const { data: rows } = await supabase.from('meal_logs').select('log_date,ingredients,refused,note,texture,menus').eq('child_id', child.id).gte('log_date', dates[6]);
          const byDate: Record<string, string[]> = {}; const allIng: string[] = []; const ref: string[] = []; const notes: string[] = [];
          const textures: string[] = []; const menuFreq: Record<string, number> = {};
          (rows || []).forEach((r: { log_date: string; ingredients: string[] | null; refused: string | null; note: string | null; texture: string | null; menus: string[] | null }) => {
            if (!byDate[r.log_date]) byDate[r.log_date] = [];
            (r.ingredients || []).forEach((i) => { byDate[r.log_date].push(i); allIng.push(i); });
            if (r.refused) ref.push(r.refused);
            if (r.note) notes.push(r.note);
            if (r.texture) textures.push(r.texture);
            (r.menus || []).forEach((mn) => { const k = mn.replace(/\s/g, ''); menuFreq[k] = (menuFreq[k] || 0) + 1; });
          });
          const byDay = Object.values(byDate).filter((a) => a.length);
          const sig = computeSignals(byDay);
          setDays(byDay.length);
          setSignals(sig);
          setGroups(computeFoodGroups(allIng));
          setIngredientCount(new Set(allIng).size);
          setEatenSet(new Set(allIng));
          setRefused([...new Set(ref)]);

          // 식감 인사이트 — 죽·다진 비중
          if (textures.length >= 3) {
            const soft = textures.filter((t) => t === 'puree' || t === 'mashed').length;
            setTextureInsight({ pureePct: Math.round((soft / textures.length) * 100) });
          }
          // 메뉴 반복 인사이트 — 최다 반복 메뉴
          const top = Object.entries(menuFreq).sort((a, b) => b[1] - a[1])[0];
          if (top && top[1] >= 3) setRepeatInsight({ menu: top[0], count: top[1] });

          // 3일 이상 기록 → 코치 편지 캐싱: 식단 지문(hash) 같으면 read, 바뀌면 1회 재생성
          if (byDay.length >= 3) {
            const today = new Date().toISOString().slice(0, 10);
            const reds = sig.filter((s) => s.level === 'red').map((s) => s.nutrient);
            // 식단 지문 — 먹은 식재료·거부·부족영양·메모가 바뀌면 달라짐
            const srcHash = [...allIng].sort().join(',') + '|' + [...new Set(ref)].sort().join(',') + '|' + reds.sort().join(',') + '|' + notes.length;
            const { data: cached } = await supabase.from('coach_letters')
              .select('letter,oneliner,source_hash').eq('child_id', child.id).eq('letter_date', today).maybeSingle();
            if (cached?.letter && cached.source_hash === srcHash) {
              // 식단 변동 없음 → 캐시 read만
              setAiLetter(cached.letter);
              if (cached.oneliner) setAiOneliner(cached.oneliner);
            } else {
              // 오늘 첫 생성 OR 식단이 바뀜 → 1회 재생성 (과거 편지 맥락 포함)
              const { data: past } = await supabase.from('coach_letters')
                .select('letter_date,letter').eq('child_id', child.id).neq('letter_date', today)
                .order('letter_date', { ascending: false }).limit(5);
              const pastLetters = (past || []).map((p: { letter_date: string; letter: string }) => ({ date: p.letter_date, letter: p.letter }));
              const r = await fetch('https://app.mealfred.com/api/coach', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  childName: child.nickname, ageBand: child.age_band,
                  recentNotes: notes, refused: [...new Set(ref)], reds,
                  eatenCount: new Set(allIng).size, pastLetters,
                }),
              }).then((r) => r.json()).catch(() => null);
              if (r?.letter) {
                setAiLetter(r.letter);
                if (r.oneliner) setAiOneliner(r.oneliner);
                supabase.from('coach_letters').upsert(
                  { child_id: child.id, parent_id: user.id, letter_date: today, letter: r.letter, oneliner: r.oneliner || null, source_hash: srcHash },
                  { onConflict: 'child_id,letter_date' }
                ).then(() => {});
              } else if (cached?.letter) {
                // 재생성 실패 시 기존 캐시라도 표시
                setAiLetter(cached.letter);
                if (cached.oneliner) setAiOneliner(cached.oneliner);
              }
            }
          }
        }
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMockup = !loading && (!loggedIn || days < 3);

  // 표시 데이터 (실데이터 or 목업)
  const greenN = signals.filter((s) => s.level === 'green').length;
  const yellowN = signals.filter((s) => s.level === 'yellow').length;
  const redN = signals.filter((s) => s.level === 'red').length;
  const realScore = scoreFromSignals(signals);

  const D = isMockup
    ? { name: '지우', score: 60, green: 11, yellow: 3, red: 1, ingCount: 18, covered: ['곡물','고기생선','계란','비타민A채소','기타채소'], reds: ['철','비타민D','오메가3'] }
    : { name: childName || '우리 아이', score: realScore, green: greenN, yellow: yellowN, red: redN, ingCount: ingredientCount, covered: groups.covered, reds: signals.filter((s) => s.level === 'red').map((s) => s.nutrient) };

  const grade = gradeOf(D.score);
  const pointerPct = Math.min(98, Math.max(2, D.score));

  // 최근 N일 식단 진단 한줄 — AI 생성 우선, 없으면 방법론 규칙 폴백
  const ruleOneLiner = isMockup
    ? '전체적으로 잘 챙기고 있어요. 식감 단계와 메뉴 반복만 신경 쓰면 다음 주 A 등급도 가능해요.'
    : D.reds.length > 0
      ? `${D.reds.slice(0, 2).join('·')}이 부족해요. 그 식재료가 든 메뉴를 한 끼 더해보세요 — 강요 말고 식탁에 자주 올리기.`
      : D.covered.length >= 7
        ? '식품군을 골고루 챙기고 있어요. 이 페이스를 유지하며 새 식재료 한 가지씩 도전해보세요.'
        : '기본은 잘 갖췄어요. 빠진 식재료 그룹을 한 끼에 하나씩 더해보세요.';
  const oneLiner = aiOneliner || ruleOneLiner;

  // 이번 주 시도해볼 식재료 — 필수(⭐⭐⭐) 안 먹은 것 우선, 그다음 권장
  const GRADE_RANK: Record<string, number> = { '필수': 0, '권장': 1, '향신료': 3 };
  const tryRecommend = pool
    .filter((p) => !eatenSet.has(p.nm))                  // 아직 안 먹은 것
    .sort((a, b) => (GRADE_RANK[a.grade] ?? 2) - (GRADE_RANK[b.grade] ?? 2))  // 필수 먼저
    .slice(0, 6);

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      {/* 헤더 */}
      <header className="flex items-center justify-between px-5 pt-6 pb-3">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-sm.png" alt="밀프레드" width={28} height={28} style={{ borderRadius: 8 }} />
          <h2 className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>밀프레드 편식 관리</h2>
          {!isMockup && days >= 1 && <span className="text-[10px] font-extrabold text-white px-2.5 py-0.5 rounded-full" style={{ background: 'linear-gradient(135deg,#FF6B6B,#FFB375)' }}>🔥 {days}일 연속 기록중</span>}
        </div>
      </header>

      <div className="flex-1 px-5 pb-4">
        {/* 목업 안내 배너 */}
        {isMockup && (
          <div className="rounded-xl px-4 py-3 mb-3 flex items-center gap-3" style={{ background: '#FFF5EB', border: '1.5px solid #FFD0A0' }}>
            <span className="text-xl">👀</span>
            <div className="flex-1">
              <div className="text-xs font-extrabold" style={{ color: '#C45A00' }}>아래는 예시 화면이에요</div>
              <div className="text-[11px] mt-0.5" style={{ color: '#8a7a6a' }}>3일만 기록하면 우리 아이 진짜 점수로 채워져요</div>
            </div>
          </div>
        )}

        {/* 영양 점수 카드 (맨 위) */}
        <div className="rounded-2xl p-5 mb-3 shadow-sm" style={{ background: 'linear-gradient(135deg,#FFF8E1,#FFFDF5)', border: `1.5px solid ${grade.color}` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold" style={{ color: '#6B7280' }}>━ 우리 아이 영양 점수 ━</span>
            <span className="text-xs font-extrabold px-3 py-1 rounded-full text-white" style={{ background: grade.color }}>{grade.g} {grade.label}</span>
          </div>
          <div className="flex items-end justify-between mb-3">
            <div className="flex items-end gap-1">
              <span className="text-5xl font-extrabold leading-none" style={{ color: '#1a2b4a' }}>{D.score}</span>
              <span className="text-lg font-bold mb-1" style={{ color: '#9CA3AF' }}>점</span>
            </div>
            {isMockup ? (
              <div className="text-[11px] text-right font-semibold" style={{ color: '#6B7280' }}>지난주 <strong style={{ color: '#1a2b4a' }}>52점 → 60점</strong> (+8)<br /><span style={{ color: '#16A085' }}>이번 주 +8 상승 중</span></div>
            ) : (
              <div className="text-[11px] text-right font-semibold" style={{ color: '#6B7280' }}>최근 {days}일 기록<br /><span style={{ color: '#16A085' }}>매일 기록할수록 정확해져요</span></div>
            )}
          </div>
          {/* 등급 게이지 */}
          <div className="relative h-2 rounded-full mb-2" style={{ background: 'linear-gradient(90deg,#C62828,#E67E22 25%,#F9A825 50%,#16A085 75%,#1B5E20)' }}>
            <div className="absolute -top-1 w-1.5 h-4 rounded-sm" style={{ left: `${pointerPct}%`, background: '#1a2b4a', border: '2px solid white' }} />
          </div>
          <div className="grid grid-cols-5 text-[9px] font-extrabold text-center mb-3">
            <span style={{ color: '#C62828' }}>D 경고</span><span style={{ color: '#E67E22' }}>C 주의</span>
            <span style={{ color: '#F9A825' }}>B 보통</span><span style={{ color: '#16A085' }}>A 좋음</span><span style={{ color: '#1B5E20' }}>S 매우</span>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.05)' }}>
            <div className="flex justify-between text-[11px] font-bold mb-1.5"><span style={{ color: '#6B7280' }}>이번 주 먹은 식재료</span><strong style={{ color: '#1a2b4a' }}>{D.ingCount} / 30종</strong></div>
            <div className="h-1.5 rounded-full" style={{ background: '#F0F0F0' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (D.ingCount / 30) * 100)}%`, background: 'linear-gradient(90deg,#F9A825,#16A085)' }} /></div>
            {D.ingCount < 30 && (
              <div className="text-[11px] text-center mt-2 font-semibold" style={{ color: '#6B7280' }}>다음 등급까지 <strong style={{ color: '#C45A00' }}>{Math.max(1, 30 - D.ingCount)}종 더</strong>!</div>
            )}
          </div>
        </div>

        {/* 36종 신호등 (영양 점수 바로 아래) */}
        <a href="/care/report" className="block rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0', background: 'white' }}>
          <div className="flex items-center justify-between mb-2">
            <strong className="text-sm" style={{ color: '#1a2b4a' }}>🚦 36종 필수 영양소 신호등</strong>
          </div>
          <div className="text-[10.5px] mb-3" style={{ color: '#6B7280' }}>기준: <strong style={{ color: '#1a2b4a' }}>보건복지부 KDRI 2025</strong></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl py-3 text-center" style={{ background: '#E8F5E9', border: '1.5px solid #16A085' }}><div className="text-2xl font-extrabold" style={{ color: '#1B5E20' }}>{D.green}</div><div className="text-[11px] font-extrabold" style={{ color: '#1B5E20' }}>잘 챙김</div></div>
            <div className="rounded-xl py-3 text-center" style={{ background: '#FFF4D6', border: '1.5px solid #F9A825' }}><div className="text-2xl font-extrabold" style={{ color: '#F57F17' }}>{D.yellow}</div><div className="text-[11px] font-extrabold" style={{ color: '#F57F17' }}>조금 부족</div></div>
            <div className="rounded-xl py-3 text-center" style={{ background: '#FFEBEE', border: '1.5px solid #E53935' }}><div className="text-2xl font-extrabold" style={{ color: '#C62828' }}>{D.red}</div><div className="text-[11px] font-extrabold" style={{ color: '#C62828' }}>결핍 위험</div></div>
          </div>
          {D.reds.length > 0 && (
            <div className="mt-3 rounded-lg px-3 py-2 text-[11.5px] font-bold" style={{ background: '#FFEBEE', color: '#C62828' }}>
              ⚠ <strong>{D.reds.slice(0, 3).join('·')}</strong>이 가장 부족 — 성장 핵심 영양소예요
            </div>
          )}
          <div className="mt-3 rounded-xl py-3 text-center text-sm font-extrabold text-white" style={{ background: '#1a2b4a' }}>📋 36종 자세히 + 보충 식재료 →</div>
        </a>

        {/* 최근 3일 식단 진단 — LLM 한줄 */}
        <div className="rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0', background: 'white' }}>
          <div className="flex items-center justify-between mb-2">
            <strong className="text-sm" style={{ color: '#1a2b4a' }}>📊 최근 {isMockup ? 3 : days}일 식단 진단</strong>
            <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full text-white" style={{ background: grade.color }}>{grade.g}</span>
          </div>
          <p className="text-[12.5px] leading-relaxed" style={{ color: '#5a4a3a' }}>{oneLiner}</p>
          <div className="text-[10px] mt-2" style={{ color: '#9CA3AF' }}>학계 기준(WHO·KDRI·SOS·HabEat)으로 자동 분석</div>
        </div>

        {/* 편지 답장 (안심) — AI 실제 / 목업 */}
        {(isMockup || aiLetter) && (
          <div className="rounded-2xl p-4 mb-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#FFF8E1,#FFECB3)', border: '1.5px solid #F9A825' }}>
            <div className="text-[10.5px] font-extrabold mb-1.5" style={{ color: '#F57F17' }}>✉️ 코치 편지가 도착했어요</div>
            {aiLetter ? (
              <div className="text-[13px] font-semibold leading-relaxed" style={{ color: '#1a2b4a' }}>{aiLetter}</div>
            ) : (
              <>
                <div className="text-sm font-extrabold leading-snug mb-1.5" style={{ color: '#1a2b4a' }}>&ldquo;시금치 거부로 속상하셨겠어요.<br />22번 노출 중 8번 — 정상 단계예요&rdquo;</div>
                <div className="text-[11.5px] italic" style={{ color: '#5a4a3a' }}>매일 기록하면 코치가 어제 메모에 답장을 드려요</div>
              </>
            )}
          </div>
        )}


        {/* 식재료 그룹 8 */}
        <div className="rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0', background: 'white' }}>
          <div className="flex justify-between items-center mb-3">
            <strong className="text-sm" style={{ color: '#1a2b4a' }}>먹은 식재료 그룹</strong>
            <span className="text-xs font-bold" style={{ color: '#C45A00' }}>{D.covered.length} / 8</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {FOOD_FAMILY.map((f) => {
              const done = D.covered.includes(f.key);
              return (
                <div key={f.key} className="rounded-xl py-2.5 text-center" style={{ background: done ? '#E8F5E9' : '#FAFAFA', border: `1.5px solid ${done ? '#16A085' : '#EEEEEE'}`, opacity: done ? 1 : 0.45 }}>
                  <div className="text-xl leading-none mb-1" style={{ filter: done ? 'none' : 'grayscale(1)' }}>{f.em}</div>
                  <div className="text-[10px] font-extrabold" style={{ color: done ? '#1B5E20' : '#BDBDBD' }}>{FAMILY_LABEL[f.key]}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 식감 인사이트 — 실데이터(죽 비중 40%+) or 목업 */}
        {((!isMockup && textureInsight && textureInsight.pureePct >= 40) || isMockup) && (
          <div className="rounded-2xl p-4 mb-3 shadow-sm" style={{ background: 'white', borderLeft: '4px solid #F9A825' }}>
            <div className="text-[10.5px] font-extrabold mb-1" style={{ color: '#F57F17' }}>⚠ 식감 단계 — 핑거푸드 시점</div>
            <div className="text-sm font-extrabold mb-1.5" style={{ color: '#1a2b4a' }}>이번 주 죽·다진 비중 <strong style={{ color: '#F57F17' }}>{isMockup ? 65 : textureInsight?.pureePct}%</strong>예요</div>
            <div className="text-[11.5px] leading-relaxed" style={{ color: '#5a4a3a' }}>씹는 근육이 자라는 시기라 단계를 살짝 도전해볼 때예요. 한 끼는 핑거푸드부터 — <strong>당근 스틱</strong> 추천</div>
          </div>
        )}

        {/* 메뉴 반복 인사이트 — 실데이터(3회+ 반복) or 목업 */}
        {((!isMockup && repeatInsight) || isMockup) && (
          <div className="rounded-2xl p-4 mb-3 shadow-sm" style={{ background: 'white', borderLeft: '4px solid #5B8DEF' }}>
            <div className="text-[10.5px] font-extrabold mb-1" style={{ color: '#1565C0' }}>🔁 메뉴 반복 — {isMockup ? '닭죽 5회' : `${repeatInsight?.menu} ${repeatInsight?.count}회`}</div>
            <div className="text-sm font-extrabold mb-1.5" style={{ color: '#1a2b4a' }}>한 주 동안 비슷한 메뉴가 자주 나왔어요</div>
            <div className="text-[11.5px] leading-relaxed" style={{ color: '#5a4a3a' }}>같은 식재료 반복은 맛 학습 좁아짐으로 이어져요 (HabEat). 베이스는 비슷해도 <strong>채소 조합만 바꿔도</strong> 새 노출이 됩니다</div>
          </div>
        )}

        {/* 이번 주 시도해볼 식재료 (종합 추천 — 맨 하단) */}
        <div className="rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFD0A0', background: 'linear-gradient(135deg,#FFFBF5,white)' }}>
          <div className="flex justify-between items-baseline mb-1">
            <strong className="text-sm" style={{ color: '#1a2b4a' }}>🍱 이번 주 시도해볼 식재료</strong>
            <span className="text-[10px] font-bold" style={{ color: '#9CA3AF' }}>{isMockup ? '예시' : '종합 추천'}</span>
          </div>
          <p className="text-[11px] mb-3" style={{ color: '#8a7a6a' }}>아직 안 먹어본 <strong>필수(⭐⭐⭐) 식재료</strong>부터 도전해보세요</p>
          {(isMockup
            ? [
                { em: '🥬', nm: '시금치', grade: '필수' }, { em: '🥦', nm: '브로콜리', grade: '권장' },
                { em: '🍆', nm: '가지', grade: '권장' }, { em: '🐟', nm: '고등어', grade: '필수' },
              ]
            : tryRecommend.map((p) => ({ em: p.em || '🍽', nm: p.nm, grade: p.grade }))
          ).map((it, i) => {
            const stars = it.grade === '필수' ? '⭐⭐⭐' : it.grade === '권장' ? '⭐⭐' : '⭐';
            return (
              <a key={i} href={`/foods/${encodeURIComponent(it.nm)}`} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? '1px solid #F4F4F5' : 'none' }}>
                <span className="text-2xl">{it.em}</span>
                <div className="flex-1">
                  <div className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>{it.nm}</div>
                  <div className="text-[11px]" style={{ color: '#8a7a6a' }}>{stars} {it.grade || '일반'} · 아직 안 먹어봤어요</div>
                </div>
                <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg" style={{ background: '#FFF5EB', color: '#C45A00', border: '1px solid #FFD0A0' }}>도전하기 →</span>
              </a>
            );
          })}
          {!isMockup && tryRecommend.length === 0 && <div className="text-center py-4 text-xs" style={{ color: '#9CA3AF' }}>필수·권장 식재료를 모두 먹어봤어요! 🎉</div>}
        </div>

        {/* 목업 모드 — 하단 CTA */}
        {isMockup && (
          <a href={loggedIn ? '/care' : '/signup'} className="block rounded-2xl p-5 text-center text-white shadow-md" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>
            <div className="text-base font-extrabold mb-1">{loggedIn ? '🍽 지금 첫 끼 기록하기' : '🌱 카카오로 1초 시작하기'}</div>
            <div className="text-xs opacity-90">3일만 기록하면 이 화면이 우리 아이 진짜 데이터로 채워져요</div>
          </a>
        )}
      </div>

      <BottomNav active="/" />
    </main>
  );
}
