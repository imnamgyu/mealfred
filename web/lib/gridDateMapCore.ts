/**
 * 결정론 CLOVA 그리드 파서 (순수 함수, 네트워크·파일 없음 — 클라/서버/스크립트 공용 단일 진실).
 *   목표(이사님 2026-06-23): "그달 메뉴 전부 추출". 표 격자에 식단메뉴스러운 텍스트가 있으면 가져온다.
 *   날짜는 best-effort: 실날짜 읽히면 쓰고, 못 읽어도 메뉴는 떨어뜨리지 않음. 영양점수는 메뉴 집합 + 끼니(slot)만 보고
 *   요일/정확일자는 변별력 0 → 정밀 날짜는 보너스(캘린더 매칭용).
 *   소비처: app/api/ocr/route.ts(P2 통합) · scripts/lib/gridParse.mjs(re-export) · grid-coverage/grid-vs-sonnet.
 */

export const WD: string[] = ['일', '월', '화', '수', '목', '금', '토'];
const SLOT_RE = /(오전\s*간식|오후\s*간식|점심|중식|간식|조식|석식)/;
export function slotOf(t?: string | null): string | null {
  const m = (t || '').match(SLOT_RE);
  if (!m) return null;
  const s = m[1].replace(/\s/g, '');
  return s.includes('오전') ? 'am_snack' : s.includes('오후') ? 'pm_snack' : (s === '점심' || s === '중식') ? 'lunch' : s === '간식' ? 'pm_snack' : null;
}
const HOLIDAY_RE = /공휴일|휴일|개천절|한글날|추석|한가위|설날|성탄|어린이날|현충일|광복절|삼일절|신정|대체공휴|휴원|재량휴업|방학|연휴|노동절|근로자의날|선거/;
const WD_RE = /^([월화수목금토일])(?:요일)?$/;
const isWd = (t?: string): string | null => { const m = (t || '').trim().match(WD_RE); return m ? m[1] : null; };
const ENDMEAL = /열량|단백질|kcal|에너지|탄수화물|지방/;
// 비메뉴 셀 — 원산지·영양·헤더·안내문(셀 통째로 메뉴가 아님). 메뉴셀엔 이 키워드가 거의 안 나옴.
const NONMENU = /국내산|외국산|수입산|러시아산|미국산|중국산|노르웨이|페루산|원양|국거리|무항생제|유기농|HACCP|친환경|한우|등급|원산지|품목|구분|대상|급식일|급식단가|식재료비|관리비|홈페이지|게시|소식지|유발|번호로|예정량|첨가물|알레르기|미량영양|아랫줄|식단표|학교급식|가정통신|식생활/;
// 표 하단 범례/사이드바 — 식단표 맨 아래 블록(알레르기 19종·식품군·제철음식·푸드브릿지 특집·각주)이
//   마지막 날짜열로 흡수돼 가짜 진수성찬이 되는 것 방지(2026-06-25 동래래미안 06-30 42토큰 사고).
//   알레르기는 '난류 우유 메밀…'처럼 단독토큰으로 나열됨 — 메뉴는 '소불고기'처럼 음식명에 박혀 단독 아님 → 정확토큰 매칭으로 오탐 차단.
const ALLERGEN = new Set(['난류', '우유', '메밀', '땅콩', '대두', '밀', '고등어', '게', '새우', '돼지고기', '복숭아', '토마토', '아황산류', '아황산', '호두', '닭고기', '쇠고기', '오징어', '조개류', '잣', '메추리', '전복', '홍합']);
// 사이드바/푸터 마커(정상 메뉴엔 안 나옴) — 푸드브릿지 특집·제철음식·식품군범례·알레르기 각주
const LEGEND_RE = /푸드브릿지|제철음식|어육가공품|식육가공품|수산물가공품|산화방지제|보존료|표백제|나트륨함량|간접노출|소극적노출|적극적노출|기호도\s*낮은|단계적으로/;
// 제철음식 사이드바 셀머리: [채소]·[해산물]·[과일] / -채소: -해산물:
const SEASON_TAG_RE = /^\s*[-·]?\s*\[(채소|해산물|과일|채소류|해산물류)\]|^\s*[-·]\s*(채소|해산물|과일)\s*:/;

