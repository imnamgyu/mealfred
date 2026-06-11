/**
 * lib/coachFacts.ts — ⭐ 진단 사실 컴파일러 (2026-06-11, 이사님 승인 '1번').
 *
 * 편지가 말해도 되는 '사실 카드'를 코드가 전부 계산한다 — 각 사실에 시계열 추세 라벨
 * (단발 1회 / 간헐 2~3회 / 반복 4회+)을 붙여, LLM이 하루치 사건을 '리듬·패턴'으로
 * 일반화하거나(뷔페 사고) 데이터와 모순되게 단정하는('점심을 거른다') 것을 구조적으로 차단.
 * 추천 화이트리스트(bridgeFacts — 괴식 0 실적)의 진단 버전.
 *
 * 전부 meal_logs 기존 컬럼(log_date·slot·menus·refused·note·environment·place·ate_well)만
 * 사용 — 스키마 변경 0. 메모는 자르지 않고(2일 컷 철회) 날짜·시계열 라벨로 분류해 전달한다.
 */
import { cleanRefusal } from './coach';

export type FactRow = {
  log_date: string; slot: string | null; menus: string[] | null; refused: string | null;
  note: string | null; environment: string | null; place: string | null; ate_well: boolean | null;
};

const SLOT_KO: Record<string, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', am_snack: '오전 간식', pm_snack: '오후 간식', snack: '간식' };
const ENV_KO: Record<string, string> = { table: '식탁·화면 없음', screen: '화면 보며', roaming: '돌아다니며', play: '놀이하며' };

/** 시계열 추세 라벨 — 단발/간헐/반복. 모든 분석은 이 추세 판단을 거쳐야 한다(이사님 원칙). */
export function recurrenceLabel(count: number): string {
  return count <= 1 ? '단발 1회' : count <= 3 ? `간헐 ${count}회` : `반복 ${count}회`;
}

const EVENT_RE = /뷔페|외식|여행|파티|잔치|캠핑|행사/g;          // 단발성 이벤트 단어 — 패턴화 단골 오염원
const PARENT_RECUR_RE = /항상|매일|맨날|늘\s|자주/;               // 부모가 스스로 '반복'이라 표현한 메모

