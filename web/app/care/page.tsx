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
type Tag = { name: string; ai?: boolean };  // ai=true면 AI가 메뉴에서 추정한 것
type MealEntry = { menus: string[]; ingredients: Tag[]; note: string; ateWell: boolean | null; refused: string };
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

export default function CarePage() {
  const [pool, setPool] = useState<Ingredient[]>([]);
  const [date, setDate] = useState(todayStr());
  const [activeSlot, setActiveSlot] = useState<string>('breakfast');
  const [entry, setEntry] = useState<MealEntry>({ menus: [], ingredients: [], note: '', ateWell: null, refused: '' });
  const [menuInput, setMenuInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [query, setQuery] = useState('');
  const [logs, setLogs] = useState<Record<string, DayLog>>({});
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 식재료 풀 로드
  useEffect(() => {
    fetch('/ingredients-light.json')
      .then((r) => r.json())
      .then((d) => setPool(d.ingredients))
      .catch(() => {});
    setLogs(loadLogs());
  }, []);

  // 슬롯·날짜 바뀌면 기존 기록 불러오기
  useEffect(() => {
    const dayLog = logs[date] || {};
    setEntry(dayLog[activeSlot] || { menus: [], ingredients: [], note: '', ateWell: null, refused: '' });
  }, [date, activeSlot, logs]);

  const hasName = (nm: string) => entry.ingredients.some((t) => t.name === nm);

  // 메뉴명 입력 → AI 분해 → 식재료 태그 자동 추가
  async function addMenu(menu: string) {
    const m = menu.trim();
    if (!m) return;
    setMenuInput('');
    setEntry((e) => ({ ...e, menus: [...e.menus, m] }));
    setParsing(true);
    try {
      const resp = await fetch(MEAL_PARSE_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ menu: m }),
      });
      const data = await resp.json();
      const newTags: Tag[] = (data.ingredients || [])
        .filter((nm: string) => !hasName(nm))
        .map((nm: string) => ({ name: nm, ai: true }));
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

  function addIngredient(nm: string) {
    if (!nm.trim() || hasName(nm)) return;
    setEntry((e) => ({ ...e, ingredients: [...e.ingredients, { name: nm, ai: false }] }));
    setQuery('');
    inputRef.current?.focus();
  }
  function removeIngredient(nm: string) {
    setEntry((e) => ({ ...e, ingredients: e.ingredients.filter((x) => x.name !== nm) }));
  }
  function removeMenu(menu: string) {
    setEntry((e) => ({ ...e, menus: e.menus.filter((x) => x !== menu) }));
  }

  function saveEntry() {
    const next = { ...logs };
    if (!next[date]) next[date] = {};
    next[date][activeSlot] = entry;
    setLogs(next);
    saveLogs(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMenu(menuInput); } }}
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
              onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) addIngredient(suggestions[0]?.nm || query.trim()); }}
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
