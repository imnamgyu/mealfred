/**
 * /care — 식사 기록 PWA (M5)
 *
 * 6 슬롯(아침·오전간식·점심·오후간식·저녁·야간) × 식재료 해시태그 + 메모 + 사진.
 * 로그인 전: localStorage mock 저장 (골격 검증용).
 * 로그인 후(M4 연동): Supabase meal_logs 테이블 저장.
 */
'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import BottomNav from '@/components/BottomNav';
import LoginCta from '@/components/LoginCta';
import InstitutionSelect from '@/components/InstitutionSelect';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { normalizeIngredient } from '@/lib/lexicon';
import { createMapper } from '@/lib/menuMapCore';
import { kstToday, kstDateNDaysAgo } from '@/lib/date';
import { loadIngredientsLight } from '@/lib/staticData';
import { computeMealDefaults, pickDefault, type MealDefaults } from '@/lib/mealDefaults';
import { loadCareLogs, saveCareLogs, clearCareLogs, purgeLegacyCareCache } from '@/lib/careCache';

type Slot = { key: string; label: string; emoji: string; time: string };
const SLOTS: Slot[] = [
  { key: 'breakfast', label: '아침', emoji: '🌅', time: '07–09시' },
  { key: 'am_snack', label: '오전간식', emoji: '🍎', time: '10–11시' },
  { key: 'lunch', label: '점심', emoji: '🍚', time: '12–13시' },
  { key: 'pm_snack', label: '오후간식', emoji: '🍪', time: '15–16시' },
  { key: 'dinner', label: '저녁', emoji: '🌙', time: '18–19시' },
  { key: 'night', label: '야간', emoji: '🌃', time: '20시 이후' },
];

type Ingredient = { nm: string; cat: string; grade: string };
type Tag = { name: string; ai?: boolean; fromMenu?: string };  // ai=true: AI 추정 / fromMenu: 출처 메뉴
// 먹는 장소 — 정량 영양평가는 전부 집계하되, 정성 코칭은 부모가 바꿀 수 있는 곳(집)에 포커스 (코칭엔진 스펙 §3)
type PlaceVal = 'home' | 'daycare' | 'dining' | '';
const PLACE_OPTS: { v: PlaceVal; label: string; emoji: string }[] = [
  { v: 'home', label: '집', emoji: '🏠' },
  { v: 'daycare', label: '어린이집·유치원', emoji: '🏫' },
  { v: 'dining', label: '외식', emoji: '🍴' },
];
// 슬롯·요일 기반 스마트 기본값 (부모가 토글로 덮어쓸 수 있음): 아침·저녁·야간=집, 점심·간식=평일 기관/주말 집
function defaultPlace(slot: string, dateStr: string): PlaceVal {
  if (slot === 'breakfast' || slot === 'dinner' || slot === 'night') return 'home';
  const day = new Date(dateStr).getUTCDay();  // dateStr=YYYY-MM-DD는 UTC 자정 파싱 → getUTCDay로 요일 일치
  return day >= 1 && day <= 5 ? 'daycare' : 'home';
}
// ⭐ 수용 5단계 척도(이사님 2026-06-19) — 0 거부·1 만짐·2 한입·3 조금·4 완식. 이진 ate_well의 '미상 80%' 한계를 깨는 신호포착.
//   엔진(lib/preferenceQuantification)이 acceptance_level을 1차로 읽고, 없으면 ate_well로 폴백 → 점진 전환 안전.
const ACCEPT_LEVELS = [
  { lvl: 0, emoji: '🙅', label: '거부', desc: '안 먹음', c: '#E53935' },
  { lvl: 1, emoji: '👀', label: '만짐', desc: '만지작', c: '#EF6C00' },
  { lvl: 2, emoji: '😐', label: '한입', desc: '한 입 시도', c: '#F9A825' },
  { lvl: 3, emoji: '🙂', label: '조금', desc: '조금 먹음', c: '#7CB342' },
  { lvl: 4, emoji: '😋', label: '완식', desc: '잘 먹음', c: '#16A085' },
] as const;
const levelToAteWell = (lvl: number | null): boolean | null => lvl == null ? null : lvl <= 0 ? false : lvl >= 3 ? true : null;   // 0→거부(false)·3·4→수용(true)·1·2 만짐/한입→미상(null, 기존 이진 의미 보존)
const ateWellToLevel = (aw: boolean | null): number | null => aw === true ? 4 : aw === false ? 0 : null;   // 구 행(acceptance_level 없음) 표시용 역매핑

type MealEntry = { menus: string[]; ingredients: Tag[]; note: string; ateWell: boolean | null; acceptLevel: number | null; refused: string; texture: string; autonomy: string; environment: string; durationMin: number | null; mealTime: number | null; reaction: string; place: PlaceVal };
function emptyEntry(slot: string, dateStr: string): MealEntry {
  return { menus: [], ingredients: [], note: '', ateWell: null, acceptLevel: null, refused: '', texture: '', autonomy: '', environment: '', durationMin: null, mealTime: null, reaction: '', place: defaultPlace(slot, dateStr) };
}
type DayLog = Record<string, MealEntry>;
const MEAL_PARSE_API = 'https://app.mealfred.com/api/meal/parse';

const todayStr = kstToday;   // KST 기준 — 크론(letter_date/q_date)과 동일 앵커

// 끼니 캐시는 lib/careCache(유저별 격리)로 일원화. 로그인 사용자는 server(meal_logs)가 단일 진실 —
// localStorage는 비로그인(guest) 미리보기에만 쓴다(계정 간 표시 누수·디스크 영구화 차단).
const loadGuestLogs = (): Record<string, DayLog> => loadCareLogs<Record<string, DayLog>>(null);

// Supabase row ↔ MealEntry 변환
type MealRow = { log_date: string; slot: string; menus: string[] | null; ingredients: string[] | null; note: string | null; ate_well: boolean | null; acceptance_level?: number | null; refused: string | null; texture: string | null; autonomy: string | null; environment: string | null; duration_min: number | null; meal_time: number | null; reaction: string | null; place: string | null };
function rowToEntry(r: MealRow): MealEntry {
  return {
    menus: r.menus || [],
    ingredients: (r.ingredients || []).map((name) => ({ name, ai: false })),
    note: r.note || '',
    ateWell: r.ate_well,
    acceptLevel: r.acceptance_level ?? ateWellToLevel(r.ate_well),   // 신규 5단계 우선, 구 행은 ate_well에서 역매핑(완식/거부만 복원)
    refused: r.refused || '',
    texture: r.texture || '',
    autonomy: r.autonomy || '',
    environment: r.environment || '',
    durationMin: r.duration_min ?? null,
    mealTime: r.meal_time ?? null,
    reaction: r.reaction || '',
    place: (r.place as PlaceVal) || '',   // 미상은 보존 — 추정값으로 덮어쓰지 않음(저장 시 영구화 방지). 신규 입력만 emptyEntry에서 스마트 기본값
  };
}
function entryToRow(e: MealEntry, childId: string, userId: string, date: string, slot: string) {
  return {
    child_id: childId,
    parent_id: userId,
    log_date: date,
    slot,
    menus: e.menus,
    ingredients: e.ingredients.map((t) => t.name),
    note: e.note || null,
    refused: e.refused || null,
    acceptance_level: e.acceptLevel,   // ⭐ 5단계 수용 신호(원장)
    ate_well: e.acceptLevel != null ? levelToAteWell(e.acceptLevel) : e.ateWell,   // 5단계 선택 시 이진은 파생(구 소비자 호환) — 5단계 미선택(구 입력)은 ateWell 유지
    texture: e.texture || null,
    autonomy: e.autonomy || null,
    environment: e.environment || null,
    duration_min: e.durationMin,
    meal_time: e.mealTime,
    reaction: e.reaction || null,
    place: e.place || null,
    updated_at: new Date().toISOString(),
  };
}

