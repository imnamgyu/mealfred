/**
 * / — 밀프레드 앱 홈 (care 대시보드, care.html 리치 디자인 포팅)
 *
 * 데이터 없음(비로그인 or 3일 미만): '예시 지우' 목업 + 🔒 기록 유도
 * 3일+ 기록: 실제 meal_logs로 영양 점수·신호등·식품군·친해지기 계산
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { computeSignals, computeFoodGroups, computeTimeseries, computeKdriSignals, computeGroupSignals, KDRI_NUTRIENTS, type NutrientSignal, type KdriSignal, type GroupSignal } from '@/lib/nutrition';
import { bmiOf, bmiPercentile, bmiBand, bmiPhrase, type Sex } from '@/lib/growth-reference';
import { kstToday, kstDateNDaysAgo } from '@/lib/date';
import BottomNav from '@/components/BottomNav';

const STORAGE_KEY = 'mealfred_care_logs';
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
  const [loggedIn, setLoggedIn] = useState(false);
  const [days, setDays] = useState(0);
  const [signals, setSignals] = useState<NutrientSignal[]>([]);
  const [kdri, setKdri] = useState<KdriSignal[]>([]);   // 36종 KDRI 신호등 (실데이터)
  const [showNutri, setShowNutri] = useState(false);    // 36종 자세히 모달
  const [growth, setGrowth] = useState<{ height_cm: number | null; weight_kg: number | null; measured_on: string } | null>(null);
  const [childMeta, setChildMeta] = useState<{ sex: Sex | null; birthY: number | null; birthM: number | null }>({ sex: null, birthY: null, birthM: null });
  const [groups, setGroups] = useState<{ covered: string[]; missing: string[] }>({ covered: [], missing: [] });
  const [groupSig, setGroupSig] = useState<{ signals: GroupSignal[]; proteinOk: boolean }>({ signals: [], proteinOk: false });
  const [ingredientCount, setIngredientCount] = useState(0);
  const [cumCount, setCumCount] = useState(0);   // 누적(전체) 먹어본 식재료 종 수 → 130종 목표
  const [missDays, setMissDays] = useState<{ d: string; label: string }[]>([]);   // P9: 최근 5일 중 미기록 날(당일 제외)
  const [refused, setRefused] = useState<string[]>([]);
  const [aiLetter, setAiLetter] = useState<string>('');
  const [aiOneliner, setAiOneliner] = useState<string>('');
  const [letterDate, setLetterDate] = useState<string>('');   // 현재 표시 편지 날짜
  const [pastLetters, setPastLetters] = useState<{ date: string; letter: string; oneliner: string | null }[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [textureInsight, setTextureInsight] = useState<{ pureePct: number } | null>(null);
  const [repeatInsight, setRepeatInsight] = useState<{ menu: string; count: number } | null>(null);
  const [pool, setPool] = useState<{ nm: string; cat: string; grade: string; em: string }[]>([]);
  const [eatenSet, setEatenSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/ingredients-light.json').then((r) => r.json()).then((d) => setPool(d.ingredients)).catch(() => {});
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
        const { data: child } = await supabase.from('children').select('id,nickname,age_band,birth_year,birth_month').eq('parent_id', user.id).order('id', { ascending: true }).limit(1).maybeSingle();
        if (child) {
          setChildName(child.nickname);
          setChildMeta({ sex: null, birthY: child.birth_year ?? null, birthM: child.birth_month ?? null });
          // 성별·체위 — 마이그레이션 전이면 컬럼/테이블이 없을 수 있어 분리 쿼리(실패해도 메인 로드 무영향)
          supabase.from('children').select('sex').eq('id', child.id).maybeSingle()
            .then(({ data }) => { if (data?.sex) setChildMeta((m) => ({ ...m, sex: data.sex as Sex })); });
          supabase.from('growth_logs').select('height_cm,weight_kg,measured_on')
            .eq('child_id', child.id).order('measured_on', { ascending: false }).limit(1).maybeSingle()
            .then(({ data }) => { if (data) setGrowth(data); });
          const { data: rows } = await supabase.from('meal_logs').select('log_date,ingredients,refused,note,texture,menus,place').eq('child_id', child.id).gte('log_date', dates[6]);
          const byDate: Record<string, string[]> = {}; const allIng: string[] = []; const ref: string[] = []; const notes: string[] = [];
          const homeRef: string[] = []; const daycareRef: string[] = [];   // 거부를 장소별로 분리 (코칭엔진 스펙 §3)
          const textures: string[] = []; const menuFreq: Record<string, number> = {};
          (rows || []).forEach((r: { log_date: string; ingredients: string[] | null; refused: string | null; note: string | null; texture: string | null; menus: string[] | null; place: string | null }) => {
            if (!byDate[r.log_date]) byDate[r.log_date] = [];
            (r.ingredients || []).forEach((i) => { byDate[r.log_date].push(i); allIng.push(i); });
            if (r.refused) { ref.push(r.refused); if (r.place === 'home') homeRef.push(r.refused); else if (r.place === 'daycare') daycareRef.push(r.refused); }
            if (r.note) notes.push(r.note);
            if (r.texture) textures.push(r.texture);
            (r.menus || []).forEach((mn) => { const k = mn.replace(/\s/g, ''); menuFreq[k] = (menuFreq[k] || 0) + 1; });
          });
          const byDay = Object.values(byDate).filter((a) => a.length);
          const sig = computeSignals(byDay, catOf);
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
          setKdri(computeKdriSignals(byDay, catOf));   // 36종 KDRI 신호등 (실데이터)
          setGroupSig(computeGroupSignals(byDay, catOf));   // 식품군 다양성 신호등 (충분/조금부족/부족)
          setGroups(fg);
          setIngredientCount(new Set(allIng).size);
          setEatenSet(new Set(allIng));
          // 누적(전체 기간) 먹어본 식재료 종 수 — 130종(초등 입학 전) 목표용
          supabase.from('meal_logs').select('ingredients').eq('child_id', child.id).then(({ data }) => {
            const s = new Set<string>(); (data || []).forEach((r: { ingredients: string[] | null }) => (r.ingredients || []).forEach((i) => s.add(i)));
            setCumCount(s.size);
          });
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
          // 메뉴 반복 인사이트 — 최다 반복 메뉴
          const top = Object.entries(menuFreq).sort((a, b) => b[1] - a[1])[0];
          if (top && top[1] >= 3) setRepeatInsight({ menu: top[0], count: top[1] });

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
            if (cached?.letter && cached.source_hash === srcHash) {
              // 식단 변동 없음 → 캐시 read만
              setAiLetter(cached.letter);
              if (cached.oneliner) setAiOneliner(cached.oneliner);
              setLetterDate(today);
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
                  homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)],
                  covered: fg.covered, missing: fg.missing, timeseries: ts, attendsDaycare,
                  eatenCount: new Set(allIng).size, pastLetters,
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
  const GRADE_RANK: Record<string, number> = { '필수': 0, '권장': 1, '향신료': 3 };
  const tryRecommend = (() => {
    const byCat: Record<string, typeof pool> = {};   // 카테고리별 안 먹은 후보
    const eatenByCat: Record<string, number> = {};   // 카테고리별 먹은 개수
    pool.forEach((p) => {
      if (eatenSet.has(p.nm)) { eatenByCat[p.cat] = (eatenByCat[p.cat] || 0) + 1; return; }
      (byCat[p.cat] ||= []).push(p);
    });
    // 각 카테고리 내부는 필수→권장 우선
    Object.values(byCat).forEach((arr) => arr.sort((a, b) => (GRADE_RANK[a.grade] ?? 2) - (GRADE_RANK[b.grade] ?? 2)));
    // 빈약한 식품군(먹은 개수 적은 순) 먼저 — 라운드마다 빈약 그룹이 앞에 옴
    const cats = Object.keys(byCat).sort((a, b) => (eatenByCat[a] || 0) - (eatenByCat[b] || 0));
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
        </div>

        {/* 36종 KDRI 필수 영양소 신호등 (영양 점수 바로 아래) — 탭하면 36종 상세 모달 */}
        <button onClick={() => setShowNutri(true)} className="block w-full text-left rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0', background: 'white' }}>
          <div className="flex items-center justify-between mb-2">
            <strong className="text-sm" style={{ color: '#1a2b4a' }}>🚦 36종 필수 영양소 신호등</strong>
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
          <div className="mt-3 rounded-xl py-3 text-center text-sm font-extrabold text-white" style={{ background: '#1a2b4a' }}>📋 36종 자세히 보기 →</div>
        </button>

        {/* 식품군 다양성 — 충분/조금부족/부족 (빈도 기반, 색+글자 3중) */}
        <div className="rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0', background: 'white' }}>
          <div className="flex justify-between items-center mb-1">
            <strong className="text-sm" style={{ color: '#1a2b4a' }}>식품군 다양성</strong>
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
          {/* 누적 먹어본 식재료 — 초등 입학 전 130종(레퍼토리 다양성) */}
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F0F0F0' }}>
            <div className="flex justify-between text-[11px] font-bold mb-1.5"><span style={{ color: '#6B7280' }}>먹어본 식재료 <span style={{ color: '#9CA3AF' }}>(누적)</span></span><strong style={{ color: '#1a2b4a' }}>{cumDisp} / 130종</strong></div>
            <div className="h-1.5 rounded-full" style={{ background: '#F0F0F0' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (cumDisp / 130) * 100)}%`, background: 'linear-gradient(90deg,#F9A825,#16A085)' }} /></div>
            <div className="text-[11px] text-center mt-2 font-semibold" style={{ color: '#6B7280' }}>
              {cumDisp < 20 ? <>아직 <strong style={{ color: '#C62828' }}>편식 경계</strong> — 30종 넘기기 도전! (SOS 기준)</>
                : cumDisp < 30 ? <>곧 <strong style={{ color: '#E67E22' }}>편식 경계(30종)</strong> 돌파해요!</>
                : cumDisp < 130 ? <>초등 입학 전 <strong style={{ color: '#C45A00' }}>130종</strong>까지 {130 - cumDisp}종 더!</>
                : <>🎉 초등 준비 완료 — 130종 달성!</>}
            </div>
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

          {/* 골고루 키트 CTA */}
          <a href="https://www.mealfred.com/box-product.html" target="_blank" rel="noopener" className="block mt-3 rounded-xl p-3.5" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">📦</span>
              <div className="flex-1">
                <div className="text-sm font-extrabold text-white">골고루 키트로 집에서 만나보세요</div>
                <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.9)' }}>안 먹어본 식재료, AI가 골라 주 1회 소량 배송</div>
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
                  <h3 className="text-base font-extrabold" style={{ color: '#1a2b4a' }}>36종 필수 영양소 신호등</h3>
                  <div className="text-[11px]" style={{ color: '#9CA3AF' }}>KDRI 2025 · 만 1-2세 · {isMockup ? '예시' : '이번 주 기준'}</div>
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
                const items = kdriView.filter((n) => n.status === grp.key);
                if (!items.length) return null;
                return (
                  <div key={grp.key} className="mb-4">
                    <div className="text-xs font-extrabold mb-2" style={{ color: grp.color }}>{grp.label} <span style={{ color: '#9CA3AF' }}>{items.length}</span></div>
                    <div className="space-y-1.5">
                      {items.map((n) => (
                        <div key={n.nm} className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: '#1a2b4a', width: '88px' }}>{n.nm}</span>
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#F0F0F0' }}><div style={{ width: `${Math.max(4, n.pct)}%`, height: '100%', background: grp.bar }} /></div>
                          <span className="text-[10.5px] font-bold text-right flex-shrink-0" style={{ color: grp.key === 'red' ? '#C62828' : '#6B7280', width: '60px' }}>{freqLabel(n.pct)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {kRef > 0 && (
                <div className="mt-2 rounded-lg px-3 py-2.5 text-[10.5px] leading-relaxed" style={{ background: '#FAFAF7', color: '#9CA3AF' }}>
                  ℹ️ {kdriView.filter((n) => n.status === 'reference').map((n) => n.nm).join('·')}은(는) 식단 빈도로 평가하지 않는 참고지표예요 — 나트륨은 적을수록 좋고, 불소는 물·치아 영양소.
                </div>
              )}
              <div className="text-[10px] text-center mt-3 pb-2" style={{ color: '#C0C0C0' }}>기준: 보건복지부 한국인 영양소 섭취기준 (KDRI) 2025</div>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="/" />
    </main>
  );
}
