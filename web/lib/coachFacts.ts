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

  // 1) 끼니 슬롯 커버리지 — ⭐ 추세 인지형(이사님 지적: 카운트 임계만 보면 '방금 끊김' 전환 구간을 가림).
  //    마지막 점심 기록의 나이(lastLunchAge)로 분기: 최근까지 있음 / 있다가 최근 끊김 / 거의 없음.
  //    '점심을 거른다' 단정은 어느 분기에서든 최근 2일 메모가 지지할 때만 허용 — 기록 부재≠결식(누락일 수 있음. 모르면 단정 말고 묻는다).
  const slotDays = (s: string) => new Set(rows.filter((r) => r.slot === s).map((r) => r.log_date));
  const bDays = slotDays('breakfast'); const lDays = slotDays('lunch'); const dDays = slotDays('dinner');
  const lunchRows = rows.filter((r) => r.slot === 'lunch');
  const lunchDc = lunchRows.filter((r) => r.place === 'daycare').length;
  const lastLunchAge = lDays.size ? Math.min(...[...lDays].map((d) => age(d))) : 99;
  const recentLunchMemo = rows.some((r) => r.note && age(r.log_date) <= 2 && /점심[^.。\n]{0,12}(안\s?먹|거르|건너)/.test(r.note));
  if (lDays.size >= 3 && lastLunchAge <= 2) {
    cards.push(lunchDc >= Math.ceil(lunchRows.length / 2)
      ? `점심: 기록된 ${winDays}일 중 ${lDays.size}일 점심 기록(어제까지 이어짐) — 평일은 어린이집·유치원 급식으로 먹음(결식 아님)`
      : `점심: 기록된 ${winDays}일 중 ${lDays.size}일 점심 기록(어제까지 이어짐 — 결식 아님)`);
  } else if (lDays.size >= 1 && lastLunchAge >= 3) {
    cards.push(`점심: 창 내 ${lDays.size}일 기록 — 단, 마지막 점심 기록이 ${lastLunchAge}일 전(추세: 최근 비어 있음. 기록 누락일 수 있으니 '거른다' 단정 금지 — 비어 있는 기록을 부드럽게 확인 권유 가능)`);
  } else if (lDays.size > 0) {
    cards.push(`점심: 기록된 ${winDays}일 중 ${lDays.size}일만 점심 기록(최근 포함)`);
  }
  // '점심을 거른다/안 먹는다' 단정 금지 — 허용 조건은 최근 2일 메모의 직접 지지뿐(기록 부재≠결식).
  // ⭐ M7(적대감사): 예방·권유 표현("점심 30분 전 간식을 안 먹게")까지 잡던 과차단 정규식을 단정형으로 정밀화.
  if (!recentLunchMemo) forbidParts.push('점심(을|은)?[^.。\\n]{0,6}(거르|건너|굶)|점심(을|은)\\s?(거의\\s?)?안\\s?먹');   // '건너뛴/건너뛰' 양형 커버(테스트가 적발한 음절 함정)
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

  // 3) 자주 오르는 음식 — ⭐ 집/기관 분리(M5: 기관 급식 메뉴를 '집에서 잘 먹는다' 칭찬 근거로 세탁 금지 — P10)
  const topOf = (rs2: FactRow[], n: number) => {
    const f: Record<string, number> = {};
    rs2.forEach((r) => { if (r.ate_well !== false) (r.menus || []).forEach((m) => { const t = m.trim(); if (t) f[t] = (f[t] || 0) + 1; }); });
    return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const homeTop = topOf(rows.filter((r) => r.place !== 'daycare'), 4);
  const dcTop = topOf(rows.filter((r) => r.place === 'daycare'), 3);
  if (homeTop.length) cards.push(`집에서 자주 오르는 음식: ${homeTop.map(([m, c]) => `${m} ${c}회`).join(' · ')}`);
  if (dcTop.length) cards.push(`기관 급식에서 자주 먹는 음식(집 칭찬 근거 아님): ${dcTop.map(([m, c]) => `${m} ${c}회`).join(' · ')}`);

  // 4) 거부 — ⭐ 횟수=거부한 '날' 수(M6: 행 단위 카운트는 하루 2슬롯 거부를 '간헐 2회'로 부풀려 시계열 라벨을 거짓으로 만듦)
  const refMap: Record<string, { days: Set<string>; last: string }> = {};
  rows.forEach((r) => { String(r.refused || '').split(/[,，·]/).forEach((tok) => {
    const k = cleanRefusal(tok);
    if (!k) return;
    const e = (refMap[k] ||= { days: new Set<string>(), last: r.log_date });
    e.days.add(r.log_date);
    if (r.log_date > e.last) e.last = r.log_date;
  }); });
  Object.entries(refMap)
    .sort((a, b) => b[1].days.size - a[1].days.size)
    .slice(0, 5)
    .forEach(([k, v]) => cards.push(`거부: ${k} — ${recurrenceLabel(v.days.size)}(마지막 ${ago(v.last)} · 횟수=거부한 날 수)`));

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