export default function CarePage() {
  const [pool, setPool] = useState<Ingredient[]>([]);
  const [date, setDate] = useState(todayStr());
  const [activeSlot, setActiveSlot] = useState<string>('breakfast');
  const [entry, setEntry] = useState<MealEntry>(() => emptyEntry('breakfast', todayStr()));
  const [menuInput, setMenuInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [query, setQuery] = useState('');
  const [logs, setLogs] = useState<Record<string, DayLog>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);   // 서버 저장 중 — 진행바 표시
  const [userId, setUserId] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [dailyQ, setDailyQ] = useState<{ question: string; chips: string[]; answer: string } | null>(null);
  const [qInput, setQInput] = useState('');         // 오늘의 질문 수동 입력
  const [answeredNow, setAnsweredNow] = useState(false);   // 이번 세션에 답함 → 슬림 확인만
  const [icfqFlag, setIcfqFlag] = useState(false);   // ICFQ 위험신호 2주 2개+ → 비알람 상담 안내
  // 개인 캐시 — 로그인 시 받아둔 그 엄마의 메뉴→식재료(교정/최근). 입력 즉시 해석(네트워크 0)
  const [personalMap, setPersonalMap] = useState<Record<string, string[]>>({});
  // 체위(키·몸무게) 시계열 — 언제든 입력. 홈 36종 모달 BMI·퍼센타일에 반영
  const [sex, setSex] = useState<'M' | 'F' | ''>('');
  const [daycare, setDaycare] = useState(false);   // 등원 — 평일 점심·간식은 기관 끼니(코칭 반영)
  const [instType, setInstType] = useState<string | null>(null);   // 등록된 기관 유형(daycare/kindergarten) — place 칩 라벨용
  // 식단표 OCR 자동채움
  const [ocrOpen, setOcrOpen] = useState(false);
  const [menuMonths, setMenuMonths] = useState<Set<string>>(new Set());   // 식단표 등록된 달(YYYY-MM)
  const [pointToast, setPointToast] = useState('');   // 포인트 적립 토스트
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrItems, setOcrItems] = useState<{ date: string; slot: string; menu: string; ingredients: string[] }[]>([]);
  const [ocrMonth, setOcrMonth] = useState(() => kstToday().slice(0, 7));
  const [ocrMsg, setOcrMsg] = useState('');
  const [ocrElapsed, setOcrElapsed] = useState(0);   // 식단표 인식 진행 카운트다운
  const [growthLatest, setGrowthLatest] = useState<{ measured_on: string; height_cm: number | null; weight_kg: number | null } | null>(null);
  const [gOpen, setGOpen] = useState(false);
  const [gH, setGH] = useState(''); const [gW, setGW] = useState(''); const [gSaved, setGSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mealDefaultsRef = useRef<MealDefaults | null>(null);   // 끼니×주중주말 패턴 prefill (본인 기록서 계산)
  const [hasPattern, setHasPattern] = useState(false);          // prefill 단서 존재 → "지난 패턴으로 채움" 힌트용

  // emptyEntry + 개인 패턴(장소·시간·식감) 덮어쓰기 → 새 입력 폼 prefill
  function freshEntry(slot: string, dateStr: string): MealEntry {
    const base = emptyEntry(slot, dateStr);
    const d = pickDefault(mealDefaultsRef.current, slot, dateStr);
    return {
      ...base,   // 음식(menus)·식재료(ingredients)는 절대 prefill 안 함 — 매번 달라지므로
      place: (d.place as PlaceVal) || base.place,
      mealTime: d.mealTime ?? base.mealTime,
      texture: d.texture ?? base.texture,
      autonomy: d.autonomy ?? base.autonomy,
      environment: d.environment ?? base.environment,
      durationMin: d.durationMin ?? base.durationMin,
    };
  }
  const supabase = createSupabaseBrowser();
  // 홈 '미기록 알림(P9)' 딥링크 — /care?date=YYYY-MM-DD 면 그 날짜로 시작
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('date');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= todayStr()) setDate(q);
  }, []);
  // 클라 전역 매퍼 — 로드된 풀로 흔한 메뉴를 네트워크 없이 즉시 분해
  const mapper = useMemo(() => createMapper(pool.map((p) => p.nm)), [pool]);

  // 식재료 풀 로드 + localStorage 우선 표시
  useEffect(() => {
    loadIngredientsLight().then((ings) => setPool(ings));   // P0-5: 모듈캐시 로더(탭 생존 중 1회 fetch)
    purgeLegacyCareCache();   // 네임스페이스 없던 옛 전역 키 폐기 — 계정 간 누수 차단(1회)
    setLogs(loadGuestLogs());
  }, []);

  // 로그인 감지 → 자녀 조회 → Supabase 기록 로드 + localStorage 동기화
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;  // 비로그인: localStorage mock 유지
      setUserId(user.id);

      const { data: child } = await supabase.from('children')
        .select('id').eq('parent_id', user.id).order('id', { ascending: true }).limit(1).maybeSingle();
      if (!child) return;  // 자녀 없음 (onboarding 필요)
      setChildId(child.id);
      // 성별·체위 — 마이그레이션 전이면 컬럼/테이블이 없을 수 있어 분리 쿼리(실패해도 무영향)
      supabase.from('children').select('sex').eq('id', child.id).maybeSingle()
        .then(({ data }) => { if (data?.sex) setSex(data.sex); });
      supabase.from('children').select('daycare').eq('id', child.id).maybeSingle()
        .then(({ data }) => { if (data) setDaycare(!!data.daycare); });
      supabase.from('growth_logs').select('measured_on,height_cm,weight_kg')
        .eq('child_id', child.id).order('measured_on', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => { if (data) { setGrowthLatest(data); setGH(data.height_cm != null ? String(data.height_cm) : ''); setGW(data.weight_kg != null ? String(data.weight_kg) : ''); } });

      // 개인 캐시 프리로드 — 그 엄마의 메뉴 교정(user_menu_overrides) 전부.
      // 입력 시 이 캐시 → 클라 매퍼 → (둘 다 미스면) 비동기 LLM 순으로 해석해 네트워크를 최대한 안 탄다.
      supabase.from('user_menu_overrides').select('menu,ingredients').eq('parent_id', user.id)
        .then(({ data }) => {
          if (!data) return;
          const pm: Record<string, string[]> = {};
          data.forEach((o: { menu: string; ingredients: string[] | null }) => { if (o.menu && o.ingredients?.length) pm[o.menu] = o.ingredients; });
          setPersonalMap(pm);
        });

      // Supabase에서 기존 기록 로드
      const { data: rows } = await supabase.from('meal_logs')
        .select('log_date,slot,menus,ingredients,note,ate_well,acceptance_level,refused,texture,autonomy,environment,duration_min,meal_time,reaction,place,source')
        .eq('child_id', child.id).gte('log_date', kstDateNDaysAgo(365));   // P0-3: 과거 1년 상한(다년 누적 풀스캔 차단·미래 식단표는 lte 없어 유지)

      const cloud: Record<string, DayLog> = {};
      const mm = new Set<string>();   // 식단표 OCR(daycare_menu) 등록된 'YYYY-MM' — 그 달은 업로더 숨김
      (rows || []).forEach((r: MealRow & { source?: string | null }) => {
        if (!cloud[r.log_date]) cloud[r.log_date] = {};
        cloud[r.log_date][r.slot] = rowToEntry(r);
        if (r.source === 'daycare_menu') mm.add(r.log_date.slice(0, 7));
      });
      setMenuMonths(mm);

      // localStorage에만 있는 기록 → Supabase로 1회 동기화 (클라우드 우선)
      const local = loadGuestLogs();   // guest(비로그인) 미리보기 기록만 — 로그인 계정은 localStorage에 안 씀
      const toSync: ReturnType<typeof entryToRow>[] = [];
      for (const [d, dayLog] of Object.entries(local)) {
        for (const [slot, e] of Object.entries(dayLog)) {
          const hasContent = e.menus?.length || e.ingredients?.length || e.note;
          if (hasContent && !cloud[d]?.[slot]) {
            toSync.push(entryToRow(e as MealEntry, child.id, user.id, d, slot));
            if (!cloud[d]) cloud[d] = {};
            cloud[d][slot] = e as MealEntry;
          }
        }
      }
      if (toSync.length) {
        await supabase.from('meal_logs').upsert(toSync, { onConflict: 'child_id,log_date,slot' });
      }
      clearCareLogs(null);   // guest 미리보기를 이 계정으로 이관 완료 → 비움(다른 계정으로 재이관·누수 방지)

      setLogs(cloud);

      // 끼니×주중주말 패턴 prefill 계산 (본인 전체 기록) — 새 입력 폼 장소·시간·식감 미리채움
      const md = computeMealDefaults((rows || []).map((r: MealRow) => ({ slot: r.slot, log_date: r.log_date, place: r.place, meal_time: r.meal_time, texture: r.texture, autonomy: r.autonomy, environment: r.environment, duration_min: r.duration_min })));
      mealDefaultsRef.current = md;
      setHasPattern(Object.keys(md).length > 0);

      // 최근 30일 '단일 메뉴' 기록 → 메뉴→식재료 캐시. override 아닌 미지 메뉴도
      // 재입력 시 즉시 뜨고 재-LLM을 막는다. (단일 메뉴 행만 = 깔끔한 귀속)
      const cut = new Date(); cut.setDate(cut.getDate() - 30);
      const cutStr = cut.toISOString().slice(0, 10);
      const recent: Record<string, string[]> = {};
      (rows || []).forEach((r: MealRow) => {
        if (!r.log_date || r.log_date < cutStr) return;
        const ms = r.menus || []; const ings = r.ingredients || [];
        if (ms.length === 1 && ings.length) {
          const k = ms[0].replace(/\s/g, '');
          if (k) recent[k] = [...new Set(ings.map(normalizeIngredient).filter(Boolean))];
        }
      });
      if (Object.keys(recent).length) setPersonalMap((pm) => ({ ...recent, ...pm }));  // 교정(override)이 이김

      // ICFQ 레드플래그 — 최근 60일 위험신호(answer=첫 칩) 2개+면 비알람 상담 안내(1회). ICFQ가 10일 주기라 60일에 누적.
      supabase.from('daily_questions').select('chips,answer,topic').eq('child_id', child.id).eq('topic', 'icfq')
        .gte('q_date', kstDateNDaysAgo(60)).not('answer', 'is', null)
        .then(({ data }) => {
          const risk = (data || []).filter((r: { chips: string[] | null; answer: string | null }) => r.answer && r.chips?.[0] && r.answer.trim() === r.chips[0]).length;
          if (risk >= 2) setIcfqFlag(true);
        });
      // 오늘의 질문 — 있으면 read, 없으면 LLM 생성·캐싱 (식사 기록 = 상담 창구)
      const today = todayStr();
      const { data: q } = await supabase.from('daily_questions')
        .select('question,chips,answer').eq('child_id', child.id).eq('q_date', today).maybeSingle();
      if (q?.question) {
        setDailyQ({ question: q.question, chips: q.chips || [], answer: q.answer || '' });
      } else {
        // 최근 식재료·거부·지난 Q&A 수집 + 실제 로그 음식(장소·완식·경과일)·기관 거부 (코칭엔진 스펙 §3·§5.2)
        const recentIng: string[] = []; const recentRef: string[] = [];
        const recentMeals: { food: string; menu?: string; place: PlaceVal; ateWell: boolean | null; slot: string; daysAgo: number }[] = [];
        const homeRef: string[] = []; const daycareRef: string[] = [];
        const todayMs = new Date(todayStr()).getTime();
        // 날짜 내림차순 — first-win dedup이 '식재료별 최신 끼니'를 남기도록
        Object.entries(cloud).sort((a, b) => b[0].localeCompare(a[0])).forEach(([d, day]) => {
          const daysAgo = Math.round((todayMs - new Date(d).getTime()) / 86400000);
          Object.entries(day).forEach(([slot, e]) => {
            e.ingredients.forEach((t) => {
              recentIng.push(t.name);
              if (daysAgo <= 3) recentMeals.push({ food: t.name, menu: (e.menus || []).join('·') || undefined, place: e.place, ateWell: e.ateWell, slot, daysAgo });
            });
            if (e.refused) { recentRef.push(e.refused); if (e.place === 'home') homeRef.push(e.refused); else if (e.place === 'daycare') daycareRef.push(e.refused); }
          });
        });
        // 음식별 최신 1건으로 축약 (질문이 짚을 후보)
        const seenFood = new Set<string>();
        const meals = recentMeals.filter((m) => (seenFood.has(m.food) ? false : (seenFood.add(m.food), true))).slice(0, 20);
        const { data: pastQ } = await supabase.from('daily_questions')
          .select('question,answer').eq('child_id', child.id).neq('q_date', today)
          .order('q_date', { ascending: false }).limit(5);
        const pastQA = (pastQ || []).map((p: { question: string; answer: string | null }) => ({ q: p.question, a: p.answer || '' }));
        const childData = await supabase.from('children').select('age_band').eq('id', child.id).maybeSingle();
        const r = await fetch('https://app.mealfred.com/api/coach/question', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            childName: '', ageBand: childData.data?.age_band,
            recentMeals: meals, homeRefused: [...new Set(homeRef)], daycareRefused: [...new Set(daycareRef)],
            recentIngredients: [...new Set(recentIng)], refused: [...new Set(recentRef)], pastQA,
          }),
        }).then((r) => r.json()).catch(() => null);
        if (r?.question) {
          setDailyQ({ question: r.question, chips: r.chips || [], answer: '' });
          supabase.from('daily_questions').upsert(
            { child_id: child.id, parent_id: user.id, q_date: today, question: r.question, topic: r.topic || null, chips: r.chips || null },
            { onConflict: 'child_id,q_date' }
          ).then(() => {});
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 오늘의 질문 답변 저장 (칩 or 수동 입력)
  async function answerDailyQ(ans: string) {
    const a = ans.trim();
    if (!a) return;
    setDailyQ((q) => (q ? { ...q, answer: a } : q));
    setAnsweredNow(true);
    setQInput('');
    if (userId && childId) {
      await supabase.from('daily_questions').update({ answer: a, answered_at: new Date().toISOString() })
        .eq('child_id', childId).eq('q_date', todayStr());
    }
  }

  // 식단표 인식 중 경과 카운트(부모 대기 UX) — CLOVA+Sonnet 비전이라 한 달치 보통 1~2분
  useEffect(() => {
    if (!ocrBusy) { setOcrElapsed(0); return; }
    const id = setInterval(() => setOcrElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [ocrBusy]);

  // 슬롯·날짜 바뀌면 기존 기록 불러오기 (없으면 개인 패턴으로 prefill된 빈 폼)
  useEffect(() => {
    const dayLog = logs[date] || {};
    setEntry(dayLog[activeSlot] || freshEntry(activeSlot, date));
  }, [date, activeSlot, logs]);

  const hasName = (nm: string) => entry.ingredients.some((t) => t.name === nm);

  // 분해된 식재료를 정규화·중복제거해 태그로 추가 (메뉴 출처 표시)
  function applyMenuTags(key: string, ingredients: string[]) {
    const names = [...new Set(ingredients.map(normalizeIngredient).filter(Boolean))];
    setEntry((e) => {
      const add = names.filter((nm) => !e.ingredients.some((x) => x.name === nm)).map((nm) => ({ name: nm, ai: true, fromMenu: key } as Tag));
      return { ...e, ingredients: [...e.ingredients, ...add] };
    });
  }

  // 메뉴명 입력 → 식재료 자동 분해.
  // 0) 개인 캐시(엄마 교정) → 1) 클라 전역 매퍼 → 둘 다 즉시(네트워크 0).
  // 2) 둘 다 미스인 미지 메뉴만 비동기 LLM. 메뉴 태그는 항상 즉시 뜨고 식재료만 나중에 채움.
  async function addMenu(menu: string) {
    const m = menu.trim();
    if (!m) return;
    const key = m.replace(/\s/g, '');
    setMenuInput('');
    setEntry((e) => ({ ...e, menus: [...e.menus, m] }));   // 메뉴 즉시 표시(선입력)

    // 0) 개인 캐시 (그 엄마가 전에 확정한 그 메뉴)
    if (personalMap[key]?.length) { applyMenuTags(key, personalMap[key]); return; }
    // 1) 클라 전역 매퍼 (흔한 메뉴 — 즉시)
    const local = mapper.mapMenu(m);
    if (local) { applyMenuTags(key, local.ingredients); return; }

    // 2) 미지 메뉴만 비동기 LLM (그동안 메뉴 태그는 이미 떠 있음)
    setParsing(true);
    try {
      const resp = await fetch(MEAL_PARSE_API, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ menu: m }),
      });
      const data = await resp.json();
      applyMenuTags(key, data.ingredients || []);
    } catch {
      // 분해 실패해도 메뉴명은 남음
    } finally {
      setParsing(false);
    }
  }

  const suggestions = query.trim()
    ? pool.filter((p) => p.nm.includes(query.trim()) && !hasName(p.nm)).slice(0, 8)
    : [];

  // 메뉴 커스텀 저장 (피드백 루프) — 그 사용자의 해당 메뉴 식재료를 기억
  async function saveMenuOverride(menuKey: string, names: string[]) {
    if (!userId || !menuKey) return;
    setPersonalMap((pm) => ({ ...pm, [menuKey]: names }));   // 개인 캐시 즉시 갱신(같은 세션 재입력 일관성)
    await supabase.from('user_menu_overrides').upsert(
      { parent_id: userId, menu: menuKey, ingredients: names, updated_at: new Date().toISOString() },
      { onConflict: 'parent_id,menu' }
    ).then(({ error }) => { if (error) console.warn('[override] save:', error.message); });
  }

  function addIngredient(raw: string) {
    const t = (raw || '').trim();
    if (/\s/.test(t) || t.length > 14) return;   // 식재료는 단어 1개 — 공백 있거나 과하게 길면 문장(다른 입력창 오입력) → 거부
    const nm = normalizeIngredient(t);   // 소세지→소시지, 멥쌀→쌀 등 대표어로 정규화 후 저장
    if (!nm || hasName(nm)) return;
    const onlyMenu = entry.menus.length === 1 ? entry.menus[0].replace(/\s/g, '') : null;
    const newTag: Tag = { name: nm, ai: false, fromMenu: onlyMenu || undefined };
    const next = [...entry.ingredients, newTag];
    setEntry((e) => ({ ...e, ingredients: next }));
    setQuery('');
    inputRef.current?.focus();
    // 메뉴가 하나면 그 메뉴 커스텀 재학습
    if (onlyMenu) saveMenuOverride(onlyMenu, next.filter((x) => x.fromMenu === onlyMenu).map((x) => x.name));
  }
  function removeIngredient(nm: string) {
    const tag = entry.ingredients.find((x) => x.name === nm);
    const next = entry.ingredients.filter((x) => x.name !== nm);
    setEntry((e) => ({ ...e, ingredients: next }));
    // 특정 메뉴 출처 식재료를 빼면 → 그 메뉴 커스텀 재학습 (예: 짜파게티에서 당근 빼기)
    if (tag?.fromMenu) saveMenuOverride(tag.fromMenu, next.filter((x) => x.fromMenu === tag.fromMenu).map((x) => x.name));
  }
  function removeMenu(menu: string) {
    setEntry((e) => ({ ...e, menus: e.menus.filter((x) => x !== menu) }));
  }

  // 체위 저장 — 오늘 날짜로 growth_logs upsert + 성별 갱신 (시계열)
  async function saveGrowth() {
    if (!userId || !childId) return;
    const h = parseFloat(gH) || null; const w = parseFloat(gW) || null;
    if (!h && !w) return;
    const today = todayStr();
    await supabase.from('growth_logs').upsert(
      { child_id: childId, parent_id: userId, measured_on: today, height_cm: h, weight_kg: w, updated_at: new Date().toISOString() },
      { onConflict: 'child_id,measured_on' }
    ).then(({ error }) => { if (error) console.warn('[growth] save:', error.message); });
    if (sex) supabase.from('children').update({ sex }).eq('id', childId).then(() => {});
    setGrowthLatest({ measured_on: today, height_cm: h, weight_kg: w });
    setGSaved(true); setTimeout(() => setGSaved(false), 1500);
  }

  async function saveDaycare(v: boolean) {
    setDaycare(v);
    if (childId) supabase.from('children').update({ daycare: v }).eq('id', childId).then(({ error }) => { if (error) console.warn('[daycare] save:', error.message); });
  }
  // 성별은 토글 즉시 저장 (체위 저장 버튼과 분리) — BMI 또래 퍼센타일에 바로 반영
  async function saveSex(v: 'M' | 'F') {
    setSex(v);
    if (childId) supabase.from('children').update({ sex: v }).eq('id', childId).then(({ error }) => { if (error) console.warn('[sex] save:', error.message); });
  }

  // 식단표 사진 → /api/ocr 로 끼니별 메뉴 분해
  async function handleOcrFile(file: File | null) {
    if (!file) return;
    setOcrBusy(true); setOcrMsg(''); setOcrItems([]);
    try {
      const fd = new FormData(); fd.append('image', file);
      const res = await fetch('https://app.mealfred.com/api/ocr', { method: 'POST', body: fd });
      if (!res.ok) {
        setOcrMsg(res.status === 504 || res.status === 503 || res.status === 408
          ? '처리 시간이 초과됐어요 😢 — 한 달치는 무거워요. 식단표를 한 주씩 잘라서, 또는 더 작고 선명한 사진으로 올려주세요.'
          : `업로드 실패 (서버 ${res.status}) — 잠시 후 다시 시도해주세요.`);
        return;
      }
      const r = await res.json().catch(() => null);
      if (!r) { setOcrMsg('응답을 읽지 못했어요 — 처리 시간이 길었을 수 있어요. 한 주씩 잘라 다시 시도해주세요.'); return; }
      if (r.is_menu === false) setOcrMsg(r.reason || '식단표를 인식하지 못했어요. 더 선명한 사진으로 시도해주세요.');
      else {
        const items = (r.items || []).filter((it: { menu?: string }) => it.menu);
        setOcrItems(items);
        if (!items.length) setOcrMsg('메뉴를 찾지 못했어요.');
      }
    } catch { setOcrMsg('업로드 실패 (네트워크) — 연결 확인 후 다시 시도해주세요.'); }
    finally { setOcrBusy(false); }
  }

  // 인식된 식단표 → 기관 급식(meal_logs, place=daycare, source=daycare_menu)으로 저장. 부모 입력은 덮어쓰지 않음.
  const OCR_SLOT: Record<string, string> = { '오전간식': 'am_snack', '점심': 'lunch', '오후간식': 'pm_snack' };
  async function saveDaycareMenu() {
    if (!userId || !childId || !ocrItems.length) return;
    const [y, mo] = ocrMonth.split('-').map(Number);
    const nd2 = new Date(Date.UTC(y, mo, 1));   // 다음 달 1일 — '…-31' 하드코딩은 30일·2월에 무효날짜라 쿼리 에러
    const nextStart2 = `${nd2.getUTCFullYear()}-${String(nd2.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const { data: existing } = await supabase.from('meal_logs').select('log_date,slot,source')
      .eq('child_id', childId).gte('log_date', `${ocrMonth}-01`).lt('log_date', nextStart2);
    const taken = new Set((existing || []).filter((r: { source: string | null }) => r.source !== 'daycare_menu')
      .map((r: { log_date: string; slot: string }) => `${r.log_date}|${r.slot}`));   // 부모 입력 보호
    const byKey: Record<string, { log_date: string; slot: string; menus: string[]; ings: Set<string> }> = {};
    ocrItems.forEach((it) => {
      const d = parseInt(it.date); if (!d || d < 1 || d > 31) return;
      const log_date = `${y}-${mo}-${String(d).padStart(2, '0')}`;
      const slot = OCR_SLOT[it.slot] || 'lunch';
      const key = `${log_date}|${slot}`;
      if (taken.has(key)) return;
      const e = (byKey[key] = byKey[key] || { log_date, slot, menus: [], ings: new Set<string>() });
      if (it.menu) e.menus.push(it.menu);
      // OCR은 메뉴명만 추출 — 식재료는 클라 전역 매퍼로 즉시 채우고(흔한 메뉴), 미매핑은 야간 백필 크론이 LLM으로 보강.
      const localIngs = (it.ingredients && it.ingredients.length) ? it.ingredients : (mapper.mapMenu(it.menu || '')?.ingredients || []);
      localIngs.forEach((i) => { const n = normalizeIngredient(i); if (n) e.ings.add(n); });
    });
    // ⭐ 미래 날짜 차단(이사님 2026-06-13) — 식단표는 한 달치지만 '오늘까지'만 기록으로 입력한다.
    //   미래 끼니를 미리 넣으면 어드민 스레드·통계에 안 먹은 미래가 섞인다(아린 6/15~30 36행 실증).
    const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const all = Object.values(byKey);
    const skippedFuture = all.filter((v) => v.log_date > todayKst).length;
    const rows = all.filter((v) => v.log_date <= todayKst).map((v) => ({
      child_id: childId, parent_id: userId, log_date: v.log_date, slot: v.slot,
      menus: v.menus, ingredients: [...v.ings], place: 'daycare', source: 'daycare_menu', updated_at: new Date().toISOString(),
    }));
    if (skippedFuture && !rows.length) {
      setPointToast(`식단표 인식 완료 — 아직 오지 않은 날짜(${skippedFuture}끼)는 기록하지 않아요. 지난 날짜가 있는 달만 적립돼요.`);
      setOcrOpen(false);
      return;
    }
    if (rows.length) {
      await supabase.from('meal_logs').upsert(rows, { onConflict: 'child_id,log_date,slot' });
      setMenuMonths((prev) => new Set([...prev, ocrMonth]));   // 등록 즉시 업로더 숨김
      setOcrOpen(false);
      // 식단표 끼니마다 +50P + 업로드 보너스 +1,000P(자녀·월 1회 멱등). 서버가 중복/한도 처리.
      if (userId && childId) {
        const bonusP = fetch('/api/points/bonus', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ child_id: childId, kind: 'daycare_menu', month: ocrMonth }),
        }).then((r) => r.json()).then((d) => Number(d?.earned) || 0).catch(() => 0);
        const mealsP = Promise.allSettled(rows.map((r) => fetch('/api/points/earn', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ child_id: childId, date: r.log_date, slot: r.slot }),
        }))).then((res) => { let e = 0; res.forEach((x) => { if (x.status === 'fulfilled') e += 50; }); return e; });   // 낙관 추정(중복/한도는 서버가 0)
        Promise.all([bonusP, mealsP]).then(([bonus, meals]) => {
          const total = bonus + meals;
          if (total > 0) setPointToast(`식단표 등록 · 최대 +${total.toLocaleString()}P 적립! 🎉${bonus > 0 ? ` (업로드 보너스 +${bonus.toLocaleString()}P)` : ''}`);
        });
      }
    }
    if (!daycare) saveDaycare(true);
    setOcrMsg(`✓ ${rows.length}끼 저장 · 끼니마다 포인트가 쌓여요`); setOcrItems([]);
  }

  async function saveEntry() {
    // 세션 흔들림 방어 — userId가 잠깐 비어도(로그인인데 상태 미반영) DB 대신 guest로 새지 않게 저장 직전 재확인
    let uid = userId;
    if (!uid) { const { data: { user } } = await supabase.auth.getUser(); uid = user?.id || null; if (uid) setUserId(uid); }

    // 남긴 음식(refused)이 '들어간 식재료'에 없으면 자동 추가 — 부모가 실수로 빼먹었을 수 있음.
    // 단 문장(공백 포함·과길이)은 식재료가 아니므로 추가하지 않는다(다른 입력창 오입력 방지).
    let e = entry;
    if (entry.refused?.trim()) {
      const refItems = [...new Set(
        entry.refused.split(/[,，·]/).map((s) => s.trim())
          .filter((s) => s && !/\s/.test(s) && s.length <= 8)   // 단어 1개·짧음 = 식재료. 문장은 제외
          .map((s) => normalizeIngredient(s)).filter(Boolean),
      )];
      const have = new Set(entry.ingredients.map((t) => t.name));
      const add = refItems.filter((nm) => !have.has(nm)).map((nm) => ({ name: nm, ai: true }));
      if (add.length) { e = { ...entry, ingredients: [...entry.ingredients, ...add] }; setEntry(e); }
    }
    const next = { ...logs };
    if (!next[date]) next[date] = {};
    next[date][activeSlot] = e;
    setLogs(next);
    if (!uid) saveCareLogs(next, null);   // 비로그인(guest)만 디스크 캐시 — 로그인은 메모리(setLogs)+server가 진실(아래 upsert)

    // 로그인 + 자녀 있으면 Supabase 동기화 — 저장 중 진행바 노출(서버 왕복 동안)
    if (uid && childId) {
      setSaving(true);
      const { error } = await supabase.from('meal_logs')
        .upsert(entryToRow(e, childId, uid, date, activeSlot), { onConflict: 'child_id,log_date,slot' });
      if (error) console.warn('[care] save error:', error.message);
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      // 끼니에 내용 있으면 포인트 적립(서버가 멱등·일일5끼 한도 처리 — 같은 끼니 재저장은 적립 0)
      if (e.menus?.length || e.ingredients?.length) {
        fetch('/api/points/earn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ child_id: childId, date, slot: activeSlot }) })
          .then((r) => r.json()).then((d) => {
            if (d?.ok && d.earned > 0) { setPointToast(`+${d.earned}P 적립! 🎉`); setTimeout(() => setPointToast(''), 2200); }
          }).catch(() => {});
      }
    } else {
      setSaved(true);   // 비로그인 = 즉시
      setTimeout(() => setSaved(false), 1500);
    }
  }

  // 최근 7일 날짜 칩 — KST 기준(kstToday/todayStr과 동일 앵커).
  // new Date().toISOString()은 항상 UTC라, 새벽 0~9시 KST엔 '오늘'이 띠에서 누락돼
  // 오늘 끼니를 선택조차 못 하던 버그가 있었다 → kstDateNDaysAgo로 통일.
  const recentDates = Array.from({ length: 7 }, (_, i) => kstDateNDaysAgo(i)).reverse();

  // 오늘 기록된 슬롯 수
  const todayLog = logs[date] || {};
  const filledSlots = SLOTS.filter((s) => (todayLog[s.key]?.menus?.length || todayLog[s.key]?.ingredients?.length)).length;

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      {/* 헤더 */}
      <header className="px-5 pt-6 pb-3 border-b" style={{ borderColor: '#FFE8D0' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold" style={{ color: '#1a2b4a' }}>식사 기록</h1>
          <div className="flex items-center gap-2">
            <a href="/care/calendar" className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#F0FAF6', color: '#16A085', border: '1px solid #C8E6C9' }}>📅 달력</a>
            <div className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#FFF5EB', color: '#C45A00' }}>
              오늘 {filledSlots}/6 끼
            </div>
            {!userId && <LoginCta />}
          </div>
        </div>
        <p className="text-xs mt-1" style={{ color: '#8a7a6a' }}>편식 교정의 핵심은 소량 반복 노출 30번이에요</p>
      </header>

      {/* 비로그인 안내 배너 */}
      {!userId && (
        <a href="/signup" className="block mx-5 mt-3 px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2"
          style={{ background: '#FFF5EB', color: '#C45A00', border: '1px solid #FFD0A0' }}>
          <span>🔒</span>
          <span className="flex-1">지금은 이 기기에만 저장돼요. <strong>카카오 로그인</strong>하면 어디서든 기록·진단 →</span>
        </a>
      )}

      {/* 날짜 선택 */}
      <div className="px-5 py-3">
        <div className="grid grid-cols-7 gap-1">
          {recentDates.map((d) => {
            // d는 KST 'YYYY-MM-DD' 문자열 — 요일/일자는 브라우저 TZ에 안 흔들리게 문자열에서 직접.
            const wdIdx = new Date(d + 'T00:00:00Z').getUTCDay();
            const dayNum = Number(d.slice(8, 10));
            const isToday = d === todayStr();
            const has = (logs[d] && Object.keys(logs[d]).length > 0);
            const active = d === date;
            return (
              <button key={d} onClick={() => setDate(d)}
                className="rounded-lg py-2 text-center transition relative"
                style={{
                  background: active ? '#FF6B1A' : '#FAFAF7',
                  color: active ? 'white' : '#6B7280',
                  border: `1.5px solid ${active ? '#FF6B1A' : '#E5E7EB'}`,
                }}>
                <div className="text-[9px] font-semibold opacity-70">{['일','월','화','수','목','금','토'][wdIdx]}</div>
                <div className="text-sm font-extrabold">{dayNum}</div>
                {has && !active && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: '#16A085' }} />}
                {isToday && <div className="text-[8px] opacity-70">오늘</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 슬롯 선택 */}
      <div className="px-5 pb-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {SLOTS.map((s) => {
            const filled = ((todayLog[s.key]?.menus?.length || 0) + (todayLog[s.key]?.ingredients?.length || 0)) > 0;
            const active = s.key === activeSlot;
            return (
              <button key={s.key} onClick={() => setActiveSlot(s.key)}
                className="flex-shrink-0 rounded-xl px-3 py-2 text-center transition"
                style={{
                  background: active ? '#1a2b4a' : filled ? '#E8F5E9' : '#FAFAF7',
                  border: `1.5px solid ${active ? '#1a2b4a' : filled ? '#16A085' : '#E5E7EB'}`,
                }}>
                <div className="text-lg leading-none">{s.emoji}</div>
                <div className="text-[10px] font-extrabold mt-0.5" style={{ color: active ? 'white' : filled ? '#1B5E20' : '#6B7280' }}>
                  {s.label}{filled && !active ? ' ✓' : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 입력 영역 */}
      <div className="flex-1 px-5 py-3 overflow-y-auto">
        {/* 체위 기록 (키·몸무게 시계열 — 언제든) */}
        {userId && (
          <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
            <button onClick={() => setGOpen((o) => !o)} className="w-full flex items-center justify-between">
              <h3 className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>📏 키·몸무게 기록</h3>
              <span className="text-[11px] font-bold" style={{ color: '#8a7a6a' }}>
                {growthLatest ? `${growthLatest.height_cm ?? '-'}cm · ${growthLatest.weight_kg ?? '-'}kg (${growthLatest.measured_on.slice(5)}) ▾` : '기록 추가 ▾'}
              </span>
            </button>
            {/* 2주 nudge — 마지막 체위 기록이 14일 넘었거나 없으면 부드럽게 업데이트 권유(성장은 2주 단위로 의미 있는 변화) */}
            {!gOpen && (!growthLatest || growthLatest.measured_on < kstDateNDaysAgo(14)) && (
              <button onClick={() => setGOpen(true)} className="mt-2.5 w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left" style={{ background: '#FFF7ED', border: '1px solid #FFD9B8' }}>
                <span className="text-base">📏</span>
                <span className="text-[11px] font-semibold leading-snug" style={{ color: '#C45A00' }}>
                  {growthLatest ? <>마지막 기록이 <strong>2주</strong> 넘었어요. 키·몸무게는 2주마다 업데이트하면 성장 추이를 더 정확히 볼 수 있어요 →</> : <>아직 키·몸무게 기록이 없어요. 한 번 넣어두면 <strong>BMI·또래 성장 추이</strong>를 봐드릴게요 →</>}
                </span>
              </button>
            )}
            {gOpen && (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input value={gH} onChange={(e) => setGH(e.target.value)} inputMode="decimal" placeholder="키 cm"
                    className="px-3 py-2.5 rounded-lg text-sm outline-none" style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB' }} />
                  <input value={gW} onChange={(e) => setGW(e.target.value)} inputMode="decimal" placeholder="몸무게 kg"
                    className="px-3 py-2.5 rounded-lg text-sm outline-none" style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB' }} />
                </div>
                <div className="text-[11px] mb-1.5" style={{ color: '#8a7a6a' }}>성별 <span style={{ color: '#9CA3AF' }}>(BMI 또래 비교용 · 1회)</span></div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {[{ v: 'M', l: '👦 남아' }, { v: 'F', l: '👧 여아' }].map((o) => (
                    <button key={o.v} onClick={() => saveSex(o.v as 'M' | 'F')} className="rounded-lg py-2 text-sm font-bold transition"
                      style={{ background: sex === o.v ? '#1a2b4a' : '#FAFAF7', color: sex === o.v ? 'white' : '#6B7280', border: `1.5px solid ${sex === o.v ? '#1a2b4a' : '#E5E7EB'}` }}>{o.l}</button>
                  ))}
                </div>
                <button onClick={saveGrowth} className="w-full py-2.5 rounded-lg text-sm font-extrabold text-white" style={{ background: gSaved ? '#16A085' : '#FF6B1A' }}>
                  {gSaved ? '✓ 저장됐어요' : '오늘 체위 저장'}
                </button>
                <p className="text-[10px] mt-1.5" style={{ color: '#9CA3AF' }}>홈 36종 모달의 BMI·또래 퍼센타일에 반영돼요 (WHO 성장도표 기준)</p>
              </div>
            )}
          </div>
        )}

        {/* 등원 여부 — 평일 점심·간식은 기관 끼니로 코칭이 판단 (코칭엔진 스펙 §3) */}
        {userId && (
          <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
            <div>
              <h3 className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>🏫 어린이집·유치원</h3>
              <p className="text-[10.5px] mt-0.5" style={{ color: '#8a7a6a' }}>다니는 기관을 등록하면 평일 점심·간식을 기관 끼니로 봐드려요 (집 아침·저녁에 코칭 집중)</p>
            </div>
            {/* ⭐ 기관 등록 — 등록=등원(daycare ON). 별도 '다녀요' 토글 없이 등록으로 일원화 */}
            {childId && <InstitutionSelect childId={childId} onChange={(inst) => setInstType(inst?.type ?? null)} />}
            {/* 식단표 OCR 자동채움 — 점심·간식 매일 기록 안 해도 됨. 이번 달 등록됐으면 업로더 숨김 */}
            <div className="mt-3 pt-3" style={{ borderTop: '1px dashed #FFE8D0' }}>
              {menuMonths.has(new Date().toISOString().slice(0, 7)) ? (
                <div className="text-[11.5px] font-bold" style={{ color: '#16A085' }}>✓ 이번 달 식단표가 등록돼 있어요 — 점심·간식은 자동으로 채워져요</div>
              ) : (
                <button onClick={() => setOcrOpen((o) => !o)} className="text-[12px] font-extrabold" style={{ color: '#C45A00' }}>📋 이번 달 식단표 올리기 {ocrOpen ? '▾' : '▸'}</button>
              )}
              {ocrOpen && !menuMonths.has(new Date().toISOString().slice(0, 7)) && (
                <div className="mt-2.5">
                  <p className="text-[10.5px] mb-2" style={{ color: '#8a7a6a' }}>월간 식단표 사진을 올리면 점심·간식을 자동으로 채워요 — 매일 기록 안 해도 돼요.</p>
                  <p className="text-[10px] mb-2" style={{ color: '#C45A00' }}>📐 글자가 바로 보이게 <b>똑바로(가로로 눕히지 말고)</b> 찍어 올려주세요 — 회전된 사진은 날짜가 어긋날 수 있어요.</p>
                  <div className="flex gap-2 items-center mb-2">
                    <input type="month" value={ocrMonth} onChange={(e) => setOcrMonth(e.target.value)} className="px-2 py-1.5 rounded-lg text-[12px] outline-none" style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB' }} />
                    <label className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white cursor-pointer" style={{ background: ocrBusy ? '#9CA3AF' : '#FF6B1A' }}>
                      {ocrBusy ? '인식 중…' : '📷 사진 선택'}
                      <input type="file" accept="image/*" disabled={ocrBusy} onChange={(e) => handleOcrFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                    </label>
                  </div>
                  {ocrBusy && (
                    <div className="mb-2">
                      <div className="flex justify-between text-[10.5px] font-extrabold mb-1" style={{ color: '#C45A00' }}>
                        <span>📷 식단표 읽는 중…</span><span>{ocrElapsed}s {ocrElapsed < 120 ? `/ 약 ${Math.max(5, 120 - ocrElapsed)}초` : '거의 다 됐어요'}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#FFE8D0' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(96, (ocrElapsed / 120) * 100)}%`, background: '#FF6B1A', transition: 'width 1s linear' }} />
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: '#9CA3AF' }}>한 달치라 1~2분 걸려요 — 창 닫지 말고 잠시만 기다려주세요 🙏</div>
                    </div>
                  )}
                  {ocrItems.length > 0 && (
                    <div className="rounded-lg p-2.5 mb-2" style={{ background: '#FAFAF7', border: '1px solid #E5E7EB' }}>
                      <div className="text-[11px] font-bold mb-1" style={{ color: '#1a2b4a' }}>{ocrMonth} · 인식된 메뉴 {ocrItems.length}개</div>
                      <div className="text-[10.5px] leading-relaxed" style={{ color: '#6B7280', maxHeight: 120, overflowY: 'auto' }}>
                        {ocrItems.slice(0, 12).map((it, i) => (<div key={i}>{it.date}일 · {it.slot} · {it.menu}</div>))}
                        {ocrItems.length > 12 && <div>…외 {ocrItems.length - 12}개</div>}
                      </div>
                      <button onClick={saveDaycareMenu} className="w-full mt-2 py-2 rounded-lg text-[12px] font-extrabold text-white" style={{ background: '#16A085' }}>{ocrMonth} 기관 급식으로 저장</button>
                    </div>
                  )}
                  {ocrMsg && <div className="text-[11px] font-bold" style={{ color: ocrMsg.startsWith('✓') ? '#16A085' : '#C62828' }}>{ocrMsg}</div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 0단계: 먹는 장소 (집/기관) — 정량은 전부 집계, 정성 코칭은 집 끼니·기관 거부에 포커스 */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>어디서 먹었나요?</h3>
            {hasPattern && !logs[date]?.[activeSlot] && (
              <span className="text-[10.5px] font-bold" style={{ color: '#16A085' }}>🔁 장소·시간만 미리 채움</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PLACE_OPTS.map((o) => {
              const on = entry.place === o.v;
              return (
                <button key={o.v} onClick={() => setEntry((x) => ({ ...x, place: o.v }))}
                  className="rounded-lg py-2.5 text-[13px] font-bold transition leading-tight"
                  style={{ background: on ? '#1a2b4a' : '#FAFAF7', color: on ? 'white' : '#6B7280', border: `1.5px solid ${on ? '#1a2b4a' : '#E5E7EB'}` }}>
                  {o.emoji} {o.v === 'daycare' ? (instType === 'kindergarten' ? '유치원' : instType === 'daycare' ? '어린이집' : '기관') : o.label}
                </button>
              );
            })}
          </div>
          {/* 몇 시쯤 먹었나요 — 대략 시간단위 (선택) */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold" style={{ color: '#8a7a6a' }}>🕐 몇 시쯤 먹었나요? <span style={{ color: '#9CA3AF' }}>(선택)</span></span>
            <select value={entry.mealTime ?? ''} onChange={(e) => setEntry((x) => ({ ...x, mealTime: e.target.value === '' ? null : Number(e.target.value) }))}
              className="px-3 py-1.5 rounded-lg text-sm outline-none font-semibold" style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB', color: '#1a2b4a' }}>
              <option value="">--시</option>
              {Array.from({ length: 18 }, (_, i) => i + 5).map((h) => (<option key={h} value={h}>{h <= 12 ? `오전 ${h}시`.replace('오전 12시', '낮 12시') : `오후 ${h - 12}시`}</option>))}
            </select>
          </div>
        </div>

        {/* 1단계: 메뉴명 입력 */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <h3 className="text-sm font-extrabold mb-1" style={{ color: '#1a2b4a' }}>뭘 먹었나요?</h3>
          <p className="text-[11px] mb-2.5" style={{ color: '#8a7a6a' }}>메뉴 이름만 적으면 AI가 식재료로 풀어드려요 (예: 야채볶음밥)</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {entry.menus.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: '#FFF5EB', color: '#C45A00', border: '1px solid #FFD0A0' }}>
                🍽 {m}
                <button onClick={() => removeMenu(m)} className="ml-0.5 opacity-60 hover:opacity-100">✕</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={menuInput} onChange={(e) => setMenuInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addMenu(menuInput); } }}
              placeholder="예: 소세지볶음, 미역국"
              className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB' }} />
            <button onClick={() => addMenu(menuInput)} disabled={parsing || !menuInput.trim()}
              className="px-4 rounded-lg text-sm font-bold text-white"
              style={{ background: parsing ? '#9CA3AF' : '#FF6B1A' }}>
              {parsing ? '...' : '추가'}
            </button>
          </div>
        </div>

        {/* 2단계: 식재료 태그 (AI 자동 + 직접 편집) */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>들어간 식재료</h3>
            {parsing && <span className="text-[10px] font-bold" style={{ color: '#FF6B1A' }}>✨ 분석 중...</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {entry.ingredients.map((t) => (
              <span key={t.name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white"
                style={{ background: t.ai ? '#5B8DEF' : '#16A085' }}>
                {t.ai && '✨'}{t.name}
                <button onClick={() => removeIngredient(t.name)} className="ml-0.5 opacity-70 hover:opacity-100">✕</button>
              </span>
            ))}
            {entry.ingredients.length === 0 && <span className="text-xs" style={{ color: '#9CA3AF' }}>메뉴를 추가하면 자동으로 채워져요</span>}
          </div>
          <div className="relative">
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && query.trim()) addIngredient(suggestions[0]?.nm || query.trim()); }}
              placeholder="+ 식재료 직접 추가 (예: 시금치)"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB' }} />
            {suggestions.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
                {suggestions.map((s) => (
                  <button key={s.nm} onClick={() => addIngredient(s.nm)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 flex items-center justify-between">
                    <span style={{ color: '#1a2b4a' }}>{s.nm}</span>
                    <span className="text-[10px]" style={{ color: '#9CA3AF' }}>
                      {s.cat.replace('_', '·')}{s.grade && ` · ${s.grade}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10px] mt-2" style={{ color: '#9CA3AF' }}>✨ 파란 태그 = AI 추정 · 초록 태그 = 직접 추가 · 틀리면 ✕로 빼세요</p>
        </div>

        {/* ICFQ 레드플래그 — 비알람·권유 (진단/장애 단어 없음, 2주 2신호+ 1회) */}
        {icfqFlag && (
          <div className="rounded-2xl p-4 mb-3" style={{ background: '#FFF8F0', border: '1.5px solid #FFD9A0' }}>
            <div className="text-[11px] font-extrabold mb-1" style={{ color: '#C45A00' }}>🤝 잠깐, 이런 경우엔</div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: '#5a4a3a' }}>최근 식사에서 신경 쓰이는 신호가 몇 가지 보였어요. 대부분 시간이 지나며 자연스럽게 나아지지만, 걱정되시면 <strong>소아과·영유아 검진 때 한 번 편하게 상의</strong>해보셔도 좋아요. 지금 잘 살피고 계세요.</div>
          </div>
        )}

        {/* 오늘의 질문 (AI 상담 — 하루 1개) — 답하면 사라짐 */}
        {date === todayStr() && dailyQ?.question && !dailyQ.answer && (
          <div className="rounded-2xl p-4 mb-3 shadow-sm" style={{ background: 'linear-gradient(135deg,#F3E5F5,#FCE4EC)', border: '1.5px solid #CE93D8' }}>
            <div className="text-[10.5px] font-extrabold mb-1.5" style={{ color: '#6A1B9A' }}>✨ 오늘의 질문 — 코치가 물어봐요</div>
            <div className="text-sm font-extrabold mb-2.5" style={{ color: '#1a2b4a' }}>{dailyQ.question}</div>
            {dailyQ.chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {dailyQ.chips.map((c) => (
                  <button key={c} onClick={() => answerDailyQ(c)}
                    className="text-xs font-bold px-3 py-1.5 rounded-full transition"
                    style={{ background: 'white', color: '#6A1B9A', border: '1.5px solid #CE93D8' }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            {/* 수동 입력 — 칩에 없는 답도 직접 */}
            <div className="flex items-center gap-1.5">
              <input value={qInput} onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') answerDailyQ(qInput); }}
                placeholder="직접 답을 적어도 돼요"
                className="flex-1 min-w-0 text-[13px] px-3 py-2 rounded-lg outline-none" style={{ background: 'white', border: '1.5px solid #CE93D8', color: '#1a2b4a' }} />
              <button onClick={() => answerDailyQ(qInput)} disabled={!qInput.trim()}
                className="text-xs font-extrabold px-3.5 py-2 rounded-lg text-white" style={{ background: qInput.trim() ? '#9C27B0' : '#D6BBDC' }}>보내기</button>
            </div>
          </div>
        )}
        {/* 오늘 질문에 답한 날엔 흔적을 남긴다(이번 세션이든 아침에 답했든) — 빈 화면이라 '질문 없었다'고 오해하던 것 해소 */}
        {date === todayStr() && dailyQ?.question && dailyQ?.answer && (
          <div className="rounded-2xl px-4 py-3 mb-3" style={{ background: '#F3E5F5', border: '1px solid #E1BEE7' }}>
            <div className="text-[10.5px] font-extrabold mb-1" style={{ color: '#6A1B9A' }}>✓ 오늘의 질문에 답하셨어요 — 코칭에 반영됩니다</div>
            <div className="text-[12.5px] font-bold" style={{ color: '#6A1B9A' }}>{dailyQ.question}</div>
            <div className="text-[12.5px] mt-0.5" style={{ color: '#8E5BA0' }}>→ {answeredNow ? '방금 ' : ''}“{dailyQ.answer}”</div>
          </div>
        )}

        {/* 자유 메모 (정성 기록) */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <h3 className="text-sm font-extrabold mb-2" style={{ color: '#1a2b4a' }}>{date === todayStr() ? '오늘 궁금한 점 있나요' : '그날 메모'} <span className="font-normal text-xs" style={{ color: '#9CA3AF' }}>(선택)</span></h3>
          <textarea value={entry.note} onChange={(e) => setEntry((x) => ({ ...x, note: e.target.value }))}
            rows={3} placeholder="예: 그날 배가 아팠어요 / 새로운 메뉴를 시도했어요 (거부 음식은 위에서 탭하세요)"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
            style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB', color: '#374151' }} />
        </div>

        {/* 얼마나 받아들였나요 — 수용 5단계(거부→만짐→한입→조금→완식). 이진 '잘먹음/보통/거부'보다 진전을 촘촘히 포착(한 입 시도도 발전). */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <h3 className="text-sm font-extrabold mb-1" style={{ color: '#1a2b4a' }}>얼마나 받아들였나요?</h3>
          <p className="text-[10.5px] mb-2" style={{ color: '#8a7a6a' }}>한 입 시도·만지작도 <strong>발전</strong>이에요 — 솔직히 골라주시면 받아들이는 속도에 맞춰 코칭해드려요</p>
          <div className="grid grid-cols-5 gap-1.5">
            {ACCEPT_LEVELS.map((o) => {
              const on = entry.acceptLevel === o.lvl;
              return (
                <button key={o.lvl} onClick={() => setEntry((x) => ({ ...x, acceptLevel: o.lvl, ateWell: levelToAteWell(o.lvl) }))}
                  className="rounded-lg py-2 flex flex-col items-center gap-0.5 transition"
                  style={{ background: on ? o.c : '#FAFAF7', border: `1.5px solid ${on ? o.c : '#E5E7EB'}` }}>
                  <span className="text-lg leading-none">{o.emoji}</span>
                  <span className="text-[11px] font-bold" style={{ color: on ? 'white' : '#6B7280' }}>{o.label}</span>
                  <span className="text-[8.5px] leading-tight" style={{ color: on ? 'rgba(255,255,255,0.9)' : '#B0A99F' }}>{o.desc}</span>
                </button>
              );
            })}
          </div>

          {/* 거부·만짐·한입(level≤2 = 사실상 안 먹음) 시 남긴 음식 입력 — 거부→수용 전환 포착 */}
          {(entry.acceptLevel != null && entry.acceptLevel <= 2) && (
            <div className="mt-3 p-3 rounded-lg" style={{ background: entry.acceptLevel === 0 ? '#FFF5F5' : '#FAFAF7', border: `1.5px solid ${entry.acceptLevel === 0 ? '#FFCDD2' : '#E5E7EB'}` }}>
              <label className="text-xs font-bold block mb-1.5" style={{ color: entry.acceptLevel === 0 ? '#C62828' : '#6B7280' }}>
                {entry.acceptLevel === 0 ? '어떤 음식을 거부했나요? (탭)' : '어떤 음식을 남겼나요? (탭 · 선택)'}
              </label>
              <p className="text-[10.5px] mb-2" style={{ color: '#8a7a6a' }}>
                남긴·거부한 음식을 <strong>탭</strong>하세요 — 그 식재료에 천천히 친해지는 코스를 추천하고 <strong>받아들이는 순간</strong>까지 추적해드려요
              </p>
              {/* ⭐ 자유 텍스트 폐지 → 이 끼니에 적은 음식 중에서 '탭'으로만 선택(메모가 거부 음식으로 오인되는 근본원인 차단). 메모는 위 '오늘 궁금한 점' 칸으로. */}
              {(() => {
                const foods = [...new Set([...entry.menus, ...entry.ingredients.map((t) => t.name)])].filter(Boolean);
                const sel = new Set(entry.refused.split(/[,，·]/).map((s) => s.trim()).filter(Boolean));
                const toggle = (f: string) => { const n = new Set(sel); if (n.has(f)) n.delete(f); else n.add(f); setEntry((x) => ({ ...x, refused: [...n].join(', ') })); };
                return foods.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {foods.map((f) => { const on = sel.has(f); return (
                      <button key={f} onClick={() => toggle(f)} className="text-xs font-bold px-3 py-1.5 rounded-full transition"
                        style={{ background: on ? '#E53935' : 'white', color: on ? 'white' : '#6B7280', border: `1.5px solid ${on ? '#E53935' : '#E5E7EB'}` }}>
                        {on ? '✕ ' : ''}{f}
                      </button>
                    ); })}
                  </div>
                ) : <p className="text-[11px]" style={{ color: '#9CA3AF' }}>먼저 위에 먹은 음식·식재료를 입력하면, 여기서 거부한 것을 고를 수 있어요</p>;
              })()}
            </div>
          )}
        </div>

        {/* 식감 단계 + 자율성 (선택 · 8축 진단 데이터) */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <h3 className="text-sm font-extrabold mb-1" style={{ color: '#1a2b4a' }}>씹기·자율성 <span className="font-normal text-xs" style={{ color: '#9CA3AF' }}>(선택 · 진단에 반영)</span></h3>
          <div className="text-[11px] mb-2" style={{ color: '#8a7a6a' }}>식감 단계</div>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[
              { v: 'puree', label: '🥣 죽·미음' },
              { v: 'mashed', label: '🥄 다진' },
              { v: 'finger', label: '🤏 핑거푸드' },
              { v: 'table', label: '🍽 일반식' },
            ].map((o) => (
              <button key={o.v} onClick={() => setEntry((x) => ({ ...x, texture: x.texture === o.v ? '' : o.v }))}
                className="rounded-lg py-2 text-[11px] font-bold transition"
                style={{
                  background: entry.texture === o.v ? '#1a2b4a' : '#FAFAF7',
                  color: entry.texture === o.v ? 'white' : '#6B7280',
                  border: `1.5px solid ${entry.texture === o.v ? '#1a2b4a' : '#E5E7EB'}`,
                }}>{o.label}</button>
            ))}
          </div>
          <div className="text-[11px] mb-2" style={{ color: '#8a7a6a' }}>누가 먹였나요?</div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { v: 'fed', label: '🤱 떠먹여줌' },
              { v: 'helped', label: '🍼 도와줌' },
              { v: 'self', label: '🙋 스스로' },
            ].map((o) => (
              <button key={o.v} onClick={() => setEntry((x) => ({ ...x, autonomy: x.autonomy === o.v ? '' : o.v }))}
                className="rounded-lg py-2 text-[11px] font-bold transition"
                style={{
                  background: entry.autonomy === o.v ? '#16A085' : '#FAFAF7',
                  color: entry.autonomy === o.v ? 'white' : '#6B7280',
                  border: `1.5px solid ${entry.autonomy === o.v ? '#16A085' : '#E5E7EB'}`,
                }}>{o.label}</button>
            ))}
          </div>
        </div>

        {/* 식사 환경 + 시간 (Satter — 진단 반영) */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <h3 className="text-sm font-extrabold mb-1" style={{ color: '#1a2b4a' }}>식사 환경 <span className="font-normal text-xs" style={{ color: '#9CA3AF' }}>(선택 · 진단에 반영)</span></h3>
          <div className="text-[11px] mb-2" style={{ color: '#8a7a6a' }}>어떻게 먹었나요?</div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {[
              { v: 'table', label: '🪑 식탁에 앉아서', good: true },
              { v: 'screen', label: '📱 영상·태블릿 보며', good: false },
              { v: 'roaming', label: '🏃 돌아다니며', good: false },
              { v: 'play', label: '🧸 놀이하며', good: false },
            ].map((o) => {
              const on = entry.environment === o.v;
              const onColor = o.good ? '#16A085' : '#E67E22';
              return (
                <button key={o.v} onClick={() => setEntry((x) => ({ ...x, environment: x.environment === o.v ? '' : o.v }))}
                  className="rounded-lg py-2 text-[11.5px] font-bold transition"
                  style={{ background: on ? onColor : '#FAFAF7', color: on ? 'white' : '#6B7280', border: `1.5px solid ${on ? onColor : '#E5E7EB'}` }}>{o.label}</button>
              );
            })}
          </div>
          {entry.environment === 'screen' && (
            <div className="text-[10.5px] mb-3 px-2.5 py-1.5 rounded-lg" style={{ background: '#FFF8E1', color: '#F57F17' }}>💡 영상 보며 먹으면 새 맛을 인지·학습하기 어려워요. 한 끼라도 화면 없이 시도해보세요.</div>
          )}
          <div className="text-[11px] mb-2" style={{ color: '#8a7a6a' }}>몇 분 만에 먹었나요?</div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { v: 10, label: '~10분' },
              { v: 15, label: '15분' },
              { v: 20, label: '20분' },
              { v: 30, label: '30분+' },
            ].map((o) => {
              const on = entry.durationMin === o.v;
              return (
                <button key={o.v} onClick={() => setEntry((x) => ({ ...x, durationMin: x.durationMin === o.v ? null : o.v }))}
                  className="rounded-lg py-2 text-[11px] font-bold transition"
                  style={{ background: on ? '#1a2b4a' : '#FAFAF7', color: on ? 'white' : '#6B7280', border: `1.5px solid ${on ? '#1a2b4a' : '#E5E7EB'}` }}>{o.label}</button>
              );
            })}
          </div>
          {entry.durationMin === 30 && (
            <div className="text-[10.5px] mt-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#FFF8E1', color: '#F57F17' }}>💡 식사가 30분 넘게 길어지면 집중이 흐려져요. 20분 안에 마무리가 권장돼요 (Satter).</div>
          )}
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="px-5 py-3 border-t bg-white" style={{ borderColor: '#FFE8D0' }}>
        <style>{`@keyframes careprog{0%{left:-40%}100%{left:100%}}`}</style>
        <button onClick={saveEntry} disabled={saving}
          className="w-full py-3.5 rounded-xl font-extrabold text-white text-sm transition relative overflow-hidden"
          style={{ background: saving ? '#C45A00' : saved ? '#16A085' : '#FF6B1A' }}>
          {saving && <span style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', background: 'rgba(255,255,255,0.28)', animation: 'careprog 0.9s linear infinite' }} />}
          <span className="relative">{saving ? '저장 중…' : saved ? '✓ 저장됐어요' : `${SLOTS.find((s) => s.key === activeSlot)?.label} 기록 저장`}</span>
        </button>
        <button onClick={() => { window.location.href = '/foods'; }}
          className="w-full mt-2 py-2 text-xs font-semibold" style={{ color: '#8a7a6a' }}>
          기록 없이 둘러보기 →
        </button>
      </div>

      {pointToast && (
        <div style={{ position: 'fixed', bottom: 78, left: '50%', transform: 'translateX(-50%)', background: '#1B5E20', color: 'white', padding: '10px 20px', borderRadius: 100, fontSize: 14, fontWeight: 800, zIndex: 60, boxShadow: '0 4px 16px rgba(0,0,0,0.22)' }}>{pointToast}</div>
      )}
      <BottomNav active="/care" />
    </main>
  );
}