export function compileFacts(p: { rows: FactRow[]; today: string }): { cards: string[]; noteCards: string[]; forbidParts: string[] } {
  const { rows, today } = p;
  const todayMs = Date.parse(today);
  const age = (d: string) => Math.round((todayMs - Date.parse(d)) / 86400000);
  const ago = (d: string) => { const n = age(d); return n <= 1 ? '어제' : `${n}일 전`; };
  const cards: string[] = [];
  const forbidParts: string[] = [];
  const winDays = new Set(rows.map((r) => r.log_date)).size;

  // 1) 끼니 슬롯 커버리지(시계열) — '점심을 거른다'류 데이터 모순 단정의 일반화 차단
  const slotDays = (s: string) => new Set(rows.filter((r) => r.slot === s).map((r) => r.log_date));
  const bDays = slotDays('breakfast'); const lDays = slotDays('lunch'); const dDays = slotDays('dinner');
  const lunchRows = rows.filter((r) => r.slot === 'lunch');
  const lunchDc = lunchRows.filter((r) => r.place === 'daycare').length;
  if (lDays.size >= 3) {
    cards.push(lunchDc >= Math.ceil(lunchRows.length / 2)
      ? `점심: 최근 ${winDays}일 중 ${lDays.size}일 기록 — 평일은 어린이집·유치원 급식으로 먹음(결식 아님)`
      : `점심: 최근 ${winDays}일 중 ${lDays.size}일 기록(결식 아님)`);
    forbidParts.push('점심[^.。\\n]{0,12}(거르|건너|안\\s?먹|굶)');
  } else if (lDays.size > 0) cards.push(`점심: 최근 ${winDays}일 중 ${lDays.size}일만 기록`);
  if (bDays.size) {
    const bMenus = [...new Set(rows.filter((r) => r.slot === 'breakfast').flatMap((r) => r.menus || []))].slice(0, 4);
    cards.push(`아침: ${bDays.size}일 기록${bMenus.length ? ` — 최근 메뉴: ${bMenus.join('·')}` : ''}`);
  }
  if (dDays.size) cards.push(`저녁: ${dDays.size}일 기록`);

  // 2) 식사 환경 — 주간 시계열 + '어제'의 끼니별 사실(reinforce/observe가 인용할 단단한 근거)
  const envRows = rows.filter((r) => r.environment);
  if (envRows.length >= 3) {
    const bad = envRows.filter((r) => r.environment !== 'table').length;
    cards.push(`식사 환경: 기록 ${envRows.length}끼 중 화면·이동 식사 ${Math.round((bad / envRows.length) * 100)}% (${recurrenceLabel(bad)})`);
  }
  const yRows = rows.filter((r) => age(r.log_date) === 1 && r.environment && SLOT_KO[r.slot || '']);
  if (yRows.length) cards.push(`어제 끼니 환경: ${yRows.map((r) => `${SLOT_KO[r.slot || '']}(${ENV_KO[r.environment || ''] || r.environment})`).join(' · ')}`);

  // 3) 자주 오르는 음식(빈도) — '잘 먹는다/즐겨 먹는다' 주장의 유일한 근거
  const freq: Record<string, number> = {};
  rows.forEach((r) => { if (r.ate_well !== false) (r.menus || []).forEach((m) => { const t = m.trim(); if (t) freq[t] = (freq[t] || 0) + 1; }); });
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length) cards.push(`자주 오르는 음식: ${top.map(([m, c]) => `${m} ${c}회`).join(' · ')}`);

  // 4) 거부 — 항목별 횟수·마지막 날짜(단발/반복 구분 — '계속 거부'는 반복 라벨일 때만 가능)
  const refMap: Record<string, { c: number; last: string }> = {};
  rows.forEach((r) => { String(r.refused || '').split(/[,，·]/).forEach((tok) => {
    const k = cleanRefusal(tok);
    if (k) refMap[k] = { c: (refMap[k]?.c || 0) + 1, last: refMap[k] && refMap[k].last > r.log_date ? refMap[k].last : r.log_date };
  }); });
  Object.entries(refMap).slice(0, 5).forEach(([k, v]) => cards.push(`거부: ${k} — ${recurrenceLabel(v.c)}(마지막 ${ago(v.last)})`));

  // 5) 부모 메모 카드 — 자르지 않고 날짜+시계열 라벨로 분류(2일 컷 철회).
  //    '하루 관찰' 라벨 메모는 패턴 근거 금지, 부모가 '항상/매일'이라 쓴 것만 '부모 표현상 반복'.
  const noteRows = rows.filter((r) => r.note && r.note.trim()).sort((a, b) => b.log_date.localeCompare(a.log_date)).slice(0, 8);
  const noteCards = noteRows.map((r) =>
    `[${ago(r.log_date)}·하루 관찰${PARENT_RECUR_RE.test(r.note || '') ? '·부모 표현상 반복' : ''}] ${String(r.note).slice(0, 100)}`);
  // 단발 이벤트 단어(뷔페 등): 최근 2일 메모에 없으면 오늘 편지에서 언급 금지(과거 편지 메아리 채널 차단)
  const recentTxt = noteRows.filter((r) => age(r.log_date) <= 2).map((r) => r.note).join(' ');
  const recentEvt = new Set(recentTxt.match(EVENT_RE) || []);
  const staleEvt = [...new Set(noteRows.map((r) => r.note).join(' ').match(EVENT_RE) || [])].filter((w) => !recentEvt.has(w));
  if (staleEvt.length) forbidParts.push(staleEvt.join('|'));

  return { cards: cards.slice(0, 14), noteCards, forbidParts };
}
