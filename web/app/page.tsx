/**
 * / — 밀프레드 앱 홈 (care 대시보드, care.html 리치 디자인 포팅)
 *
 * 데이터 없음(비로그인 or 3일 미만): '예시 지우' 목업 + 🔒 기록 유도
 * 3일+ 기록: 실제 meal_logs로 영양 점수·신호등·식품군·친해지기 계산
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { computeSignals, computeFoodGroups, computeTimeseries, computeKdriSignals, computeGroupSignals, computeGroupWeekly, computeDiversityScore, CATEGORY_GROUP, NUTRIENT_FOODS, KDRI_NUTRIENTS, KDRI_EXCLUDED, KDRI_AGE_LABEL, kdriAgeBandOf, type AgeBandKey, type NutrientSignal, type KdriSignal, type GroupSignal, type GroupWeekly } from '@/lib/nutrition';
import { bmiOf, bmiPercentile, bmiBand, bmiPhrase, type Sex } from '@/lib/growth-reference';
import { computeProgress, bmiTrend, type ProgressResult } from '@/lib/progress';
import { composeWeeklyBox, BOX_REASON_META } from '@/lib/box';
import { inSeason } from '@/lib/season';
import { isSpicyIngredient } from '@/lib/spicy';
import { kstToday, kstDateNDaysAgo } from '@/lib/date';
import BottomNav from '@/components/BottomNav';
import FoodIcon from '@/components/FoodIcon';

const todayStr = kstToday;   // KST 기준 — 새벽 크론(letter_date)과 동일 앵커

// 빈도(pct) → 친근한 라벨 (care.html freqLabel 동일)
function freqLabel(pct: number): string {
  if (pct >= 90) return '거의 매일';
  if (pct >= 75) return '주 4-5회';
  if (pct >= 60) return '주 3회';
  if (pct >= 50) return '주 2회';
  if (pct >= 40) return '주 1-2회';
  if (pct >= 30) return '주 1회';
  if (pct >= 15) return '드물게';
  return '거의 못 만남';
}

const FOOD_FAMILY = [
  { key: '곡물', em: '🌾' }, { key: '콩류', em: '🫘' }, { key: '유제품', em: '🥛' },
  { key: '고기생선', em: '🍗' }, { key: '계란', em: '🥚' }, { key: '비타민A채소', em: '🥕' },
  { key: '기타채소', em: '🥬' }, { key: '과일', em: '🍓' },
];
const FAMILY_LABEL: Record<string, string> = {
  곡물: '곡물', 콩류: '콩', 유제품: '유제품', 고기생선: '고기·생선', 계란: '계란',
  비타민A채소: '녹황색채소', 기타채소: '일반채소', 과일: '과일',
};
// 식품군 8개 주간 추이 선차트 — 라인 색(서로 잘 구분되게)
const GROUP_COLOR: Record<string, string> = {
  곡물: '#F9A825', 콩류: '#8D6E63', 유제품: '#42A5F5', 고기생선: '#EF5350',
  계란: '#AB47BC', 비타민A채소: '#66BB6A', 기타채소: '#26A69A', 과일: '#EC407A',
};
// SVG 선차트 — x=최근 N주, y=주당 그 식품군을 먹은 일수(0~7). 식재료는 종이 많아 8식품군으로 묶음.
function GroupTrendSVG({ data }: { data: GroupWeekly }) {
  const W = 440, H = 220, padL = 26, padR = 56, padT = 14, padB = 26;   // padR 넓힘 — 끝점 라벨 공간
  const n = data.weeks.length;
  const maxY = Math.max(5, ...data.series.flatMap((s) => s.counts), 1);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1));
  const y = (v: number) => padT + plotH * (1 - v / maxY);
  const yticks = [0, 1, 3, 5, 7].filter((t) => t <= maxY);
  const xIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])].filter((v) => v >= 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {yticks.map((t) => (
        <g key={t}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#EEE" strokeDasharray="3 3" />
          <text x={padL - 4} y={y(t) + 3} fontSize={9} fill="#9CA3AF" textAnchor="end">{t}</text>
        </g>
      ))}
      {xIdx.map((i) => (
        <text key={i} x={x(i)} y={H - 8} fontSize={9} fill="#9CA3AF" textAnchor="middle">{data.unit === 'day' ? (i === n - 1 ? '오늘' : `${n - 1 - i}일전`) : (i === n - 1 ? '이번주' : `${n - 1 - i}주전`)}</text>
      ))}
      {data.series.map((s) => (
        <polyline key={s.group} points={s.counts.map((c, i) => `${x(i)},${y(c)}`).join(' ')}
          fill="none" stroke={GROUP_COLOR[s.group] || '#9CA3AF'} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      ))}
      {data.series.map((s) => (s.counts.length ? <circle key={s.group} cx={x(n - 1)} cy={y(s.counts[n - 1])} r={3} fill={GROUP_COLOR[s.group] || '#9CA3AF'} /> : null))}
      {/* 끝점 라벨 — 색만으로 구분 안 되는 색맹 배려(이모지 + 식품군명) */}
      {data.series.map((s) => {
        if (!s.counts.length) return null;
        const em = FOOD_FAMILY.find((f) => f.key === s.group)?.em || '';
        return <text key={`lbl-${s.group}`} x={x(n - 1) + 6} y={y(s.counts[n - 1]) + 3} fontSize={8} fontWeight={800} fill={GROUP_COLOR[s.group] || '#9CA3AF'}>{em}{FAMILY_LABEL[s.group] || s.group}</text>;
      })}
    </svg>
  );
}

// 신호등 → 영양 점수 (green=100, yellow=50)
function gradeOf(score: number) {
  if (score >= 90) return { g: 'S', label: '매우좋음', color: '#1B5E20' };
  if (score >= 70) return { g: 'A', label: '좋음', color: '#16A085' };
  if (score >= 55) return { g: 'B', label: '보통', color: '#F9A825' };
  if (score >= 40) return { g: 'C', label: '주의', color: '#E67E22' };
  return { g: 'D', label: '경고', color: '#C62828' };
}
// 편지 날짜 → 사람이 읽는 라벨 (오늘/어제/M월 D일)
function fmtLetterDate(d: string): string {
  if (!d) return '';
  if (d === kstToday()) return '오늘';
  if (d === kstDateNDaysAgo(1)) return '어제';
  const p = d.split('-');
  return p.length === 3 ? `${Number(p[1])}월 ${Number(p[2])}일` : d;
}