interface DateHit { date: number; wd: string; mon?: number; bare?: boolean }
// 날짜셀 인식 (요일 괄호 없는 변종 포함) — N일·M/D·D/요일·맨숫자. maxDay = 그달 일수(범위검증으로 영양/원산지 숫자 오인 차단).
function looseDate(txt: string, maxDay = 31): DateHit | null {
  const t = (txt || '').trim();
  let m: RegExpMatchArray | null;
  let r: DateHit | null = null;
  if ((m = t.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) r = { date: +m[2], wd: '' };                              // 7월28일
  else if ((m = t.match(/^(\d{1,2})\s*[/.]\s*([월화수목금토일])(?:요일)?\s*$/))) r = { date: +m[1], wd: m[2] };     // 1/월
  else if ((m = t.match(/^(?:\d{1,2}\s*[/.\-]\s*)?(\d{1,2})\s*일?\s*\(\s*([월화수목금토일])\s*\)/))) r = { date: +m[1], wd: m[2] }; // 1(수)·10/1(수)·1일(수)
  else if ((m = t.match(/^(\d{1,2})\s*\/\s*(\d{1,2})(?!\s*\d)/))) r = { date: +m[2], mon: +m[1], wd: '' };          // 10/1 (슬래시만 — 알레르겐 '5.6' 점 표기 배제)
  else if ((m = t.match(/^(\d{1,2})\s*일(?!\s*\d)/))) r = { date: +m[1], wd: '' };                                 // 1일
  else if (/^\d{1,2}$/.test(t) && +t >= 1 && +t <= 31) r = { date: +t, wd: '', bare: true };                      // 맨숫자(요일헤더 동반 시만 신뢰)
  return r && r.date >= 1 && r.date <= maxDay ? r : null;                                                          // 그달 일수 초과(59 등) = 날짜 아님
}

export interface GridCell { r: number; col: number; cs: number; txt: string }
export interface ClovaCellRaw { rowIndex?: number; columnIndex?: number; columnSpan?: number; cellTextLines?: { cellWords?: { inferText?: string }[] }[] }
export interface ClovaTableRaw { cells?: ClovaCellRaw[] }
export interface ClovaImageRaw { tables?: ClovaTableRaw[]; fields?: unknown[] }
export interface GridItem { date: string; wd: string; slot: string; menu: string }
export interface GridResult { items: GridItem[]; warns: string[]; method: string }

// CLOVA table → 셀 좌표 배열
export function cellsOf(table: ClovaTableRaw): GridCell[] {
  return (table.cells || []).map((c) => ({
    r: c.rowIndex || 0, col: c.columnIndex || 0, cs: c.columnSpan || 1,
    txt: (c.cellTextLines || []).map((ln) => (ln.cellWords || []).map((w) => w.inferText || '').join('')).join(' ').trim(),
  }));
}

// 메뉴 분해 — 괄호 알레르겐코드 제거 후 공백/콤마 분리, 숫자·기호 제거, 2자+.
function splitMenus(txt: string): string[] {
  const clean = (txt || '').replace(/\([^)]*\)/g, ' ').replace(/[①-⑳★☆※&]/g, ' ').replace(/[0-9.]/g, ' ');
  const out: string[] = [];
  for (const raw of clean.split(/[\s,，/]+/)) { const menu = raw.trim(); if (menu && menu.length >= 2) out.push(menu); }
  return out;
}

