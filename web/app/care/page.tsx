/**
 * /care — 식사 기록 PWA (M5)
 *
 * 6 슬롯(아침·오전간식·점심·오후간식·저녁·야간) × 식재료 해시태그 + 메모 + 사진.
 * 로그인 전: localStorage mock 저장 (골격 검증용).
 * 로그인 후(M4 연동): Supabase meal_logs 테이블 저장.
 */
'use client';
import { useState, useEffect, useRef } from 'react';
import BottomNav from '@/components/BottomNav';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { normalizeIngredient } from '@/lib/lexicon';

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
type MealEntry = { menus: string[]; ingredients: Tag[]; note: string; ateWell: boolean | null; refused: string; texture: string; autonomy: string; environment: string; durationMin: number | null; mealTime: number | null; reaction: string };
type DayLog = Record<string, MealEntry>;
const MEAL_PARSE_API = 'https://app.mealfred.com/api/meal/parse';

const STORAGE_KEY = 'mealfred_care_logs';
const todayStr = () => new Date().toISOString().slice(0, 10);

function loadLogs(): Record<string, DayLog> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveLogs(logs: Record<string, DayLog>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

// Supabase row ↔ MealEntry 변환
type MealRow = { log_date: string; slot: string; menus: string[] | null; ingredients: string[] | null; note: string | null; ate_well: boolean | null; refused: string | null; texture: string | null; autonomy: string | null; environment: string | null; duration_min: number | null; meal_time: number | null; reaction: string | null };
function rowToEntry(r: MealRow): MealEntry {
  return {
    menus: r.menus || [],
    ingredients: (r.ingredients || []).map((name) => ({ name, ai: false })),
    note: r.note || '',
    ateWell: r.ate_well,
    refused: r.refused || '',
    texture: r.texture || '',
    autonomy: r.autonomy || '',
    environment: r.environment || '',
    durationMin: r.duration_min ?? null,
    mealTime: r.meal_time ?? null,
    reaction: r.reaction || '',
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
    ate_well: e.ateWell,
    texture: e.texture || null,
    autonomy: e.autonomy || null,
    environment: e.environment || null,
    duration_min: e.durationMin,
    meal_time: e.mealTime,
    reaction: e.reaction || null,
    updated_at: new Date().toISOString(),
  };
}

export default function CarePage() {
  const [pool, setPool] = useState<Ingredient[]>([]);
  const [date, setDate] = useState(todayStr());
  const [activeSlot, setActiveSlot] = useState<string>('breakfast');
  const [entry, setEntry] = useState<MealEntry>({ menus: [], ingredients: [], note: '', ateWell: null, refused: '', texture: '', autonomy: '', environment: '', durationMin: null, mealTime: null, reaction: '' });
  const [menuInput, setMenuInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [query, setQuery] = useState('');
  const [logs, setLogs] = useState<Record<string, DayLog>>({});
  const [saved, setSaved] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [dailyQ, setDailyQ] = useState<{ question: string; chips: string[]; answer: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createSupabaseBrowser();

  // 식재료 풀 로드 + localStorage 우선 표시
  useEffect(() => {
    fetch('/ingredients-light.json')
      .then((r) => r.json())
      .then((d) => setPool(d.ingredients))
      .catch(() => {});
    setLogs(loadLogs());
  }, []);

  // 로그인 감지 → 자녀 조회 → Supabase 기록 로드 + localStorage 동기화
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;  // 비로그인: localStorage mock 유지
      setUserId(user.id);

      const { data: child } = await supabase.from('children')
        .select('id').eq('parent_id', user.id).limit(1).maybeSingle();
      if (!child) return;  // 자녀 없음 (onboarding 필요)
      setChildId(child.id);

      // Supabase에서 기존 기록 로드
      const { data: rows } = await supabase.from('meal_logs')
        .select('log_date,slot,menus,ingredients,note,ate_well,refused,texture,autonomy,environment,duration_min,meal_time,reaction')
        .eq('child_id', child.id);

      const cloud: Record<string, DayLog> = {};
      (rows || []).forEach((r: MealRow) => {
        if (!cloud[r.log_date]) cloud[r.log_date] = {};
        cloud[r.log_date][r.slot] = rowToEntry(r);
      });

      // localStorage에만 있는 기록 → Supabase로 1회 동기화 (클라우드 우선)
      const local = loadLogs();
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

      setLogs(cloud);

      // 오늘의 질문 — 있으면 read, 없으면 LLM 생성·캐싱 (식사 기록 = 상담 창구)
      const today = todayStr();
      const { data: q } = await supabase.from('daily_questions')
        .select('question,chips,answer').eq('child_id', child.id).eq('q_date', today).maybeSingle();
      if (q?.question) {
        setDailyQ({ question: q.question, chips: q.chips || [], answer: q.answer || '' });
      } else {
        // 최근 식재료·거부·지난 Q&A 수집
        const recentIng: string[] = []; const recentRef: string[] = [];
        Object.values(cloud).forEach((day) => Object.values(day).forEach((e) => {
          e.ingredients.forEach((t) => recentIng.push(t.name));
          if (e.refused) recentRef.push(e.refused);
        }));
        const { data: pastQ } = await supabase.from('daily_questions')
          .select('question,answer').eq('child_id', child.id).neq('q_date', today)
          .order('q_date', { ascending: false }).limit(5);
        const pastQA = (pastQ || []).map((p: { question: string; answer: string | null }) => ({ q: p.question, a: p.answer || '' }));
        const childData = await supabase.from('children').select('age_band').eq('id', child.id).maybeSingle();
        const r = await fetch('https://app.mealfred.com/api/coach/question', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            childName: '', ageBand: childData.data?.age_band,
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

  // 오늘의 질문 답변 저장
  async function answerDailyQ(ans: string) {
    setDailyQ((q) => (q ? { ...q, answer: ans } : q));
    if (userId && childId) {
      await supabase.from('daily_questions').update({ answer: ans, answered_at: new Date().toISOString() })
        .eq('child_id', childId).eq('q_date', todayStr());
    }
  }

  // 슬롯·날짜 바뀌면 기존 기록 불러오기
  useEffect(() => {
    const dayLog = logs[date] || {};
    setEntry(dayLog[activeSlot] || { menus: [], ingredients: [], note: '', ateWell: null, refused: '', texture: '', autonomy: '', environment: '', durationMin: null, mealTime: null, reaction: '' });
  }, [date, activeSlot, logs]);

  const hasName = (nm: string) => entry.ingredients.some((t) => t.name === nm);

  // 메뉴명 입력 → (사용자 커스텀 우선) → AI 분해 → 식재료 태그 자동 추가
  async function addMenu(menu: string) {
    const m = menu.trim();
    if (!m) return;
    const key = m.replace(/\s/g, '');
    setMenuInput('');
    setEntry((e) => ({ ...e, menus: [...e.menus, m] }));
    setParsing(true);
    try {
      const EXCLUDE = ['물', '육수', '소금', '간장', '설탕', '식용유', '참기름'];
      let ingredients: string[] = [];

      // 1) 사용자 커스텀 override 우선
      if (userId) {
        const { data: ov } = await supabase.from('user_menu_overrides')
          .select('ingredients').eq('parent_id', userId).eq('menu', key).maybeSingle();
        if (ov?.ingredients?.length) ingredients = ov.ingredients;
      }
      // 2) 없으면 AI 분해
      if (!ingredients.length) {
        const resp = await fetch(MEAL_PARSE_API, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ menu: m }),
        });
        const data = await resp.json();
        ingredients = (data.ingredients || []).filter((nm: string) => !EXCLUDE.includes(nm));
      }
      const newTags: Tag[] = [...new Set(ingredients.map(normalizeIngredient).filter(Boolean))]
        .filter((nm) => !hasName(nm))
        .map((nm) => ({ name: nm, ai: true, fromMenu: key }));
      setEntry((e) => ({ ...e, ingredients: [...e.ingredients, ...newTags.filter((t) => !e.ingredients.some((x) => x.name === t.name))] }));
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
    await supabase.from('user_menu_overrides').upsert(
      { parent_id: userId, menu: menuKey, ingredients: names, updated_at: new Date().toISOString() },
      { onConflict: 'parent_id,menu' }
    ).then(({ error }) => { if (error) console.warn('[override] save:', error.message); });
  }

  function addIngredient(raw: string) {
    const nm = normalizeIngredient(raw);   // 소세지→소시지, 멥쌀→쌀 등 대표어로 정규화 후 저장
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

  async function saveEntry() {
    const next = { ...logs };
    if (!next[date]) next[date] = {};
    next[date][activeSlot] = entry;
    setLogs(next);
    saveLogs(next);              // localStorage (오프라인 캐시)
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);

    // 로그인 + 자녀 있으면 Supabase 동기화
    if (userId && childId) {
      await supabase.from('meal_logs')
        .upsert(entryToRow(entry, childId, userId, date, activeSlot), { onConflict: 'child_id,log_date,slot' })
        .then(({ error }) => { if (error) console.warn('[care] save error:', error.message); });
    }
  }

  // 최근 7일 날짜 칩
  const recentDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  }).reverse();

  // 오늘 기록된 슬롯 수
  const todayLog = logs[date] || {};
  const filledSlots = SLOTS.filter((s) => (todayLog[s.key]?.menus?.length || todayLog[s.key]?.ingredients?.length)).length;

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col" style={{ background: '#FFFDFB' }}>
      {/* 헤더 */}
      <header className="px-5 pt-6 pb-3 border-b" style={{ borderColor: '#FFE8D0' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold" style={{ color: '#1a2b4a' }}>식사 기록</h1>
          <div className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#FFF5EB', color: '#C45A00' }}>
            오늘 {filledSlots}/6 끼
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
            const dd = new Date(d);
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
                <div className="text-[9px] font-semibold opacity-70">{['일','월','화','수','목','금','토'][dd.getDay()]}</div>
                <div className="text-sm font-extrabold">{dd.getDate()}</div>
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

        {/* 오늘의 질문 (AI 상담 — 하루 1개 캐싱) */}
        {dailyQ?.question && (
          <div className="rounded-2xl p-4 mb-3 shadow-sm" style={{ background: 'linear-gradient(135deg,#F3E5F5,#FCE4EC)', border: '1.5px solid #CE93D8' }}>
            <div className="text-[10.5px] font-extrabold mb-1.5" style={{ color: '#6A1B9A' }}>✨ 오늘의 질문 — 코치가 물어봐요</div>
            <div className="text-sm font-extrabold mb-2.5" style={{ color: '#1a2b4a' }}>{dailyQ.question}</div>
            <div className="flex flex-wrap gap-1.5">
              {dailyQ.chips.map((c) => (
                <button key={c} onClick={() => answerDailyQ(c)}
                  className="text-xs font-bold px-3 py-1.5 rounded-full transition"
                  style={{ background: dailyQ.answer === c ? '#9C27B0' : 'white', color: dailyQ.answer === c ? 'white' : '#6A1B9A', border: `1.5px solid ${dailyQ.answer === c ? '#9C27B0' : '#CE93D8'}` }}>
                  {c}
                </button>
              ))}
            </div>
            {dailyQ.answer && <div className="text-[10.5px] mt-2 font-bold" style={{ color: '#6A1B9A' }}>✓ 답변 기록됐어요 — 코칭에 반영됩니다</div>}
          </div>
        )}

        {/* 자유 메모 (정성 기록) */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <h3 className="text-sm font-extrabold mb-2" style={{ color: '#1a2b4a' }}>오늘 어땠나요? <span className="font-normal text-xs" style={{ color: '#9CA3AF' }}>(선택)</span></h3>
          <textarea value={entry.note} onChange={(e) => setEntry((x) => ({ ...x, note: e.target.value }))}
            rows={3} placeholder="예: 브로콜리는 손도 안 댔지만 당근은 한 입 먹었어요"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
            style={{ background: '#FAFAF7', border: '1.5px solid #E5E7EB', color: '#374151' }} />
        </div>

        {/* 잘 먹었는지 */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <h3 className="text-sm font-extrabold mb-2" style={{ color: '#1a2b4a' }}>잘 먹었나요?</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: true, label: '😋 잘 먹음', c: '#16A085' },
              { v: null, label: '😐 보통', c: '#F9A825' },
              { v: false, label: '😣 거부', c: '#E53935' },
            ].map((o) => (
              <button key={String(o.v)} onClick={() => setEntry((x) => ({ ...x, ateWell: o.v }))}
                className="rounded-lg py-2.5 text-sm font-bold transition"
                style={{
                  background: entry.ateWell === o.v ? o.c : '#FAFAF7',
                  color: entry.ateWell === o.v ? 'white' : '#6B7280',
                  border: `1.5px solid ${entry.ateWell === o.v ? o.c : '#E5E7EB'}`,
                }}>
                {o.label}
              </button>
            ))}
          </div>

          {/* 거부 시 남긴 음식 입력 */}
          {entry.ateWell === false && (
            <div className="mt-3 p-3 rounded-lg" style={{ background: '#FFF5F5', border: '1.5px solid #FFCDD2' }}>
              <label className="text-xs font-bold block mb-1.5" style={{ color: '#C62828' }}>
                어떤 음식을 남겼나요?
              </label>
              <p className="text-[10.5px] mb-2" style={{ color: '#8a7a6a' }}>
                거부한 음식을 기록하면, 그 식재료에 천천히 친해지는 코스를 추천해드려요
              </p>
              <input value={entry.refused}
                onChange={(e) => setEntry((x) => ({ ...x, refused: e.target.value }))}
                placeholder="예: 브로콜리, 가지 (손도 안 댔어요)"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: 'white', border: '1.5px solid #FFCDD2', color: '#374151' }} />
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
        <button onClick={saveEntry}
          className="w-full py-3.5 rounded-xl font-extrabold text-white text-sm transition"
          style={{ background: saved ? '#16A085' : '#FF6B1A' }}>
          {saved ? '✓ 저장됐어요' : `${SLOTS.find((s) => s.key === activeSlot)?.label} 기록 저장`}
        </button>
        <button onClick={() => { window.location.href = '/foods'; }}
          className="w-full mt-2 py-2 text-xs font-semibold" style={{ color: '#8a7a6a' }}>
          기록 없이 둘러보기 →
        </button>
      </div>

      <BottomNav active="/care" />
    </main>
  );
}
