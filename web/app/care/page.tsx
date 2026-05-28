/**
 * /care — 식사 기록 PWA (M5)
 *
 * 6 슬롯(아침·오전간식·점심·오후간식·저녁·야간) × 식재료 해시태그 + 메모 + 사진.
 * 로그인 전: localStorage mock 저장 (골격 검증용).
 * 로그인 후(M4 연동): Supabase meal_logs 테이블 저장.
 */
'use client';
import { useState, useEffect, useRef } from 'react';

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
type MealEntry = { ingredients: string[]; note: string; ateWell: boolean | null };
type DayLog = Record<string, MealEntry>;

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
  const [entry, setEntry] = useState<MealEntry>({ ingredients: [], note: '', ateWell: null });
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
    setEntry(dayLog[activeSlot] || { ingredients: [], note: '', ateWell: null });
  }, [date, activeSlot, logs]);

  const suggestions = query.trim()
    ? pool.filter((p) => p.nm.includes(query.trim()) && !entry.ingredients.includes(p.nm)).slice(0, 8)
    : [];

  function addIngredient(nm: string) {
    if (!nm.trim() || entry.ingredients.includes(nm)) return;
    setEntry((e) => ({ ...e, ingredients: [...e.ingredients, nm] }));
    setQuery('');
    inputRef.current?.focus();
  }
  function removeIngredient(nm: string) {
    setEntry((e) => ({ ...e, ingredients: e.ingredients.filter((x) => x !== nm) }));
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
  const filledSlots = SLOTS.filter((s) => todayLog[s.key]?.ingredients.length).length;

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
            const filled = (todayLog[s.key]?.ingredients.length || 0) > 0;
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
        {/* 식재료 해시태그 */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <h3 className="text-sm font-extrabold mb-2" style={{ color: '#1a2b4a' }}>먹은 식재료</h3>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {entry.ingredients.map((nm) => (
              <span key={nm} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ background: '#16A085' }}>
                {nm}
                <button onClick={() => removeIngredient(nm)} className="ml-0.5 opacity-70 hover:opacity-100">✕</button>
              </span>
            ))}
            {entry.ingredients.length === 0 && <span className="text-xs" style={{ color: '#9CA3AF' }}>아래에서 검색해 추가하세요</span>}
          </div>
          <div className="relative">
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) addIngredient(suggestions[0]?.nm || query.trim()); }}
              placeholder="식재료 검색 (예: 시금치)"
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
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="px-5 py-3 border-t sticky bottom-0 bg-white" style={{ borderColor: '#FFE8D0' }}>
        <button onClick={saveEntry}
          className="w-full py-3.5 rounded-xl font-extrabold text-white text-sm transition"
          style={{ background: saved ? '#16A085' : '#FF6B1A' }}>
          {saved ? '✓ 저장됐어요' : `${SLOTS.find((s) => s.key === activeSlot)?.label} 기록 저장`}
        </button>
        <p className="text-[10px] text-center mt-2" style={{ color: '#9CA3AF' }}>
          현재 기기에 임시 저장됩니다 · 로그인 시 클라우드 동기화 (M4 연동 예정)
        </p>
      </div>
    </main>
  );
}