// 격자 → items (메뉴 전부추출, best-effort 날짜). ym = 'YYYY-MM' 또는 null(요일 교차검증만).
// 반환: method ∈ 'real'(실날짜) | 'fallback'(주차합성) | 'none'
export function gridToItems(cells: GridCell[], ym: string | null): GridResult {
  const yearGuess = ym ? +ym.slice(0, 4) : 0, monGuess = ym ? +ym.slice(5, 7) : 0;
  const maxDay = (yearGuess && monGuess) ? new Date(yearGuess, monGuess, 0).getDate() : 31;   // 그달 일수 — 범위검증 분모
  const rows: Record<number, GridCell[]> = {};
  for (const c of cells) (rows[c.r] = rows[c.r] || []).push(c);
  const rk = Object.keys(rows).map(Number).sort((a, b) => a - b);
  const items: GridItem[] = []; const warns: string[] = [];
  let wdMap: Record<number, string> = {};        // col → 요일 (요일헤더행에서)
  let dayMap: Record<number, { date: string; wd: string }> | null = null;
  let week = 0; let curSlot: string | null = null;
  let usedReal = false, usedBare = false;

  for (const ri of rk) {
    const cs = rows[ri].slice().sort((a, b) => a.col - b.col);
    // (0) 하단범례 컷 — 알레르기 단독토큰 다수(≥4) 또는 사이드바 마커 = 식단표 맨 아래 범례블록.
    //   메뉴가 시작된 뒤(dayMap 존재)면 이 행부터 표 하단 범례 → 이후 행 전부 제외(break). 메뉴 전이면 그냥 스킵.
    const rowToks = cs.flatMap((c) => (c.txt || '').split(/[\s,，/·]+/).map((s) => s.trim()).filter(Boolean));
    const allergenHits = rowToks.filter((t) => ALLERGEN.has(t)).length;
    if (allergenHits >= 4 || LEGEND_RE.test(cs.map((c) => c.txt).join(' '))) {
      if (dayMap) { warns.push('하단범례 컷'); break; }
      continue;
    }
    // (1) 요일헤더행 — col→요일 기억(날짜 못 읽어도 분산·교차검증에 사용)
    const wdCells = cs.filter((c) => isWd(c.txt));
    if (wdCells.length >= 3) { wdMap = {}; for (const c of cs) { const w = isWd(c.txt); if (w) for (let col = c.col; col < c.col + c.cs; col++) wdMap[col] = w; } continue; }
    // (2) 날짜행(느슨) — 한 행에 날짜형 셀 ≥2면 그 행을 날짜 경계로
    const dCells = cs.map((c) => ({ c, d: looseDate(c.txt, maxDay) })).filter((x): x is { c: GridCell; d: DateHit } => !!x.d);
    if (dCells.length >= 2) {
      const anyBare = dCells.some((x) => x.d.bare);
      if (anyBare) week++;
      dayMap = {}; curSlot = null;
      for (const { c, d } of dCells) {
        let day: { date: string; wd: string };
        if (d.bare) { day = { date: `${week}주_${wdMap[c.col] || ('c' + c.col)}`, wd: wdMap[c.col] || '' }; usedBare = true; }
        else { day = { date: String(d.date), wd: d.wd || wdMap[c.col] || '' }; usedReal = true; }
        for (let col = c.col; col < c.col + c.cs; col++) dayMap[col] = day;
      }
      continue;
    }
    // (3) 메뉴행 — slot 못 잡아도 메뉴 버리지 않음(lunch 디폴트). 비메뉴/공휴 셀만 제외.
    const c0 = cs[0]?.txt || '';
    if (ENDMEAL.test(c0)) { curSlot = null; continue; }      // 열량/단백질 행 = 메뉴 끝
    const slot = slotOf(c0);
    if (slot) curSlot = slot;
    const useSlot = slot || curSlot || 'lunch';
    for (const c of cs) {
      if (c.col === 0 || !c.txt || c.txt === '·') continue;   // col0 = 라벨/안내 자리
      if (NONMENU.test(c.txt)) continue;                       // 원산지·영양·안내 셀 제외
      if (LEGEND_RE.test(c.txt) || SEASON_TAG_RE.test(c.txt)) continue;   // 푸드브릿지·제철음식·식품군 범례 셀(컷 위로 샌 경우 방어)
      if (c.txt.length < 14 && HOLIDAY_RE.test(c.txt)) continue;
      let day: { date: string; wd: string } | null = null;
      if (dayMap) for (let col = c.col; col < c.col + c.cs; col++) if (dayMap[col]) { day = dayMap[col]; break; }
      if (!day) {
        if (!dayMap) continue;   // 날짜 anchor 없는 표(원산지·알레르기·안내) = 식단 격자 아님 → 메뉴로 안 봄
        // 식단 격자 안인데 col이 어긋난 셀(kcal 끼임·병합) — 가장 가까운 날짜 col로 흡수(메뉴 살림, 날짜정확도는 점수 무관)
        const cols = Object.keys(dayMap).map(Number);
        let near = cols[0]; for (const cc of cols) if (Math.abs(cc - c.col) < Math.abs(near - c.col)) near = cc;
        day = dayMap[near];
      }
      for (const menu of splitMenus(c.txt)) items.push({ date: day.date, wd: day.wd, slot: useSlot, menu });
    }
  }

  const method = !items.length ? 'none' : usedReal ? 'real' : 'fallback';
  // 요일 교차검증(실날짜·연월 알 때) — 합성('N주_') 날짜는 건너뜀
  if (yearGuess && monGuess) {
    for (const it of items) {
      if (!it.wd || !/^\d+$/.test(it.date)) continue;
      const realWd = WD[new Date(Date.UTC(yearGuess, monGuess - 1, +it.date)).getUTCDay()];
      if (realWd !== it.wd) { warns.push(`날짜 ${it.date}: 셀요일 ${it.wd} ≠ 실제 ${realWd}`); break; }
    }
  }
  if (method === 'fallback') warns.push(`주차폴백(${week}주)`);
  return { items, warns, method };
}

// 한 CLOVA 이미지응답(image[0])의 모든 table을 파싱해 파일/페이지 단위로 집계. method 우선순위 real>fallback>none.
export function parseImageTables(image: ClovaImageRaw | null | undefined, ym: string | null): GridResult & { tableCount: number } {
  const tables = image?.tables || [];
  const all: GridItem[] = []; const warns: string[] = [];
  const rank: Record<string, number> = { none: 0, fallback: 2, real: 3 };
  let best = 'none';
  for (const t of tables) {
    const { items, warns: w, method } = gridToItems(cellsOf(t), ym);
    all.push(...items); warns.push(...w);
    if ((rank[method] ?? 0) > (rank[best] ?? 0)) best = method;
  }
  const seen = new Set<string>(); const uniq: GridItem[] = [];
  for (const it of all) { const k = `${it.date}|${it.slot}|${it.menu}`; if (seen.has(k)) continue; seen.add(k); uniq.push(it); }
  return { items: uniq, warns, method: best, tableCount: tables.length };
}

// 'YYYY-MM' 추출 — 파일명/경로에서
export function ymFromName(name?: string | null): string | null {
  let m = (name || '').match(/(20\d{2})[년\-.]?\s*(\d{1,2})\s*월/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
  m = (name || '').match(/(20\d{2})[-.](\d{1,2})\b/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
  return null;
}