export default function Home() {
  const supabase = createSupabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [childName, setChildName] = useState('');
  const [childId, setChildId] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);   // 집에 늘 있어 엄마가 추천에서 뺀 재료(children.excluded_ingredients)
  const [children, setChildren] = useState<{ id: string; nickname: string; age_band: string; birth_year: number | null; birth_month: number | null; chronic_conditions: string | null }[]>([]);   // 다자녀 switcher
  const [selectedId, setSelectedId] = useState<string | null>(null);   // 선택된 자녀(localStorage 'mf_child' 유지)
  const [loggedIn, setLoggedIn] = useState(false);
  const [days, setDays] = useState(0);
  const [signals, setSignals] = useState<NutrientSignal[]>([]);
  const [scoreParts, setScoreParts] = useState<{ home: number | null; daycare: number | null; final: number }>({ home: null, daycare: null, final: 0 });   // 집70:기관30 가중 점수
  const [scoreReason, setScoreReason] = useState<{ redGroups: string[]; processedSample: string[]; repeatMenu: string | null; processed: number; repeat: number } | null>(null);   // 점수 하락 근거(왜 떨어졌나)
  const [kdri, setKdri] = useState<KdriSignal[]>([]);   // 36종 KDRI 신호등 (실데이터)
  const [kdriBand, setKdriBand] = useState<AgeBandKey>('1-2');   // 아이 연령대 — KDRI 기준값·라벨 선택(만 1-2/3-5/6-8세)
  const [showNutri, setShowNutri] = useState(false);    // 36종 자세히 모달
  const [showAllReds, setShowAllReds] = useState(false);   // 빨강(결핍) 총량 캡 — 많으면 상위 N개만, 나머지는 접기
  const [growth, setGrowth] = useState<{ height_cm: number | null; weight_kg: number | null; measured_on: string } | null>(null);
  const [growthList, setGrowthList] = useState<{ height_cm: number | null; weight_kg: number | null; measured_on: string }[]>([]);   // BMI 급변 감지용 최근 측정
  const [progress, setProgress] = useState<ProgressResult | null>(null);   // 편식 변화(최근28 vs 직전28)
  const [childMeta, setChildMeta] = useState<{ sex: Sex | null; birthY: number | null; birthM: number | null }>({ sex: null, birthY: null, birthM: null });
  const [groups, setGroups] = useState<{ covered: string[]; missing: string[] }>({ covered: [], missing: [] });
  const [groupSig, setGroupSig] = useState<{ signals: GroupSignal[]; proteinOk: boolean }>({ signals: [], proteinOk: false });
  const [groupWeekly, setGroupWeekly] = useState<GroupWeekly | null>(null);   // 식품군 8개 주간 추이(선차트)
  const [showTrend, setShowTrend] = useState(false);
  const [staleMap, setStaleMap] = useState<Record<string, number>>({});   // 식재료별 마지막 노출 후 일수(박스 우선순위)
  const [ingredientCount, setIngredientCount] = useState(0);
  const [cumCount, setCumCount] = useState(0);   // 누적(전체) 먹어본 식재료 종 수 → 130종 목표
  const [missDays, setMissDays] = useState<{ d: string; label: string }[]>([]);   // P9: 최근 5일 중 미기록 날(당일 제외)
  const [refused, setRefused] = useState<string[]>([]);
  const [aiLetter, setAiLetter] = useState<string>('');
  const [aiOneliner, setAiOneliner] = useState<string>('');
  const [signupDate, setSignupDate] = useState<string | null>(null);   // M8 90일 챌린지 시작(가입일)
  const [loggedDays, setLoggedDays] = useState(0);                      // 최근 90일 기록한 고유 날 수
  const [pointBal, setPointBal] = useState(0);                          // 누적 포인트 잔액
  const [letterDate, setLetterDate] = useState<string>('');   // 현재 표시 편지 날짜
  const [pastLetters, setPastLetters] = useState<{ date: string; letter: string; oneliner: string | null }[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [textureInsight, setTextureInsight] = useState<{ pureePct: number } | null>(null);
  const [repeatInsight, setRepeatInsight] = useState<{ menu: string; count: number; rice?: boolean } | null>(null);
  const [pool, setPool] = useState<{ nm: string; cat: string; grade: string; em: string; must_eat?: boolean; must_eat_tier?: 'core' | 'good'; must_eat_nutrient?: string }[]>([]);
  const [eatenSet, setEatenSet] = useState<Set<string>>(new Set());
  const [kitGuide, setKitGuide] = useState<Record<string, { d: string; em: string; s: number }[]>>({});   // 키트 식재료→넣기 좋은 음식(public/kit-guide.json)

  // ① 자녀 목록 로드 + 선택 자녀 결정(localStorage 유지·기본 첫째). 선택이 정해지면 ②가 그 아이 데이터를 로드.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setLoggedIn(true);
      const { data: kids } = await supabase.from('children')
        .select('id,nickname,age_band,birth_year,birth_month,chronic_conditions')
        .eq('parent_id', user.id).order('id', { ascending: true });
      const list = (kids || []) as typeof children;
      setChildren(list);
      if (!list.length) { setLoading(false); return; }   // 아이 없음 → 목업/등록 유도
      let saved: string | null = null; try { saved = localStorage.getItem('mf_child'); } catch {}
      setSelectedId(list.find((k) => k.id === saved)?.id || list[0].id);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ② 선택된 자녀의 전체 데이터 로드 (switcher로 selectedId 바뀌면 재실행)
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;   // 자녀 빠른 전환 시 옛 selectedId의 늦은 콜백이 새 자녀 상태를 덮어쓰지 않게(race 가드)
    setLoading(true);
    fetch('/ingredients-light.json').then((r) => r.json()).then((d) => { if (!cancelled) setPool(d.ingredients); }).catch(() => {});
    fetch('/kit-guide.json').then((r) => r.json()).then((d) => { if (!cancelled) setKitGuide(d); }).catch(() => {});
    (async () => {
      // 풀 cat 로드 → 빗대기 영양평가용 catOf (NUTRI_MAP에 없는 식재료는 범주로 근사)
      const catMap = await fetch('/ingredients-light.json').then((r) => r.json())
        .then((d) => { const m: Record<string, string> = {}; (d.ingredients || []).forEach((x: { nm: string; cat: string }) => { m[x.nm] = x.cat; }); return m; })
        .catch(() => ({} as Record<string, string>));
      const catOf = (ing: string) => catMap[ing];
      const dates = Array.from({ length: 7 }, (_, i) => kstDateNDaysAgo(i));   // KST 기준 최근 7일
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setLoggedIn(true);
        setSignupDate(user.created_at || null);   // 90일 챌린지 시작일
        supabase.from('point_balance').select('balance').eq('parent_id', user.id).maybeSingle().then(({ data: pb }) => setPointBal(pb?.balance ?? 0));
        const { data: child } = await supabase.from('children').select('id,nickname,age_band,birth_year,birth_month,chronic_conditions').eq('id', selectedId).maybeSingle();
        if (cancelled) return;   // 그 사이 자녀가 바뀌었으면 이하 setState 전부 스킵
        if (child) {
          setChildName(child.nickname);
          setChildId(child.id);
          setChildMeta({ sex: null, birthY: child.birth_year ?? null, birthM: child.birth_month ?? null });
          // 제외 재료 — 컬럼이 아직 없을 수 있어 분리 쿼리(실패해도 메인 로드 무영향)
          supabase.from('children').select('excluded_ingredients').eq('id', child.id).maybeSingle()
            .then(({ data }) => { if (!cancelled && Array.isArray(data?.excluded_ingredients)) setExcluded(data!.excluded_ingredients as string[]); });
          // 성별·체위 — 마이그레이션 전이면 컬럼/테이블이 없을 수 있어 분리 쿼리(실패해도 메인 로드 무영향)
          supabase.from('children').select('sex').eq('id', child.id).maybeSingle()
            .then(({ data }) => { if (!cancelled && data?.sex) setChildMeta((m) => ({ ...m, sex: data.sex as Sex })); });
          supabase.from('growth_logs').select('height_cm,weight_kg,measured_on')
            .eq('child_id', child.id).order('measured_on', { ascending: false }).limit(6)
            .then(({ data }) => { if (!cancelled && data && data.length) { setGrowth(data[0]); setGrowthList(data); } });
          const { data: rows } = await supabase.from('meal_logs').select('log_date,ingredients,refused,note,texture,menus,place,ate_well').eq('child_id', child.id).gte('log_date', dates[6]).lte('log_date', dates[0]);   // 미래 날짜(미리 입력한 식단표)는 평가 제외 — '오늘까지' 먹은 것만
          if (cancelled) return;
          const byDate: Record<string, string[]> = {}; const allIng: string[] = []; const favIng: string[] = []; const ref: string[] = []; const notes: string[] = [];
          const homeRef: string[] = []; const daycareRef: string[] = [];   // 거부를 장소별로 분리 (코칭엔진 스펙 §3)
          const textures: string[] = []; const menuFreq: Record<string, number> = {};
          const homeByDate: Record<string, string[]> = {}; const dcByDate: Record<string, string[]> = {};   // 점수 가중(집70:기관30)용 분리
          const homeMenusByMeal: string[][] = []; const dcMenusByMeal: string[][] = [];   // 가공/반복 패널티용 — 끼니별 menus 원문(장소별)
          (rows || []).forEach((r: { log_date: string; ingredients: string[] | null; refused: string | null; note: string | null; texture: string | null; menus: string[] | null; place: string | null; ate_well: boolean | null }) => {
            if (!byDate[r.log_date]) byDate[r.log_date] = [];
            const dest = r.place === 'daycare' ? dcByDate : homeByDate;   // home 또는 미상 = 집(부모 통제)
            if (!dest[r.log_date]) dest[r.log_date] = [];
            (r.ingredients || []).forEach((i) => { byDate[r.log_date].push(i); allIng.push(i); dest[r.log_date].push(i); if (r.ate_well !== false) favIng.push(i); });   // favIng=거부 아닌 끼니 식재료(코치 브릿지 앵커)
            if (r.refused) { ref.push(r.refused); if (r.place === 'home') homeRef.push(r.refused); else if (r.place === 'daycare') daycareRef.push(r.refused); }
            if (r.note) notes.push(r.note);
            if (r.texture) textures.push(r.texture);
            if (r.place !== 'daycare') (r.menus || []).forEach((mn) => { const k = mn.replace(/\s/g, ''); menuFreq[k] = (menuFreq[k] || 0) + 1; });   // 반복 경고는 집(home·미상)만 — 기관 급식 반복은 부모가 못 바꿈
            if ((r.menus || []).length) (r.place === 'daycare' ? dcMenusByMeal : homeMenusByMeal).push(r.menus || []);
          });
          const byDay = Object.values(byDate).filter((a) => a.length);
          const sig = computeSignals(byDay, catOf);
          // 영양 점수 개편 — '결핍 없음(신호등)'이 아니라 '다양성 + 집 끼니 질'. 집70:기관30 가중, 가공식품·반복은 집에만(기관 급식은 부모 통제 밖).
          const homeByDay = Object.values(homeByDate).filter((a) => a.length);
          const dcByDay = Object.values(dcByDate).filter((a) => a.length);
          const homeDiv = homeByDay.length ? computeDiversityScore({ ingredientsByDay: homeByDay, menusByMeal: homeMenusByMeal, catOf, applyMealPenalty: true }) : null;
          const dcDiv = dcByDay.length ? computeDiversityScore({ ingredientsByDay: dcByDay, menusByMeal: dcMenusByMeal, catOf, applyMealPenalty: false, daycareMode: true }) : null;
          const homeScore = homeDiv?.score ?? null;
          const dcScore = dcDiv?.score ?? null;
          const finalScore = (homeScore != null && dcScore != null)
            ? Math.round(homeScore * 0.7 + dcScore * 0.3)
            : (homeScore ?? dcScore ?? computeDiversityScore({ ingredientsByDay: byDay, menusByMeal: [...homeMenusByMeal, ...dcMenusByMeal], catOf, applyMealPenalty: true }).score);
          setScoreParts({ home: homeScore, daycare: dcScore, final: finalScore });
          // 점수 하락 근거(왜 떨어졌나) — 집 기준 redGroups·가공식품명. 부모 이탈 방지용 노출.
          setScoreReason(homeDiv ? { redGroups: homeDiv.redGroups, processedSample: homeDiv.processedSample, repeatMenu: homeDiv.repeatMenu, processed: homeDiv.processed, repeat: homeDiv.repeat } : null);
          const fg = computeFoodGroups(allIng, catOf);
          setDays(byDay.length);
          // P9: 최근 5일(어제~5일 전, 당일 제외) 중 기록 없는 날 — 결정론적(환각 차단)
          setMissDays(
            Array.from({ length: 5 }, (_, i) => i + 1).map((n) => {
              const d = kstDateNDaysAgo(n);
              return { d, label: n === 1 ? '어제' : n === 2 ? '그저께' : `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` };
            }).filter((x) => !byDate[x.d])
          );
          setSignals(sig);
          const kdriBandSel = kdriAgeBandOf(child.age_band);   // 아이 연령대 → KDRI 기준(만 1-2/3-5/6-8세)
          setKdriBand(kdriBandSel);
          setKdri(computeKdriSignals(byDay, catOf, kdriBandSel));   // 36종 KDRI 신호등 (실데이터·연령대 기준)
          setGroupSig(computeGroupSignals(byDay, catOf));   // 식품군 다양성 신호등 (충분/조금부족/부족)
          setGroups(fg);
          setIngredientCount(new Set(allIng).size);
          setEatenSet(new Set(allIng));
          // '잘 먹는(현재 받아들인)' 식재료 종 수 — 130종(초등 입학 전 ~만6세 누적 목표).
          // 1회 맛봄 X. '최근 3개월 내 2회 이상 + 거부 기록 없음' = 현재 레퍼토리(반복노출→수용, HabEat/NESR).
          // 90일 윈도우: 토들러 음식 로테이션·neophobia 재노출 주기 기준(식품빈도설문 1개월~WHO 24h 절충). 튜닝 가능.
          const REPERTOIRE_WINDOW_DAYS = 90;
          const repCut = kstDateNDaysAgo(REPERTOIRE_WINDOW_DAYS);
          supabase.from('meal_logs').select('ingredients,refused,log_date').eq('child_id', child.id).gte('log_date', repCut).lte('log_date', dates[0]).then(({ data }) => {
            const freq: Record<string, number> = {}; const refusedSet = new Set<string>();
            (data || []).forEach((r: { ingredients: string[] | null; refused: string | null }) => {
              (r.ingredients || []).forEach((i) => { freq[i] = (freq[i] || 0) + 1; });
              if (r.refused) refusedSet.add(r.refused);
            });
            const accepted = Object.keys(freq).filter((i) => freq[i] >= 2 && !refusedSet.has(i));
            setCumCount(accepted.length);
            // 같은 90일 데이터로 식품군 8개 주간 추이(선차트) 계산
            setGroupWeekly(computeGroupWeekly((data || []) as { log_date: string; ingredients: string[] | null }[], catOf, 10));
            // 식재료별 마지막 노출 후 일수 — 박스에서 '필수인데 오래 안 먹은 것' 우선용
            const lastSeen: Record<string, string> = {};
            (data || []).forEach((r: { ingredients: string[] | null; log_date: string }) => { (r.ingredients || []).forEach((i) => { if (!lastSeen[i] || r.log_date > lastSeen[i]) lastSeen[i] = r.log_date; }); });
            const todayMs = Date.parse(kstToday());
            const sm: Record<string, number> = {};
            Object.entries(lastSeen).forEach(([nm, d]) => { sm[nm] = Math.round((todayMs - Date.parse(d)) / 86400000); });
            setStaleMap(sm);
            setLoggedDays(new Set((data || []).map((r: { log_date: string }) => r.log_date)).size);   // 90일 챌린지 기록 일수
          });
          // 편식 변화(효과측정) — 최근 56일 기록으로 최근28 vs 직전28 비교
          supabase.from('meal_logs').select('log_date,ingredients,refused,ate_well,duration_min')
            .eq('child_id', child.id).gte('log_date', kstDateNDaysAgo(55)).lte('log_date', dates[0])
            .then(({ data }) => { setProgress(computeProgress((data || []) as Parameters<typeof computeProgress>[0], kstToday())); });
          // 지난 코치 편지(날짜 포함) — 오랜만에 온 엄마가 예전 편지도 보게. 오늘 편지 없으면 가장 최근 편지를 상단에.
          supabase.from('coach_letters').select('letter_date,letter,oneliner')
            .eq('child_id', child.id).order('letter_date', { ascending: false }).limit(8)
            .then(({ data }) => {
              const hist = (data || []) as { letter_date: string; letter: string; oneliner: string | null }[];
              if (!hist.length) return;
              const td = todayStr();
              setPastLetters(hist.filter((h) => h.letter_date !== td).map((h) => ({ date: h.letter_date, letter: h.letter, oneliner: h.oneliner })));
              setAiLetter((cur) => cur || hist[0].letter);
              setAiOneliner((cur) => cur || (hist[0].oneliner || ''));
              setLetterDate((cur) => cur || hist[0].letter_date);
            });
          setRefused([...new Set(ref)]);

          // 식감 인사이트 — 죽·다진 비중
          if (textures.length >= 3) {
            const soft = textures.filter((t) => t === 'puree' || t === 'mashed').length;
            setTextureInsight({ pureePct: Math.round((soft / textures.length) * 100) });
          }
          // 메뉴 반복 인사이트 — 최다 반복 메뉴.
          // 물·국·김 등은 경고 의미 없어 제외, 흰쌀밥은 '편식'이 아니라 주식이라 너그럽게(잡곡·콩 업그레이드 제안)
          const SKIP_REPEAT = new Set(['물', '국', '김', '우유', '생수', '보리차', '숭늉', '김치', '배추김치', '깍두기', '총각김치', '백김치', '열무김치', '나박김치', '물김치', '갓김치', '파김치', '오이소박이']);   // 밥·김치는 한국 주식 — 반복 너그럽게
          const WHITE_RICE = new Set(['밥', '쌀밥', '흰밥', '흰쌀밥', '백미밥', '진밥', '쌀', '맨밥']);
          const top = Object.entries(menuFreq).filter(([k]) => !SKIP_REPEAT.has(k)).sort((a, b) => b[1] - a[1])[0];
          if (top && top[1] >= 3) setRepeatInsight({ menu: top[0], count: top[1], rice: WHITE_RICE.has(top[0]) });

          // 3일 이상 기록 → 코치 편지 캐싱: 식단 지문(hash) 같으면 read, 바뀌면 1회 재생성
          if (byDay.length >= 3) {
            const today = todayStr();   // KST — 크론과 동일 앵커
            const reds = sig.filter((s) => s.level === 'red').map((s) => s.nutrient);
            const ts = computeTimeseries(byDate, menuFreq, catOf, today, { assertNoVeg: Object.keys(catMap).length > 0 });
            const { data: dcRow } = await supabase.from('children').select('daycare').eq('id', child.id).maybeSingle();  // 컬럼 없으면 null→false
            const attendsDaycare = !!dcRow?.daycare;
            // 식단 지문 — 먹은 식재료·거부·부족영양·메모가 바뀌면 달라짐
            const srcHash = [...allIng].sort().join(',') + '|' + [...new Set(ref)].sort().join(',') + '|' + reds.sort().join(',') + '|' + notes.length;
            const { data: cached } = await supabase.from('coach_letters')
              .select('letter,oneliner,source_hash').eq('child_id', child.id).eq('letter_date', today).maybeSingle();
            if (cancelled) return;   // 그 사이 자녀 전환 → 편지(가장 눈에 띄는 교차오염) 스킵
            if (cached?.letter) {
              // 오늘 편지가 이미 발행됨 → 무조건 read (발행되면 그날 고정, 당일 입력으로 안 바뀜)
              setAiLetter(cached.letter);
              if (cached.oneliner) setAiOneliner(cached.oneliner);
              setLetterDate(today);
            } else {
              // 오늘 편지가 아직 없음 → 1회 생성 (과거 편지 맥락 포함). 이후엔 위 분기로 고정
              const { data: past } = await supabase.from('coach_letters')
                .select('letter_date,letter').eq('child_id', child.id).neq('letter_date', today)
                .order('letter_date', { ascending: false }).limit(5);
              const pastLetters = (past || []).map((p: { letter_date: string; letter: string }) => ({ date: p.letter_date, letter: p.letter }));
              const r = await fetch('https://app.mealfred.com/api/coach', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  childName: child.nickname, ageBand: child.age_band,
                  recentNotes: notes, refused: [...new Set(ref)], reds,
                  homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)],
                  covered: fg.covered, missing: fg.missing, timeseries: ts, attendsDaycare,
                  eatenCount: new Set(allIng).size, pastLetters, chronicConditions: child.chronic_conditions,
                  favoriteIngredients: [...new Set(favIng)],   // 거부 아닌(잘 먹는) 식재료만 — 그래프 사촌/궁합 앵커(거부 식재료가 앵커되지 않게)
                }),
              }).then((r) => r.json()).catch(() => null);
              if (r?.letter) {
                setAiLetter(r.letter);
                if (r.oneliner) setAiOneliner(r.oneliner);
                setLetterDate(today);
                supabase.from('coach_letters').upsert(
                  { child_id: child.id, parent_id: user.id, letter_date: today, letter: r.letter, oneliner: r.oneliner || null, source_hash: srcHash },
                  { onConflict: 'child_id,letter_date' }
                ).then(() => {});
              } else if (cached?.letter) {
                // 재생성 실패 시 기존 캐시라도 표시
                setAiLetter(cached.letter);
                if (cached.oneliner) setAiOneliner(cached.oneliner);
                setLetterDate(today);
              }
            }
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };   // 다음 selectedId 효과 전에 이전 로드 취소
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const isMockup = !loading && (!loggedIn || days < 3);

  // 표시 데이터 (실데이터 or 목업)
  const greenN = signals.filter((s) => s.level === 'green').length;
  const yellowN = signals.filter((s) => s.level === 'yellow').length;
  const redN = signals.filter((s) => s.level === 'red').length;
  const realScore = scoreParts.final;   // 개편 ②: 다양성+집끼니질 점수(신호등 회귀 안 함)

  const D = isMockup
    ? { name: '지우', score: 60, green: 11, yellow: 3, red: 1, ingCount: 18, covered: ['곡물','고기생선','계란','비타민A채소','기타채소'], reds: ['철','비타민D','오메가3'] }
    : { name: childName || '우리 아이', score: realScore, green: greenN, yellow: yellowN, red: redN, ingCount: ingredientCount, covered: groups.covered, reds: signals.filter((s) => s.level === 'red').map((s) => s.nutrient) };

  const grade = gradeOf(D.score);
  const pointerPct = Math.min(98, Math.max(2, D.score));
  const cumDisp = isMockup ? 18 : cumCount;   // 누적 먹어본 식재료(130종 목표)

  // 36종 KDRI 신호등 표시 데이터 — 목업=care.html 예시(전 36종) / 실데이터=매핑된 것만 개인화·나머지 reference
  const kdriView: KdriSignal[] = isMockup
    ? KDRI_NUTRIENTS.map((k) => ({ nm: k.nm, val: k.val, group: k.group, status: k.sample, pct: k.samplePct }))
    : kdri;
  const kG = kdriView.filter((n) => n.status === 'green').length;
  const kY = kdriView.filter((n) => n.status === 'yellow').length;
  const kR = kdriView.filter((n) => n.status === 'red').length;
  const kRef = kdriView.filter((n) => n.status === 'reference').length;
  const kReds = kdriView.filter((n) => n.status === 'red').map((n) => n.nm);

  // 탄·단·지 + BMI 종합 (36종 모달 상단) — 실데이터: 최신 체위 + 성별 + 월령
  const macroOf = (nm: string) => kdriView.find((n) => n.nm === nm)?.status ?? 'reference';
  const ageMonths = childMeta.birthY && childMeta.birthM
    ? (new Date().getFullYear() - childMeta.birthY) * 12 + (new Date().getMonth() + 1 - childMeta.birthM)
    : null;
  const bmiVal = growth?.height_cm && growth?.weight_kg ? bmiOf(growth.height_cm, growth.weight_kg) : null;
  const bmiPct = bmiVal != null && childMeta.sex && ageMonths != null ? bmiPercentile(bmiVal, childMeta.sex, ageMonths) : null;
  // BMI 급변 감지 — 측정 시점별 월령으로 퍼센타일 계산 후 최근 2회 비교
  const bmiTrendData = (!isMockup && childMeta.sex && childMeta.birthY && childMeta.birthM && growthList.length >= 2)
    ? bmiTrend(growthList.map((g) => {
        const b = g.height_cm && g.weight_kg ? bmiOf(g.height_cm, g.weight_kg) : null;
        const am = (Number(g.measured_on.slice(0, 4)) - childMeta.birthY!) * 12 + (Number(g.measured_on.slice(5, 7)) - childMeta.birthM!);
        return { measured_on: g.measured_on, pct: b != null ? bmiPercentile(b, childMeta.sex as Sex, am) : null };
      }))
    : null;
  type MStat = 'green' | 'yellow' | 'red' | 'reference';
  // 실제 체위(키·몸무게)가 있으면 식사 기록이 적어도/성별이 없어도 항상 실제 BMI를 보여준다. 퍼센타일은 성별·월령 있을 때 추가.
  const bmiCard: null | { ageLabel: string; hw: string; bmi: number; band: string; pct: number | null; carb: MStat; protein: MStat; fat: MStat; tip: string } = bmiVal != null
    ? {
        ageLabel: ageMonths != null ? `만 ${ageMonths}개월` : '',
        hw: `${growth!.height_cm}cm / ${growth!.weight_kg}kg`,
        bmi: Math.round(bmiVal * 10) / 10,
        band: bmiPct != null ? bmiBand(bmiPct) : '',
        pct: bmiPct != null ? Math.round(bmiPct) : null,
        carb: macroOf('탄수화물'), protein: macroOf('단백질'), fat: 'reference',
        tip: bmiPct != null
          ? `BMI ${bmiBand(bmiPct)} 범위예요. ${bmiPhrase(bmiPct)}(또래 100명 중 ${Math.round(bmiPct)}번째)라 지금처럼 골고루면 충분해요. 탄수화물·단백질은 식단 빈도로 평가했어요.`
          : !childMeta.sex
            ? '성별을 입력하면 또래 비교가 나와요 — 식사 기록 화면 체위 카드에서 남아/여아 선택.'
            : '생년월(나이) 정보가 없어 또래 비교를 못 해요 — 온보딩에서 생년·월을 넣어주세요.',
      }
    : isMockup
      ? { ageLabel: '만 28개월', hw: '88.5cm / 12.4kg', bmi: 15.8, band: '정상', pct: 18, carb: 'green', protein: 'green', fat: 'yellow', tip: 'BMI 정상 범위 — 매일 먹지만 지방 양이 다소 부족해요. 견과류·아보카도·등푸른생선(EPA+DHA)으로 보강하면 좋아요.' }
      : null;
  const MSTAT: Record<MStat, { label: string; color: string; bar: string; w: number }> = {
    green: { label: '적정', color: '#1B5E20', bar: '#16A085', w: 85 },
    yellow: { label: '조금 부족', color: '#F57F17', bar: '#F9A825', w: 55 },
    red: { label: '부족', color: '#C62828', bar: '#E53935', w: 30 },
    reference: { label: '기준 참고', color: '#9CA3AF', bar: '#CBD5E1', w: 50 },
  };

  // 식품군 다양성 신호등 — 목업=예시 / 실데이터=computeGroupSignals (충분/조금부족/부족)
  const GLEVEL: Record<GroupSignal['level'], { bg: string; bd: string; fg: string; lbl: string }> = {
    green: { bg: '#E8F5E9', bd: '#16A085', fg: '#1B5E20', lbl: '충분' },
    yellow: { bg: '#FFF4D6', bd: '#F9A825', fg: '#F57F17', lbl: '조금 부족' },
    red: { bg: '#FFEBEE', bd: '#E53935', fg: '#C62828', lbl: '부족' },
  };
  const MOCK_GROUP: Record<string, GroupSignal['level']> = { '곡물': 'green', '비타민A채소': 'yellow', '기타채소': 'green', '과일': 'yellow', '유제품': 'green', '고기생선': 'green', '계란': 'yellow', '콩류': 'red' };
  const groupLevelOf = (key: string): GroupSignal['level'] => isMockup ? (MOCK_GROUP[key] || 'red') : (groupSig.signals.find((s) => s.group === key)?.level || 'red');
  const proteinOk = isMockup ? true : groupSig.proteinOk;
  const gGreen = FOOD_FAMILY.filter((f) => groupLevelOf(f.key) === 'green').length;
  const gYellow = FOOD_FAMILY.filter((f) => groupLevelOf(f.key) === 'yellow').length;
  const gRed = FOOD_FAMILY.filter((f) => groupLevelOf(f.key) === 'red').length;

  // 최근 N일 식단 진단 한줄 — AI 생성 우선, 없으면 방법론 규칙 폴백
  const ruleOneLiner = isMockup
    ? '전체적으로 잘 챙기고 있어요. 식감 단계와 메뉴 반복만 신경 쓰면 다음 주 A 등급도 가능해요.'
    : D.reds.length > 0
      ? `${D.reds.slice(0, 2).join('·')}이 부족해요. 그 식재료가 든 메뉴를 한 끼 더해보세요 — 강요 말고 식탁에 자주 올리기.`
      : D.covered.length >= 7
        ? '식품군을 골고루 챙기고 있어요. 이 페이스를 유지하며 새 식재료 한 가지씩 도전해보세요.'
        : '기본은 잘 갖췄어요. 빠진 식재료 그룹을 한 끼에 하나씩 더해보세요.';
  const oneLiner = aiOneliner || ruleOneLiner;

  // 이번 주 시도해볼 식재료 — 빈약한 식품군(적게 먹은 카테고리) 우선 + 20슬랏에 카테고리 골고루(라운드로빈)
  const FREQ_RANK: Record<string, number> = { '자주': 0, '가끔': 1, '드물게': 2, '향신료': 9 };
  const meRank = (p: { must_eat?: boolean; must_eat_tier?: string } | any) => (p.must_eat ? (p.must_eat_tier === 'core' ? 0 : 1) : 2);
  const excludedSet = new Set(excluded);
  // 집에 늘 있는 재료를 추천에서 빼면 다음 우선순위가 채워진다(구매 전 한 번 누르면 끝)
  const excludeIngredient = (nm: string) => {
    if (excluded.includes(nm)) return;
    const next = [...excluded, nm]; setExcluded(next);
    if (childId) supabase.from('children').update({ excluded_ingredients: next }).eq('id', childId).then(() => {}, () => {});
  };
  const restoreIngredient = (nm: string) => {
    const next = excluded.filter((x) => x !== nm); setExcluded(next);
    if (childId) supabase.from('children').update({ excluded_ingredients: next }).eq('id', childId).then(() => {}, () => {});
  };
  const tryRecommend = (() => {
    const byCat: Record<string, typeof pool> = {};   // 카테고리별 안 먹은 후보
    const eatenByCat: Record<string, number> = {};   // 카테고리별 먹은 개수
    pool.forEach((p) => {
      if (isSpicyIngredient(p.nm)) return;   // 매운 식재료(고추 등)는 추천 제외
      if (excludedSet.has(p.nm)) return;     // 집에 늘 있어서 엄마가 뺀 것
      if (eatenSet.has(p.nm)) { eatenByCat[p.cat] = (eatenByCat[p.cat] || 0) + 1; return; }
      (byCat[p.cat] ||= []).push(p);
    });
    // 각 카테고리 내부: 💎 영양 보석(must_eat) 먼저 → 그 안에서 급식 빈도 순
    Object.values(byCat).forEach((arr) => arr.sort((a, b) => (meRank(a) - meRank(b)) || ((FREQ_RANK[a.grade] ?? 3) - (FREQ_RANK[b.grade] ?? 3))));
    // 코칭이 짚은 '부족 식품군'(집 기준 redGroups) 카테고리를 최우선 → 콩류 부족이면 콩류 식재료가 맨 앞(코칭 추천과 정합)
    const deficientCats = new Set<string>();
    (scoreReason?.redGroups || []).forEach((g) => { Object.entries(CATEGORY_GROUP).forEach(([cat, grp]) => { if (grp === g) deficientCats.add(cat); }); });
    const cats = Object.keys(byCat).sort((a, b) => {
      const da = deficientCats.has(a) ? 0 : 1, db = deficientCats.has(b) ? 0 : 1;
      if (da !== db) return da - db;   // 부족 식품군 카테고리 먼저
      return (eatenByCat[a] || 0) - (eatenByCat[b] || 0);
    });
    const out: typeof pool = [];
    for (let round = 0; out.length < 20; round++) {
      let added = false;
      for (const c of cats) {
        const item = byCat[c][round];
        if (item) { out.push(item); added = true; if (out.length >= 20) break; }
      }
      if (!added) break;
    }
    return out;
  })();

  // 📦 이번 주 박스 배합 — 안 먹어본 빈약군 우선 다품종 소량 (실데이터)
  const boxItems = (!isMockup && pool.length) ? composeWeeklyBox({
    pool, eaten: new Set([...eatenSet, ...excluded]),   // 제외 재료는 박스에도 안 넣음
    weakCats: (() => {
      const e: Record<string, number> = {};
      pool.forEach((p) => { if (eatenSet.has(p.nm)) e[p.cat] = (e[p.cat] || 0) + 1; });
      return [...new Set(pool.map((p) => p.cat))].sort((a, b) => (e[a] || 0) - (e[b] || 0));
    })(),
    daycareRefused: refused,
    staleOf: (nm: string) => staleMap[nm] ?? 999,   // 미경험=999(최우선) — 필수인데 오래 안 먹은 것 우선
    size: 7, coreSize: 5,   // 핵심 5(💎필수·결핍보강·거부재노출) + 맛보기 2(권장도전)
    month: Number(kstToday().slice(5, 7)),   // 제철 식재료 우선(영양↑·신선) · 신선 해산물은 box.ts가 산폐위험으로 제외
  }) : [];

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

      {/* 자녀 switcher — 다자녀일 때만. 탭하면 그 아이 기준으로 전체 전환 */}
      {loggedIn && children.length >= 2 && (
        <div className="flex gap-2 px-5 pb-2 overflow-x-auto">
          {children.map((c) => {
            const on = c.id === selectedId;
            return (
              <button key={c.id} onClick={() => { setSelectedId(c.id); try { localStorage.setItem('mf_child', c.id); } catch {} }}
                className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition"
                style={on ? { background: '#FFF1E2', border: '1.5px solid #FFB375', color: '#C45A00' } : { background: '#F4F1EC', border: '1.5px solid transparent', color: '#6B7280' }}>
                {c.nickname}
              </button>
            );
          })}
          <a href="/onboarding?add=1" className="flex-shrink-0 flex items-center rounded-full px-3 py-1.5 text-[15px] font-extrabold" style={{ background: '#FFF8F0', border: '1.5px dashed #FFD8B0', color: '#B0782E', textDecoration: 'none' }}>＋</a>
        </div>
      )}

      <div className="flex-1 px-5 pb-4">
        {/* 비로그인 첫 진입 — 랜딩 히어로 + CTA (그 아래는 실제 분석 화면 미리보기) */}
        {!loading && !loggedIn && (
          <div className="rounded-2xl p-5 mb-3 text-center" style={{ background: 'linear-gradient(160deg,#FFF5EB,#FFE8D0 60%,#FFD9B8)', border: '1.5px solid #FFD0A0' }}>
            <div className="text-[11px] font-extrabold mb-1.5" style={{ color: '#C45A00' }}>35개 국제 편식이론 기반</div>
            <div className="text-[23px] font-extrabold leading-snug mb-2" style={{ color: '#1a2b4a' }}>매일, 우리 아이<br />편식 코치</div>
            <p className="text-[12.5px] leading-relaxed mb-3" style={{ color: '#5a4a3a' }}>식단만 기록하면 — 영양 신호등·BMI·코치 편지·맞춤 식재료까지 <strong>매일 자동으로</strong>.</p>
            <div className="flex flex-wrap justify-center gap-1.5 mb-3">
              {['💌 매일 코칭', '🚦 31종 영양', '📈 편식 변화', '📏 BMI·성장'].map((c) => (
                <span key={c} className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'white', color: '#C45A00', border: '1px solid #FFD0A0' }}>{c}</span>
              ))}
            </div>
            <a href="/signup" className="block rounded-xl py-3.5 text-white font-extrabold text-[15px]" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>🌱 카카오로 1초 시작 · 1개월 무료</a>
            <div className="text-[11px] mt-2 font-bold" style={{ color: '#C45A00' }}>🎁 친구 5명만 방문해도 우리 아이 평생 무료</div>
            <div className="text-[10.5px] mt-2.5" style={{ color: '#9CA3AF' }}>↓ 아래는 실제 분석 화면 미리보기예요</div>
          </div>
        )}
        {/* 목업 안내 배너 (로그인 후 기록 3일 미만) */}
        {isMockup && loggedIn && (
          <div className="rounded-xl px-4 py-3 mb-3 flex items-center gap-3" style={{ background: '#FFF5EB', border: '1.5px solid #FFD0A0' }}>
            <span className="text-xl">👀</span>
            <div className="flex-1">
              <div className="text-xs font-extrabold" style={{ color: '#C45A00' }}>아래는 예시 화면이에요</div>
              <div className="text-[11px] mt-0.5" style={{ color: '#8a7a6a' }}>3일만 기록하면 우리 아이 진짜 점수로 채워져요</div>
            </div>
          </div>
        )}

        {/* 90일 챌린지 진행 (M8) — '기록한 날 수' 기준(가입 경과일 아님). 연속이 끊겨도 누적 유지 → 하루라도 기록하면 이어감. 상단 streak 배지와 정합. design-spec: 밝은 배경·네이비 글자·오렌지 강조 */}
        {!isMockup && signupDate && (() => {
          const day = Math.min(90, loggedDays);   // 진행 = 기록한 고유 날 수. '🔥 N일 연속 기록중'과 같은 분모(기록)라 모순 없음
          const done = loggedDays >= 90;
          return (
            <div className="rounded-2xl p-3.5 mb-3 border" style={{ background: '#FFF8F0', borderColor: '#FFD0A0' }}>
              <div className="flex justify-between items-center mb-1.5">
                <div className="text-[12px] font-extrabold" style={{ color: '#C45A00' }}>🏆 90일 챌린지</div>
                <div className="text-[11px] font-bold" style={{ color: '#1a2b4a' }}>기록 {day}/90일 · <strong style={{ color: '#C45A00' }}>{pointBal.toLocaleString()}P</strong></div>
              </div>
              <div className="h-2 rounded-full" style={{ background: '#F0E0D0' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (day / 90) * 100)}%`, background: 'linear-gradient(90deg,#F9A825,#16A085)' }} />
              </div>
              <div className="text-[10px] mt-1.5" style={{ color: '#8a7a6a' }}>{done ? '🎉 90일 완주! 매일 기록 습관이 자리잡았어요' : '매일 기록해 90일 습관 완성 → 포인트로 골고루 키트 받기 🎁'}</div>
            </div>
          );
        })()}
        {/* 코치 편지 — 있으면 항상 맨 위 (가장 개인적·핵심 가치) */}
        {(isMockup || aiLetter) && (
          <div className="rounded-2xl p-4 mb-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#FFF8E1,#FFECB3)', border: '1.5px solid #F9A825' }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10.5px] font-extrabold" style={{ color: '#F57F17' }}>✉️ 코치 편지{aiLetter ? (letterDate ? ` · ${fmtLetterDate(letterDate)}` : '') : '가 도착했어요'}</div>
              {!isMockup && pastLetters.length > 0 && (
                <button onClick={() => setShowPast((v) => !v)} className="text-[10.5px] font-extrabold" style={{ color: '#C45A00' }}>{showPast ? '접기 ▲' : `📬 지난 편지 ${pastLetters.length} ▾`}</button>
              )}
            </div>
            {aiLetter ? (
              <div className="text-[13px] font-semibold leading-relaxed" style={{ color: '#1a2b4a' }}>{aiLetter}</div>
            ) : (
              <>
                <div className="text-sm font-extrabold leading-snug mb-1.5" style={{ color: '#1a2b4a' }}>&ldquo;시금치 거부로 속상하셨겠어요.<br />22번 노출 중 8번 — 정상 단계예요&rdquo;</div>
                <div className="text-[11.5px] italic" style={{ color: '#5a4a3a' }}>매일 기록하면 코치가 어제 메모에 답장을 드려요</div>
              </>
            )}
            {/* 지난 편지 — 오랜만에 온 엄마가 흐름을 다시 읽게 */}
            {showPast && pastLetters.length > 0 && (
              <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid #F0D8A0' }}>
                {pastLetters.map((p) => (
                  <div key={p.date}>
                    <div className="text-[10px] font-extrabold mb-0.5" style={{ color: '#C45A00' }}>📅 {fmtLetterDate(p.date)}</div>
                    <div className="text-[12px] leading-relaxed" style={{ color: '#5a4a3a' }}>{p.letter}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 최근 식단 진단 + 미기록 환기 — 코치 편지 바로 아래(엄마가 매일 읽는 자리) */}
        <div className="rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0', background: 'white' }}>
          <div className="flex items-center justify-between mb-2">
            <strong className="text-sm" style={{ color: '#1a2b4a' }}>📊 최근 {isMockup ? 3 : days}일 식단 진단</strong>
            <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full text-white" style={{ background: grade.color }}>{grade.g}</span>
          </div>
          <p className="text-[12.5px] leading-relaxed" style={{ color: '#5a4a3a' }}>{oneLiner}</p>
          {!isMockup && missDays.length > 0 && (
            <a href={`/care?date=${missDays[0].d}`} className="mt-2.5 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#FFF7ED', border: '1px solid #FFD9B8' }}>
              <span className="text-base">📝</span>
              <span className="text-[11.5px] font-semibold leading-snug" style={{ color: '#C45A00' }}>
                최근 5일 중 <strong>{missDays.map((x) => x.label).join('·')}</strong> 기록이 비어 있어요. 기억나는 대로 채우면 더 정확히 봐드릴게요 →
              </span>
            </a>
          )}
          <div className="text-[10px] mt-2" style={{ color: '#9CA3AF' }}>학계 기준(WHO·KDRI·SOS·HabEat)으로 자동 분석</div>
        </div>

        {/* 영양 점수 카드 */}
        <div className="rounded-2xl p-5 mb-3 shadow-sm" style={{ background: 'linear-gradient(135deg,#FFF8E1,#FFFDF5)', border: `1.5px solid ${grade.color}` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold" style={{ color: '#6B7280' }}>━ {D.name} 영양 점수 ━</span>
            <span className="text-xs font-extrabold px-3 py-1 rounded-full text-white" style={{ background: grade.color }}>{grade.g} {grade.label}</span>
          </div>
          <div className="flex items-end justify-between mb-3">
            <div className="flex items-end gap-1">
              <span className="text-5xl font-extrabold leading-none" style={{ color: '#1a2b4a' }}>{D.score}</span>
              <span className="text-lg font-bold mb-1" style={{ color: '#9CA3AF' }}>점</span>
            </div>
            {isMockup ? (
              <div className="text-[11px] text-right font-semibold" style={{ color: '#6B7280' }}>지난주 <strong style={{ color: '#1a2b4a' }}>52점 → 60점</strong> (+8)<br /><span style={{ color: '#16A085' }}>이번 주 +8 상승 중</span></div>
            ) : (scoreParts.daycare != null && scoreParts.home != null) ? (
              <div className="text-[11px] text-right font-semibold" style={{ color: '#6B7280' }}>집 <strong style={{ color: '#C45A00' }}>{scoreParts.home}</strong> · 기관 <strong style={{ color: '#1a2b4a' }}>{scoreParts.daycare}</strong><br /><span style={{ color: '#9CA3AF' }}>집 끼니 70% · 다양성·가공식품 반영</span></div>
            ) : (
              <div className="text-[11px] text-right font-semibold" style={{ color: '#6B7280' }}>최근 {days}일 기록<br /><span style={{ color: '#16A085' }}>매일 기록할수록 정확해져요</span></div>
            )}
          </div>
          {/* 왜 이 점수? — 식품군 부족·가공식품·반복 근거(점수 급락 납득용) */}
          {!isMockup && scoreReason && (scoreReason.redGroups.length > 0 || scoreReason.processed > 0 || scoreReason.repeat > 0) && (
            <div className="text-[11px] mb-2 leading-snug" style={{ color: '#9CA3AF' }}>
              <span style={{ color: '#C45A00', fontWeight: 700 }}>왜 이 점수?</span>{scoreReason.redGroups.length > 0 ? ` ${scoreReason.redGroups.slice(0, 2).join('·')} 부족` : ''}{scoreReason.processed > 0 ? ` · 가공식품(${scoreReason.processedSample.slice(0, 2).join('·')}) −${scoreReason.processed}` : ''}{scoreReason.repeat > 0 ? ` · ${scoreReason.repeatMenu} 반복 −${scoreReason.repeat}` : ''}
            </div>
          )}
          {/* 등급 게이지 */}
          <div className="relative h-2 rounded-full mb-2" style={{ background: 'linear-gradient(90deg,#C62828,#E67E22 25%,#F9A825 50%,#16A085 75%,#1B5E20)' }}>
            <div className="absolute -top-1 w-1.5 h-4 rounded-sm" style={{ left: `${pointerPct}%`, background: '#1a2b4a', border: '2px solid white' }} />
          </div>
          <div className="grid grid-cols-5 text-[9px] font-extrabold text-center mb-3">
            <span style={{ color: '#C62828' }}>D 경고</span><span style={{ color: '#E67E22' }}>C 주의</span>
            <span style={{ color: '#F9A825' }}>B 보통</span><span style={{ color: '#16A085' }}>A 좋음</span><span style={{ color: '#1B5E20' }}>S 매우</span>
          </div>
        </div>

        {/* 편식 변화(효과측정) — 이번 달 vs 지난 달, 충분한 기록 있을 때만 */}
        {!isMockup && progress?.hasComparison && progress.metrics.length > 0 && (
          <div className="rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#C8E6C9', background: 'linear-gradient(135deg,#F1F8F4,white)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <strong className="text-sm" style={{ color: '#1a2b4a' }}>📈 편식 변화 <span className="text-[10.5px] font-bold" style={{ color: '#9CA3AF' }}>최근 4주 vs 직전 4주</span></strong>
              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full" style={{ background: progress.improved >= 2 ? '#E8F5E9' : '#FFF4D6', color: progress.improved >= 2 ? '#1B5E20' : '#C45A00' }}>{progress.verdict}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {progress.metrics.map((m) => {
                const diff = m.recent - m.prior;
                const arrow = diff === 0 ? '→' : m.improved ? (m.betterUp ? '▲' : '▼') : (m.betterUp ? '▼' : '▲');
                const col = diff === 0 ? '#9CA3AF' : m.improved ? '#16A085' : '#E67E22';
                return (
                  <div key={m.key} className="rounded-xl px-3 py-2" style={{ background: 'white', border: '1px solid #E8E8E8' }}>
                    <div className="text-[10.5px] font-bold mb-0.5" style={{ color: '#8a7a6a' }}>{m.label}</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>{m.recent}{m.unit}</span>
                      <span className="text-[11px] font-bold" style={{ color: col }}>{arrow} {Math.abs(diff)}{m.unit}</span>
                    </div>
                    <div className="text-[9.5px]" style={{ color: '#B0B0B0' }}>지난달 {m.prior}{m.unit}</div>
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] mt-2" style={{ color: '#9CA3AF' }}>설문 없이 기록만으로 추정한 변화예요 (CEBQ 편식·완식·식사속도 지표)</div>
          </div>
        )}

        {/* 36종 KDRI 필수 영양소 신호등 (영양 점수 바로 아래) — 탭하면 36종 상세 모달 */}
        <button onClick={() => setShowNutri(true)} className="block w-full text-left rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0', background: 'white' }}>
          <div className="flex items-center justify-between mb-2">
            <strong className="text-sm" style={{ color: '#1a2b4a' }}>🚦 31종 필수 영양소 신호등</strong>
          </div>
          <div className="text-[10.5px] mb-3" style={{ color: '#6B7280' }}>기준: <strong style={{ color: '#1a2b4a' }}>보건복지부 KDRI 2025</strong> · 만 1-2세{!isMockup && kRef > 0 ? ` · ${kG + kY + kR}종 평가 · ${kRef}종 참고지표` : ''}</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl py-3 text-center" style={{ background: '#E8F5E9', border: '1.5px solid #16A085' }}><div className="text-2xl font-extrabold" style={{ color: '#1B5E20' }}>{kG}</div><div className="text-[11px] font-extrabold" style={{ color: '#1B5E20' }}>잘 챙김</div></div>
            <div className="rounded-xl py-3 text-center" style={{ background: '#FFF4D6', border: '1.5px solid #F9A825' }}><div className="text-2xl font-extrabold" style={{ color: '#F57F17' }}>{kY}</div><div className="text-[11px] font-extrabold" style={{ color: '#F57F17' }}>조금 부족</div></div>
            <div className="rounded-xl py-3 text-center" style={{ background: '#FFEBEE', border: '1.5px solid #E53935' }}><div className="text-2xl font-extrabold" style={{ color: '#C62828' }}>{kR}</div><div className="text-[11px] font-extrabold" style={{ color: '#C62828' }}>결핍 위험</div></div>
          </div>
          {kReds.length > 0 && (
            <div className="mt-3 rounded-lg px-3 py-2 text-[11.5px] font-bold" style={{ background: '#FFEBEE', color: '#C62828' }}>
              ⚠ <strong>{kReds.slice(0, 3).join('·')}</strong>이 가장 부족 — 성장 핵심 영양소예요
            </div>
          )}
          <div className="mt-3 rounded-xl py-3 text-center text-sm font-extrabold text-white" style={{ background: '#1a2b4a' }}>📋 31종 자세히 보기 →</div>
        </button>

        {/* 식품군 다양성 — 충분/조금부족/부족 (빈도 기반, 색+글자 3중) */}
        <div className="rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0', background: 'white' }}>
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-2">
              <strong className="text-sm" style={{ color: '#1a2b4a' }}>식품군 다양성</strong>
              {!isMockup && groupWeekly && groupWeekly.weeks.length >= 2 && (
                <button onClick={() => setShowTrend(true)} className="text-[10px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: '#FFF5EB', color: '#C45A00', border: '1px solid #FFD0A0' }}>📈 주간 추이</button>
              )}
            </div>
            <span className="text-[11px] font-extrabold"><span style={{ color: '#1B5E20' }}>🟢{gGreen}</span> <span style={{ color: '#F57F17' }}>🟡{gYellow}</span> <span style={{ color: '#C62828' }}>🔴{gRed}</span></span>
          </div>
          <div className="text-[10px] mb-3" style={{ color: '#9CA3AF' }}>이번 주 식단표에서 얼마나 자주 만났나 · 식약처 영유아 식생활지침·WHO</div>
          <div className="grid grid-cols-4 gap-2">
            {FOOD_FAMILY.map((f) => {
              const c = GLEVEL[groupLevelOf(f.key)];
              return (
                <div key={f.key} className="rounded-xl py-2 text-center" style={{ background: c.bg, border: `1.5px solid ${c.bd}` }}>
                  <div className="text-xl leading-none mb-0.5">{f.em}</div>
                  <div className="text-[9.5px] font-extrabold" style={{ color: '#374151' }}>{FAMILY_LABEL[f.key]}</div>
                  <div className="text-[9px] font-extrabold mt-0.5" style={{ color: c.fg }}>{c.lbl}</div>
                </div>
              );
            })}
          </div>
          {proteinOk && (gRed > 0 || gYellow > 0) && (
            <div className="mt-2.5 rounded-lg px-3 py-1.5 text-[10.5px] font-bold" style={{ background: '#E8F5E9', color: '#1B5E20' }}>💪 단백질은 매일 챙기고 있어요 (고기·생선·계란·콩 합산)</div>
          )}
          {/* 누적 '잘 먹는(받아들인)' 식재료 — 초등 입학 전 130종(레퍼토리). 1회 맛봄 X, 2회+·비거부 = 수용 */}
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F0F0F0' }}>
            <div className="flex justify-between text-[11px] font-bold mb-1.5"><span style={{ color: '#6B7280' }}>잘 먹는 식재료 <span style={{ color: '#9CA3AF' }}>(최근 3개월·2회+)</span></span><strong style={{ color: '#1a2b4a' }}>{cumDisp} / 130종</strong></div>
            <div className="h-1.5 rounded-full" style={{ background: '#F0F0F0' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (cumDisp / 130) * 100)}%`, background: 'linear-gradient(90deg,#F9A825,#16A085)' }} /></div>
            <div className="text-[11px] text-center mt-2 font-semibold" style={{ color: '#6B7280' }}>
              {cumDisp < 130 ? <>초등 입학 전 <strong style={{ color: '#C45A00' }}>잘 먹는 130종</strong>까지 {130 - cumDisp}종 더 만나요!</>
                : <>🎉 초등 준비 완료 — 잘 먹는 130종 달성!</>}
            </div>
            {cumDisp < 20 && !isMockup && (
              <div className="text-[10px] text-center mt-1 leading-relaxed" style={{ color: '#C45A00' }}>2주 넘게 기록했는데 <strong>잘 먹는 종류가 20가지 미만</strong>이면 조심스럽게 편식을 살펴볼 때예요. 강요 말고 천천히 새 음식을 늘려가요.</div>
            )}
            <div className="text-[10px] text-center mt-1" style={{ color: '#B0B0B0' }}>최근 3개월 내 <strong>2번 이상 거부 없이</strong> 먹은 식재료예요 (오래전 한두 번은 제외)</div>
          </div>
          {/* 식품군 8개 주간 추이 모달 — 선차트 */}
          {showTrend && groupWeekly && (
            <div onClick={() => setShowTrend(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 18, padding: 18, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
                <div className="flex justify-between items-center mb-1">
                  <strong style={{ fontSize: 15, color: '#1a2b4a' }}>📈 식품군 8개 주간 추이</strong>
                  <button onClick={() => setShowTrend(false)} style={{ fontSize: 18, color: '#9CA3AF', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
                <div className="text-[11px] mb-2" style={{ color: '#9CA3AF' }}>{groupWeekly.unit === 'day' ? `최근 ${groupWeekly.weeks.length}일 · 그날 그 식품군을 먹은 끼니 수` : `최근 ${groupWeekly.weeks.length}주 · 주당 그 식품군을 먹은 일수(0~7일)`}. 식재료는 종이 많아 8개 식품군으로 묶었어요.</div>
                <GroupTrendSVG data={groupWeekly} />
                <div className="grid grid-cols-4 gap-x-1.5 gap-y-1 mt-2">
                  {FOOD_FAMILY.map((f) => (
                    <div key={f.key} className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#5a4a3a' }}>
                      <span style={{ width: 12, height: 3, borderRadius: 2, background: GROUP_COLOR[f.key], display: 'inline-block', flexShrink: 0 }} />{f.em}{FAMILY_LABEL[f.key]}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 식감 인사이트 — 실데이터(죽 비중 40%+) or 목업 */}
        {((!isMockup && textureInsight && textureInsight.pureePct >= 40) || isMockup) && (
          <div className="rounded-2xl p-4 mb-3 shadow-sm" style={{ background: 'white', borderLeft: '4px solid #F9A825' }}>
            <div className="text-[10.5px] font-extrabold mb-1" style={{ color: '#F57F17' }}>⚠ 식감 단계 — 핑거푸드 시점</div>
            <div className="text-sm font-extrabold mb-1.5" style={{ color: '#1a2b4a' }}>이번 주 죽·다진 비중 <strong style={{ color: '#F57F17' }}>{isMockup ? 65 : textureInsight?.pureePct}%</strong>예요</div>
            <div className="text-[11.5px] leading-relaxed" style={{ color: '#5a4a3a' }}>씹는 근육이 자라는 시기라 단계를 살짝 도전해볼 때예요. 한 끼는 핑거푸드부터 — <strong>당근 스틱</strong> 추천</div>
          </div>
        )}

        {/* 메뉴 반복 인사이트 — 실데이터(3회+ 반복) or 목업. 흰쌀밥은 주식이라 경고 대신 잡곡·콩 업그레이드 제안 */}
        {!isMockup && repeatInsight?.rice ? (
          <div className="rounded-2xl p-4 mb-3 shadow-sm" style={{ background: 'white', borderLeft: '4px solid #16A085' }}>
            <div className="text-[10.5px] font-extrabold mb-1" style={{ color: '#1B5E20' }}>🍚 밥은 매일 먹는 주식이죠 (잘 하고 계세요)</div>
            <div className="text-sm font-extrabold mb-1.5" style={{ color: '#1a2b4a' }}>흰쌀에 잡곡·콩을 살짝 섞어볼까요?</div>
            <div className="text-[11.5px] leading-relaxed" style={{ color: '#5a4a3a' }}>밥은 줄일 필요 없어요. 흰쌀 한 줌에 <strong>현미·보리·귀리·검은콩·렌틸·완두</strong> 중 하나만 섞어도 식이섬유·단백질이 더해지고 새로운 맛 노출이 됩니다. 처음엔 1/4만 섞어 색·식감에 천천히 적응시켜요.</div>
          </div>
        ) : ((!isMockup && repeatInsight) || isMockup) && (
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
          <p className="text-[11px] mb-3" style={{ color: '#8a7a6a' }}>아직 안 먹어본 <strong>💎 영양 보석</strong>과 급식 단골부터 도전해보세요. 집에 늘 있는 재료는 <b>🏠 있어요</b>로 빼면 다른 걸 추천해드려요</p>
          {(isMockup
            ? [
                { em: '🐟', nm: '고등어', grade: '드물게', must_eat: true, must_eat_nutrient: '오메가3' },
                { em: '🥬', nm: '시금치', grade: '가끔', must_eat: true, must_eat_nutrient: '철분' },
                { em: '🫘', nm: '콩(대두)', grade: '드물게', must_eat: true, must_eat_nutrient: '단백질' },
                { em: '🍆', nm: '가지', grade: '가끔', must_eat: false, must_eat_nutrient: '' },
              ]
            : tryRecommend.map((p) => ({ em: p.em || '🍽', nm: p.nm, grade: p.grade, must_eat: p.must_eat, must_eat_nutrient: p.must_eat_nutrient }))
          ).map((it, i) => {
            const stars = it.grade === '자주' ? '⭐⭐⭐' : it.grade === '가끔' ? '⭐⭐' : '⭐';
            return (
              <a key={i} href={`/foods/${encodeURIComponent(it.nm)}`} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? '1px solid #F4F4F5' : 'none' }}>
                <FoodIcon nm={it.nm} em={it.em} cat="" px={28} />
                <div className="flex-1">
                  <div className="text-sm font-extrabold flex items-center gap-1.5" style={{ color: '#1a2b4a' }}>{it.nm}{it.must_eat && <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">💎 {it.must_eat_nutrient}</span>}</div>
                  <div className="text-[11px]" style={{ color: '#8a7a6a' }}>{stars} 급식 {it.grade || '일반'} · 아직 안 먹어봤어요</div>
                </div>
                {!isMockup && childId && (
                  <span role="button" onClick={(e) => { e.preventDefault(); excludeIngredient(it.nm); }} className="text-[10px] font-bold px-2 py-1.5 rounded-lg flex-shrink-0 cursor-pointer" style={{ background: '#F3F4F6', color: '#9CA3AF', border: '1px solid #E5E7EB' }}>🏠 있어요</span>
                )}
                <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: '#FFF5EB', color: '#C45A00', border: '1px solid #FFD0A0' }}>도전하기 →</span>
              </a>
            );
          })}
          {!isMockup && tryRecommend.length === 0 && <div className="text-center py-4 text-xs" style={{ color: '#9CA3AF' }}>추천할 새 식재료를 모두 먹어봤어요! 🎉</div>}
          {!isMockup && excluded.length > 0 && (
            <div className="mt-2 pt-2.5" style={{ borderTop: '1px dashed #F0F0F0' }}>
              <div className="text-[10px] mb-1.5" style={{ color: '#9CA3AF' }}>🏠 집에 있어서 뺀 재료 · 탭하면 되돌려요</div>
              <div className="flex flex-wrap gap-1.5">
                {excluded.map((nm) => (
                  <span key={nm} role="button" onClick={() => restoreIngredient(nm)} className="text-[11px] font-bold px-2 py-1 rounded-full cursor-pointer" style={{ background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}>{nm} ✕</span>
                ))}
              </div>
            </div>
          )}

          {/* 📦 이번 주 박스 배합 미리보기 — 실데이터로 구성 */}
          {boxItems.length > 0 && (
            <div className="mt-3 rounded-xl p-3.5" style={{ background: '#FFFBF5', border: '1.5px solid #FFD0A0' }}>
              <div className="flex items-center justify-between mb-1">
                <strong className="text-[13px]" style={{ color: '#1a2b4a' }}>📦 이번 주 우리 아이 박스 구성</strong>
                <span className="text-[10px] font-bold" style={{ color: '#9CA3AF' }}>{boxItems.length}종 · 핵심 {boxItems.filter((b) => b.reason !== '권장도전').length} + 맛보기 {boxItems.filter((b) => b.reason === '권장도전').length}</span>
              </div>
              <div className="text-[10.5px] mb-2" style={{ color: '#8a7a6a' }}>빈약한 식품군·안 먹어본 것 위주로 소량. <b style={{ color: '#16A085' }}>🌱 제철 식재료 우선</b>(영양↑·신선)으로, 신선 해산물은 산폐 위험이라 빼고 보내요. 강요 없이 올려만 두세요(SOS). <b>집에 있는 건 🏠로 빼면</b> 채워져요.</div>
              <div className="flex flex-wrap gap-1.5">
                {boxItems.map((b) => {
                  const m = BOX_REASON_META[b.reason];
                  const seasonal = inSeason(b.nm, Number(kstToday().slice(5, 7)));
                  return (
                    <span key={b.nm} className="text-[11px] font-bold pl-2 pr-1 py-1 rounded-lg inline-flex items-center gap-1" style={{ background: 'white', color: '#1a2b4a', border: `1px solid ${seasonal ? '#A5D6C6' : '#F0E0D0'}` }}>
                      <span>{seasonal && <span title="제철" style={{ color: '#16A085' }}>🌱</span>}{b.em} {b.nm} <span style={{ color: m.color }}>· {m.label}</span></span>
                      <span role="button" onClick={() => excludeIngredient(b.nm)} title="집에 있어요(빼기)" className="text-[9px] px-1 py-0.5 rounded cursor-pointer flex-shrink-0" style={{ background: '#F3F4F6', color: '#9CA3AF' }}>🏠</span>
                    </span>
                  );
                })}
              </div>
              {(() => {
                const tips = boxItems.map((b) => { const g = kitGuide[b.nm]; return g && g.length ? { nm: b.nm, em: b.em, ds: g.slice(0, 2).map((x) => x.d) } : null; }).filter(Boolean) as { nm: string; em: string; ds: string[] }[];
                return tips.length > 0 ? (
                  <div className="mt-2.5 pt-2.5 text-[10.5px] leading-relaxed" style={{ color: '#6B7280', borderTop: '1px dashed #FFD8B0' }}>
                    <b style={{ color: '#C45A00' }}>💡 이렇게 넣어요</b> — {tips.map((t) => `${t.em} ${t.nm}→${t.ds.join('·')}`).join('   ·   ')}
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* 골고루 키트 CTA */}
          <a href={`https://www.mealfred.com/box-product.html?app=1${childName ? `&name=${encodeURIComponent(childName)}` : ''}`} target="_blank" rel="noopener" className="block mt-2 rounded-xl p-3.5" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">📦</span>
              <div className="flex-1">
                <div className="text-sm font-extrabold text-white">{boxItems.length > 0 ? '이 구성 그대로 집으로 받기' : '골고루 키트로 집에서 만나보세요'}</div>
                <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.9)' }}>AI가 매주 분석해 구성 · 소량 배송</div>
              </div>
              <span className="text-white">›</span>
            </div>
          </a>

          <a href="/foods" className="block mt-2 py-3 rounded-xl text-center text-sm font-extrabold" style={{ background: '#FFF5EB', color: '#C45A00', border: '1px solid #FFD0A0' }}>
            🗂 식재료 도감 전체 보기 →
          </a>
        </div>

        {/* 목업 모드 — 하단 CTA */}
        {isMockup && (
          <a href={loggedIn ? '/care' : '/signup'} className="block rounded-2xl p-5 text-center text-white shadow-md" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>
            <div className="text-base font-extrabold mb-1">{loggedIn ? '🍽 지금 첫 끼 기록하기' : '🌱 카카오로 1초 시작하기'}</div>
            <div className="text-xs opacity-90">3일만 기록하면 이 화면이 우리 아이 진짜 데이터로 채워져요</div>
          </a>
        )}
      </div>

      {/* 36종 자세히 모달 — 결핍/조금부족/잘챙김 그룹만 (보충 식재료는 홈 하단에서 추천하므로 제외) */}
      {showNutri && (
        <div onClick={() => setShowNutri(false)} className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b" style={{ borderColor: '#F0F0F0' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: '#FFEBEE' }}>🚦</div>
                <div className="flex-1">
                  <h3 className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>31종 필수 영양소 신호등</h3>
                  <div className="text-[11px]" style={{ color: '#9CA3AF' }}>KDRI 2025 · {KDRI_AGE_LABEL[kdriBand]} · {isMockup ? '예시' : '이번 주 기준'}</div>
                </div>
                <button onClick={() => setShowNutri(false)} className="text-xl px-1" style={{ color: '#9CA3AF' }}>✕</button>
              </div>
              <div className="mt-3 text-[10.5px] leading-relaxed rounded-lg px-3 py-2" style={{ background: '#FAFAF7', color: '#6B7280' }}>정확한 섭취량 측정 대신 <strong style={{ color: '#1a2b4a' }}>&ldquo;이번 주 식단표에서 얼마나 자주 만났나&rdquo;</strong> 빈도로 평가해요</div>
            </div>
            <div className="px-5 py-4">
              {/* 탄·단·지 + BMI 종합 */}
              {bmiCard ? (
                <div className="rounded-2xl p-4 mb-4" style={{ background: 'linear-gradient(135deg,#FFF8F2,#FFF1E6)', border: '1.5px solid #FFD8B0' }}>
                  <div className="flex items-center justify-between mb-3">
                    <strong className="text-sm" style={{ color: '#1a2b4a' }}>💪 탄·단·지 + BMI 종합</strong>
                    <span className="text-[11px] font-bold" style={{ color: '#C45A00' }}>{[bmiCard.ageLabel, bmiCard.hw].filter(Boolean).join(' · ')}</span>
                  </div>
                  {/* BMI */}
                  <div className="rounded-xl bg-white p-3 mb-2.5" style={{ border: '1px solid #F0E0D0' }}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-[13px] font-extrabold" style={{ color: '#1a2b4a' }}>BMI {bmiCard.bmi}</span>
                      {bmiCard.pct != null ? (
                        <span className="text-right leading-tight">
                          <span className="text-[11px] font-bold block" style={{ color: bmiCard.band === '정상' ? '#1B5E20' : '#C45A00' }}>{bmiCard.band} · {bmiPhrase(bmiCard.pct)}</span>
                          <span className="text-[9.5px] font-semibold" style={{ color: '#9CA3AF' }}>또래 100명 중 {bmiCard.pct}번째</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold" style={{ color: '#9CA3AF' }}>{childMeta.sex ? '나이 정보 필요' : '성별 입력 시 또래 비교'}</span>
                      )}
                    </div>
                    {bmiCard.pct != null && (<>
                    {/* 게이지 축 = 퍼센타일 0~100 (밴드 컷오프 5/85/95에 색 맞춤), 포인터는 실제 퍼센타일 위치 */}
                    <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#FFCDD2 0%,#FFCDD2 5%,#C8E6C9 13%,#C8E6C9 82%,#FFE082 88%,#FFB74D 95%,#FFCDD2 100%)' }}>
                      <div className="absolute -top-1 w-2 h-4 rounded-full" style={{ left: `calc(${Math.min(98, Math.max(2, bmiCard.pct))}% - 4px)`, background: '#1a2b4a', border: '1.5px solid white' }} />
                    </div>
                    <div className="flex justify-between text-[9.5px] font-bold mt-1.5" style={{ color: '#9CA3AF' }}><span>저체중</span><span>정상</span><span>과체중·비만</span></div>
                    </>)}
                    {bmiTrendData?.flag && (
                      <div className="mt-2 rounded-lg px-3 py-2 text-[11px] font-bold leading-relaxed" style={{ background: '#FFF4D6', color: '#C45A00', border: '1px solid #FFD9A0' }}>
                        📈 {bmiTrendData.note} (또래 {bmiTrendData.from}→{bmiTrendData.to}번째). 갑작스런 변화면 한 번 살펴보시고, 걱정되면 전문가와 상의해보세요.
                      </div>
                    )}
                  </div>
                  {/* 탄·단·지 바 */}
                  {([['탄수화물', '🍚', bmiCard.carb], ['단백질', '🥩', bmiCard.protein], ['지방', '🥑', bmiCard.fat]] as [string, string, MStat][]).map(([nm, em, st]) => (
                    <div key={nm} className="flex items-center gap-2 mb-1.5">
                      <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: '#1a2b4a', width: '64px' }}>{em} {nm}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#F0F0F0' }}><div style={{ width: `${MSTAT[st].w}%`, height: '100%', background: MSTAT[st].bar }} /></div>
                      <span className="text-[10.5px] font-bold text-right flex-shrink-0" style={{ color: MSTAT[st].color, width: '54px' }}>{MSTAT[st].label}</span>
                    </div>
                  ))}
                  <div className="mt-2.5 rounded-lg px-3 py-2 text-[10.5px] leading-relaxed font-semibold" style={{ background: '#FFF', color: '#C45A00', border: '1px solid #FFE0C0' }}>💡 {bmiCard.tip}</div>
                </div>
              ) : (
                <a href="/care" className="block rounded-2xl p-4 mb-4 text-center" style={{ background: '#FFF8F2', border: '1.5px dashed #FFD0A0' }}>
                  <div className="text-sm font-extrabold mb-1" style={{ color: '#C45A00' }}>📏 키·몸무게를 기록해보세요</div>
                  <div className="text-[11.5px]" style={{ color: '#8a7a6a' }}>BMI·또래 비교(WHO 성장도표)를 보여드려요 — 식사 기록 화면에서 입력 →</div>
                </a>
              )}

              {[
                { key: 'red', label: '🔴 결핍 위험', color: '#C62828', bar: '#E53935' },
                { key: 'yellow', label: '🟡 조금 부족', color: '#F57F17', bar: '#F9A825' },
                { key: 'green', label: '🟢 잘 챙김', color: '#1B5E20', bar: '#16A085' },
              ].map((grp) => {
                let items = kdriView.filter((n) => n.status === grp.key);
                if (!items.length) return null;
                // 빨강(결핍)은 심한 것(빈도 낮은 것)부터 + 총량 캡 — 결핍이 많아도 압도하지 않게 상위 N개만, 나머지는 접기
                const RED_CAP = 6;
                if (grp.key === 'red') items = [...items].sort((a, b) => a.pct - b.pct);
                const shown = grp.key === 'red' && !showAllReds ? items.slice(0, RED_CAP) : items;
                const hidden = items.length - shown.length;
                return (
                  <div key={grp.key} className="mb-4">
                    <div className="text-xs font-extrabold mb-2" style={{ color: grp.color }}>{grp.label} <span style={{ color: '#9CA3AF' }}>{items.length}</span></div>
                    <div className="space-y-1.5">
                      {shown.map((n) => {
                        // 빨강은 '무엇으로 채우나' 한 줄 — 결핍마다 보충 식재료 1~2개(데이터 있을 때만)
                        const foods = grp.key === 'red' ? (NUTRIENT_FOODS[n.nm] || []).slice(0, 2) : [];
                        return (
                          <div key={n.nm}>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: '#1a2b4a', width: '88px' }}>{n.nm}</span>
                              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#F0F0F0' }}><div style={{ width: `${Math.max(4, n.pct)}%`, height: '100%', background: grp.bar }} /></div>
                              <span className="text-[10.5px] font-bold text-right flex-shrink-0" style={{ color: grp.key === 'red' ? '#C62828' : '#6B7280', width: '60px' }}>{freqLabel(n.pct)}</span>
                            </div>
                            {foods.length > 0 && (
                              <div className="text-[10px] mt-0.5" style={{ color: '#C45A00', marginLeft: '96px' }}>🍽 {foods.join('·')}로 채워요</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {hidden > 0 && (
                      <button onClick={() => setShowAllReds(true)} className="mt-2 text-[11px] font-bold" style={{ color: '#C62828' }}>+ 결핍 {hidden}종 더 보기</button>
                    )}
                  </div>
                );
              })}
              {/* 비타민D 특수 안내 — 음식만으론 어렵고 햇빛·보충제 필요(빈도 red 비활성한 보충제성 영양소) */}
              {kdriView.some((n) => n.nm === '비타민D' && (n.status === 'yellow' || n.status === 'red')) && (
                <div className="mb-4 rounded-lg px-3 py-2.5 text-[10.5px] leading-relaxed" style={{ background: '#FFF8E8', color: '#8a6d00', border: '1px solid #FFE08A' }}>
                  ☀️ <strong>비타민D</strong>는 음식만으로 채우기 어려워요. 하루 <strong>10~15분 햇볕</strong>(얼굴·팔)을 쬐고 연어·달걀노른자·표고버섯을 곁들이세요. 부족이 걱정되면 소아과에서 <strong>보충제</strong>를 상담해보세요.
                </div>
              )}
              {kRef > 0 && (
                <div className="mt-2 rounded-lg px-3 py-2.5 text-[10.5px] leading-relaxed" style={{ background: '#FAFAF7', color: '#9CA3AF' }}>
                  ℹ️ {kdriView.filter((n) => n.status === 'reference').map((n) => n.nm).join('·')}은(는) 아직 식품→영양소 데이터가 없어 KDRI 기준만 참고로 보여드려요.
                </div>
              )}
              {/* 36종이 아닌 이유 — 집계 제외 5종 안내 */}
              <details className="mt-2">
                <summary className="text-[10.5px] font-bold cursor-pointer" style={{ color: '#9CA3AF' }}>왜 36종이 아니라 31종인가요?</summary>
                <div className="mt-1.5 rounded-lg px-3 py-2.5" style={{ background: '#FAFAF7' }}>
                  {KDRI_EXCLUDED.map((e) => (
                    <div key={e.nm} className="text-[10.5px] leading-relaxed mb-1" style={{ color: '#6B7280' }}>
                      <strong style={{ color: '#374151' }}>{e.nm}</strong> — {e.reason}
                    </div>
                  ))}
                </div>
              </details>
              <div className="text-[10px] text-center mt-3 pb-2" style={{ color: '#C0C0C0' }}>기준: 보건복지부 한국인 영양소 섭취기준 (KDRI) 2025</div>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="/" />
    </main>
  );
}
