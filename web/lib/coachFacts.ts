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
import { computeGroupSignals } from './nutrition';
import { pickFoodReco } from './coachRecos';

export type FactRow = {
  log_date: string; slot: string | null; menus: string[] | null; refused: string | null;
  note: string | null; environment: string | null; place: string | null; ate_well: boolean | null;
  ingredients?: string[] | null;
};

const SLOT_KO: Record<string, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', am_snack: '오전 간식', pm_snack: '오후 간식', snack: '간식' };
const ENV_KO: Record<string, string> = { table: '식탁·화면 없음', screen: '화면 보며', roaming: '돌아다니며', play: '놀이하며' };

/** 시계열 추세 라벨 — 단발/간헐/반복. 모든 분석은 이 추세 판단을 거쳐야 한다(이사님 원칙). */
export function recurrenceLabel(count: number): string {
  return count <= 1 ? '단발 1회' : count <= 3 ? `간헐 ${count}회` : `반복 ${count}회`;
}

const EVENT_RE = /뷔페|외식|여행|파티|잔치|캠핑|행사/g;          // 단발성 이벤트 단어 — 패턴화 단골 오염원
const PARENT_RECUR_RE = /항상|매일|맨날|늘\s|자주/;               // 부모가 스스로 '반복'이라 표현한 메모

/**
 * D-04 — 사실 카드 객체: kind가 인용 정책을 결정한다.
 *   diagnosis = 주간·시계열 통계(환경 비율·커버리지·거부 추세) → 유닛 활성 기간 1회만 {fact} 인용(assembleLetter 원장)
 *   daily     = '어제'의 단일 사실(어제 끼니 환경) → 매일 인용 가능
 *   prose     = 편지 {fact} 슬롯용 산문형(없으면 text 사용) — text는 LLM 프롬프트용 구조 문자열이라 그대로 박으면 어색
 */
export type FactCard = { key: string; text: string; kind: 'diagnosis' | 'daily'; prose?: string };

// ── ⭐ 식단 거울(2026-06-13, 이사님 지시) ─────────────────────────────────────────
// lever·focus 유닛과 무관하게 '매 편지'가 아이의 실제 먹은 것을 비춰주는 베이스라인.
// (1) 어제 먹은 끼니(실제 메뉴) + (2) 최근 7일 영양신호등(식품군 green/red, 홈 화면과 동일 로직 재사용).
// 코칭 본문(행동) 위에 항상 1~2문장 얹어 — 부모가 "코치가 우리 애가 뭘 먹는지 보고 있구나"를 매일 느끼게 한다.
const GROUP_KO: Record<string, string> = {
  '곡물': '곡물', '비타민A채소': '노랑·주황 채소', '기타채소': '채소', '과일': '과일',
  '유제품': '유제품', '고기·계란': '고기·달걀', '생선·해산물': '생선·해산물', '콩류': '콩류',
};
/** 받침 유무로 조사 선택(을/를·은/는·이/가) — 거울 문장 자연스러움(메뉴·식품군명이 동적이라 필요). */
function josa(word: string, withB: string, withoutB: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return withoutB;
  return (c - 0xac00) % 28 ? withB : withoutB;
}
const SICK_RE = /배\s?아[픈프파팠]|배가\s?아|배탈|토하|토했|체했|아파|아팠|입맛 ?없|소화\s?안|메스꺼|울렁/;   // 컨디션 저하 — note·refused 양쪽 검사, 칭찬 차단·공감 톤
const DAILY_GROUPS = new Set(['곡물', '비타민A채소', '기타채소', '과일', '유제품']);  // 매일 채워야 할 군
const PERSIST_PRIORITY = new Set(['비타민A채소', '과일']);  // 만성 결핍이 잦은 군 — 결핍 선택 시 가중(이사님: 카테고리 다양성 정직)
/** 메뉴 표기 정규화 — la갈비→LA갈비, '&양념장'·괄호주석 등 NEIS 원천 기호를 손편지용으로 정리(랄프위검 적발). */
function sanitizeMenu(m: string): string {
  return m.split('&')[0].split('(')[0].trim().replace(/\bla(?=\s?갈비)/gi, 'LA');
}
const fmtMenus = (menus: (string | null | undefined)[] | null | undefined): string =>
  [...new Set((menus || []).map((m) => sanitizeMenu(String(m || ''))).filter(Boolean))].slice(0, 3).join('·');
/** 최근 거울에 안 쓴 템플릿을 고른다(상태추적 쿨다운 — 만성 결핍이 같은 군을 반복 지목해도 문장은 안 겹치게). */
function pickFresh(arr: string[], seed: number, recent: string[]): string {
  for (let i = 0; i < arr.length; i++) {
    const c = arr[(((seed + i) % arr.length) + arr.length) % arr.length];
    if (!recent.some((r) => r && r.includes(c))) return c;
  }
  return arr[(((seed) % arr.length) + arr.length) % arr.length];
}
// ⭐ 식단 거울 v3(랄프위검 R2 반영) — 가정식(부모 기록) 우선 반영 + 급식 보조, 컨디션 존중, 영양은 argmin(가장 시급한 결핍)+만성 가중.
export function buildMealMirror(p: { rows: FactRow[]; today: string; daySeed?: number; recent?: string[]; name?: string }): string | null {
  const { rows, today } = p;
  const nm = p.name || '아이';
  const todayMs = Date.parse(today);
  const age = (d: string) => Math.round((todayMs - Date.parse(d)) / 86400000);
  const seed = p.daySeed || 0;
  const recent = p.recent || [];   // 최근 거울 문장들(쿨다운 — 영양라인 verbatim 복붙 차단)
  // ⭐ '잘 먹는 식재료' 판단(이사님 06-13): ① 기관 급식(place=daycare)은 차려진 거라 '잘 먹는' 근거 아님(P10) — 집에서 먹은 것만.
  //   ② 한 번 먹은 걸 '잘 먹는'이라 하면 안 됨 → 집에서 최소 2일+ 거부 없이 먹은 것. 데이터 적으면 liked=비어 도전 음식으로(오판 방지).
  const LIKED_MIN_DAYS = 2;
  const refusedSet = new Set<string>();
  rows.forEach((r) => String(r.refused || '').split(/[,，·]/).forEach((t) => { const k = cleanRefusal(t); if (k) refusedSet.add(k); }));
  const likedDays: Record<string, Set<string>> = {};
  rows.filter((r) => r.ate_well !== false && r.place !== 'daycare').forEach((r) => (r.ingredients || []).forEach((i) => { if (i) (likedDays[i] ||= new Set()).add(r.log_date); }));
  const liked = Object.entries(likedDays)
    .filter(([k, days]) => days.size >= LIKED_MIN_DAYS && !refusedSet.has(k))   // 집에서 2일+ 거부 없이 = '잘 먹는'(급식 제외·정당화)
    .sort((a, b) => b[1].size - a[1].size).map(([k]) => k).slice(0, 8);
  // ⭐ '잘 먹는 음식(요리)'(이사님 06-13: 짜파게티에 당근 채썰어 넣기) — 집에서 거부 없이 반복한 '짠 끼니' 요리. 결핍 식재료를 여기 섞어 권유.
  //   과일·간식·우유류는 섞기 대상 아님(바나나에 시금치=괴식) → 끼니 슬롯 + 과일/간식 메뉴 제외.
  const MEAL_SLOTS = new Set(['breakfast', 'lunch', 'dinner']);
  const NOT_DISH = /바나나|사과|딸기|참외|귤|수박|포도|오렌지|블루베리|키위|망고|요구르트|요거트|요플레|우유|치즈|두유|과자|빵|꽈베기|마들렌|시리얼|젤리|아이스크림|주스|미숫가루|전병|떡|핫도그|크림/;
  const likedDishDays: Record<string, Set<string>> = {};
  rows.filter((r) => r.ate_well !== false && r.place !== 'daycare' && MEAL_SLOTS.has(r.slot || '')).forEach((r) => (r.menus || []).forEach((m) => {
    const t = sanitizeMenu(String(m || '')); if (t && !NOT_DISH.test(t)) (likedDishDays[t] ||= new Set()).add(r.log_date);
  }));
  const likedDishes = Object.entries(likedDishDays)
    .filter(([, days]) => days.size >= LIKED_MIN_DAYS)
    .sort((a, b) => b[1].size - a[1].size).map(([k]) => k).slice(0, 6);

  // (1) 컨디션 — 안 좋은 날은 공감만(이사님: '먹은 것 나열'은 엄마한테 도움 안 됨 → 어제 끼니 복기 자체를 제거).
  //   note·refused 양쪽에서 감지(6/02 '2배아픈데'·거부칸 '배아파서 카레'를 놓치던 구멍 보완).
  const sick = rows.some((r) => age(r.log_date) <= 1 && ((r.note && SICK_RE.test(r.note)) || (r.refused && SICK_RE.test(r.refused))));
  if (sick) return '어제는 속이 편치 않았던 날이었나 봐요. 그런 날은 무리하지 않아도 괜찮아요.';

  // (2) 영양신호등 — 최근 7일 식품군 커버리지. 해석(강점 대비 결핍 1문장) + 잘 먹는 음식에 섞는 구체 행동 1문장. '먹은 것 나열' 없음.
  const byDay: Record<string, string[]> = {};
  rows.filter((r) => { const a = age(r.log_date); return a >= 1 && a <= 7; })
    .forEach((r) => { (byDay[r.log_date] ||= []).push(...((r.ingredients || []) as string[])); });
  const days = Object.values(byDay).filter((d) => d.length);
  let analysis: string | null = null;   // 영양 해석 1문장(강점 대비 결핍)
  let action: string | null = null;     // 구체 행동 1문장(잘 먹는 음식에 섞기)
  if (days.length >= 2) {
    const { signals } = computeGroupSignals(days);
    const ko = (g: string) => GROUP_KO[g] || g;
    // 결핍 우선순위(낮을수록 시급): red 먼저 → 만성군(-5) → daily군 → weeklyEst(낮을수록 시급). argmin 단일 선택.
    const rank = (s: { level: string; group: string; weeklyEst: number }) =>
      (s.level === 'red' ? 0 : 100) + (PERSIST_PRIORITY.has(s.group) ? -5 : 0) + (DAILY_GROUPS.has(s.group) ? 0 : 10) + s.weeklyEst;
    const gaps = signals.filter((s) => s.level !== 'green').sort((a, b) => rank(a) - rank(b));
    if (gaps.length) {
      // ⭐ 결핍 '주 1회' 회전(이사님: 같은 잔소리 반복 금지) — 추천 음식·군이 최근 거울에 안 나온 결핍 우선(음식명 기준 판정 = 당근 매일 반복 차단). 다 나왔으면 날짜 회전.
      let g = gaps[seed % Math.min(3, gaps.length)];
      let reco = pickFoodReco({ target: g.group, likedIngredients: liked, seed });
      for (const c of gaps.slice(0, 4)) {
        const r = pickFoodReco({ target: c.group, likedIngredients: liked, seed });
        const usedRecently = recent.some((rr) => !!rr && (rr.includes(ko(c.group)) || (!!r && rr.includes(r.food))));
        if (!usedRecently) { g = c; reco = r; break; }
      }
      const gap = ko(g.group);
      const snack = g.group === '과일' || g.group === '유제품';   // 간식 채널(끼니 곁들임 금지·P9)
      // 해석 — 잘 채운 군(강점) 대비 결핍(이사님: "어제 식물성 단백 많았는데 채소는 비어요" 식). 곡물=밥이라 강점에서 제외(뻔함). 도입 정형성 방지로 문구 회전.
      const greens = signals.filter((s) => s.level === 'green' && s.group !== '곡물');
      const strong = greens.length ? greens[(((seed % greens.length) + greens.length) % greens.length)] : null;
      const ks = strong ? ko(strong.group) : '';
      analysis = pickFresh(strong ? [
        `최근 ${ks}${josa(ks, '은', '는')} 잘 챙겼는데 ${gap}${josa(gap, '이', '가')} 좀 아쉬워요`,
        `${gap}${josa(gap, '이', '가')} 요즘 좀 비어요 — ${ks}${josa(ks, '은', '는')} 잘 채우고 있고요`,
        `${ks}${josa(ks, '은', '는')} 넉넉한데 ${gap}${josa(gap, '이', '가')} 아쉬운 한 주예요`,
        `요즘 ${gap}${josa(gap, '이', '가')} 부족해요. ${ks}${josa(ks, '은', '는')} 잘 챙기고 있어요`,
      ] : [
        `요즘 ${gap}${josa(gap, '이', '가')} 좀 아쉬워요`,
        `요즘 식탁에 ${gap}${josa(gap, '이', '가')} 조금 부족해요`,
        `${gap}${josa(gap, '이', '가')} 며칠째 비어 있어요`,
      ], seed, recent);
      // ⭐ 구체 음식 추천(이사님: 그룹명 말고 요거트/당근 등) — 시계열 잘먹는것 → 궁합 → 푸드체이닝 → 도전(괴식0 테이블 근거).
      if (g.group === '과일') {   // 과일=간식채널 — 구체 과일명(잘먹는것 우선)으로, 항상 '간식으로'(끼니 곁들임 금지)
        const fruits = ['바나나', '사과', '딸기', '참외', '귤', '블루베리', '수박'];
        const fr = fruits.find((x) => liked.includes(x)) || fruits[seed % fruits.length];
        action = pickFresh([
          `${fr} 같은 과일을 간식으로 한 번 더 챙겨 주면 좋아요`,
          `오후 간식에 ${fr}${josa(fr, '을', '를')} 더해 보세요`,
          `${fr}${josa(fr, '을', '를')} 간식으로 내주면 어떨까요`,
        ], seed, recent);
      } else if (snack && reco) {   // 유제품 — 간식 채널(끼니 곁들임 금지), via 무관 간식 권유 + 음식·문구 회전
        const f = reco.food;
        action = pickFresh([
          `${nm}${josa(nm, '이', '가')} 잘 먹는 ${f}로 간식 때 한 번 더 챙겨 주면 좋아요`,
          `${f} 같은 ${gap}${josa(gap, '을', '를')} 간식으로 가볍게 더해 보세요`,
          `오후 간식에 ${f}${josa(f, '을', '를')} 더해 보세요`,
        ], seed, recent);
      } else if (reco) {   // 끼니 채널 — ⭐'잘 먹는 음식'에 결핍 식재료 섞기(이사님: 짜파게티에 당근 채썰어) 우선 + 사촌/궁합. 은유·나열 금지.
        const f = reco.food;
        const dish = likedDishes.length ? likedDishes[(((seed % likedDishes.length) + likedDishes.length) % likedDishes.length)] : null;
        const opts: string[] = [];
        if (dish) opts.push(   // 가장 실용적 — 잘 먹는 요리에 결핍 식재료를 잘게 섞기(거부감↓)
          `${nm}${josa(nm, '이', '가')} 잘 먹는 ${dish}에 ${f}${josa(f, '을', '를')} 잘게 썰어 넣어 보면 어떨까요`,
          `${dish}${josa(dish, '을', '를')} 좋아하니, 거기에 ${f}${josa(f, '을', '를')} 조금 다져 섞어 보세요`,
          `익숙한 ${dish} 속에 ${f}${josa(f, '을', '를')} 살짝 넣으면 거부감이 적어요`,
        );
        if (reco.via === 'pair' && reco.pairLiked) opts.push(`잘 먹는 ${reco.pairLiked} 옆에 ${f}${josa(f, '을', '를')} 한 조각 곁들여 보세요`);
        if (reco.via === 'chain' && reco.pairLiked) opts.push(`잘 먹는 ${reco.pairLiked}${josa(reco.pairLiked, '과', '와')} 결이 닮은 ${f}${josa(f, '을', '를')} 아주 조금 권해 보세요`);
        if (reco.dish) opts.push(`${reco.dish}처럼 익숙한 형태로 ${f}${josa(f, '을', '를')} 작게 시작해 보세요`);
        opts.push(`${f}${josa(f, '을', '를')} 잘게 썰어 익숙한 음식에 조금씩 섞어 보세요`);
        action = pickFresh(opts, seed, recent);
      }
    } else {   // 전부 green(결핍 0) — 데이터 근거 축하(celebrate 톤·이사님 Task3). 행동 없음.
      analysis = pickFresh([
        '이번 주는 식품군이 골고루 잘 채워졌어요. 지금처럼만 가면 충분해요',
        '요즘 식단 균형이 참 좋아요. 이 흐름을 믿고 가요',
        '최근 식탁이 두루 잘 채워지고 있어요. 잘 챙기고 계세요',
      ], seed, recent);
    }
  }

  const parts = [analysis, action].filter(Boolean) as string[];
  return parts.length ? parts.join('. ') + '.' : null;
}

export function compileFactCards(p: { rows: FactRow[]; today: string; recentMirrors?: string[]; name?: string }): { cards: FactCard[]; noteCards: string[]; forbidParts: string[]; mirror: string | null } {
  const { rows, today } = p;
  const todayMs = Date.parse(today);
  const age = (d: string) => Math.round((todayMs - Date.parse(d)) / 86400000);
  const ago = (d: string) => { const n = age(d); return n <= 1 ? '어제' : `${n}일 전`; };
  const cards: FactCard[] = [];
  const card = (key: string, text: string, kind: 'diagnosis' | 'daily' = 'diagnosis', prose?: string) => cards.push({ key, text, kind, ...(prose ? { prose } : {}) });
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
    card('lunch', lunchDc >= Math.ceil(lunchRows.length / 2)
      ? `점심: 기록된 ${winDays}일 중 ${lDays.size}일 점심 기록(어제까지 이어짐) — 평일은 어린이집·유치원 급식으로 먹음(결식 아님)`
      : `점심: 기록된 ${winDays}일 중 ${lDays.size}일 점심 기록(어제까지 이어짐 — 결식 아님)`,
      'diagnosis',
      lunchDc >= Math.ceil(lunchRows.length / 2) ? '점심은 어린이집에서 챙겨지니, 집에서는 아침·저녁에 집중하면 돼요' : '점심 기록이 어제까지 꾸준히 이어지고 있어요');   // ⭐ '급식 나온다' 사실 나열(이사님)→ 집밥 어디 집중할지 행동 가이드로
  } else if (lDays.size >= 1 && lastLunchAge >= 3) {
    card('lunch', `점심: 창 내 ${lDays.size}일 기록 — 단, 마지막 점심 기록이 ${lastLunchAge}일 전(추세: 최근 비어 있음. 기록 누락일 수 있으니 '거른다' 단정 금지 — 비어 있는 기록을 부드럽게 확인 권유 가능)`,
      'diagnosis', '점심 기록이 며칠째 비어 있어요(바쁜 날 누락이었을 수도 있고요)');
  } else if (lDays.size > 0) {
    card('lunch', `점심: 기록된 ${winDays}일 중 ${lDays.size}일만 점심 기록(최근 포함)`, 'diagnosis', '점심 기록이 아직 드문 편이에요');
  }
  // '점심을 거른다/안 먹는다' 단정 금지 — 허용 조건은 최근 2일 메모의 직접 지지뿐(기록 부재≠결식).
  // ⭐ M7(적대감사): 예방·권유 표현("점심 30분 전 간식을 안 먹게")까지 잡던 과차단 정규식을 단정형으로 정밀화.
  if (!recentLunchMemo) forbidParts.push('점심(을|은)?[^.。\\n]{0,6}(거르|건너|굶)|점심(을|은)\\s?(거의\\s?)?안\\s?먹');   // '건너뛴/건너뛰' 양형 커버(테스트가 적발한 음절 함정)
  if (bDays.size) {
    const bMenus = [...new Set(rows.filter((r) => r.slot === 'breakfast').flatMap((r) => r.menus || []))].slice(0, 4);
    card('breakfast', `아침: ${bDays.size}일 기록${bMenus.length ? ` — 최근 메뉴: ${bMenus.join('·')}` : ''}`,
      'diagnosis', `아침 식탁 기록이 ${bDays.size}일 쌓여 있어요`);
  }
  if (dDays.size) card('dinner', `저녁: ${dDays.size}일 기록`, 'diagnosis', `저녁 기록이 ${dDays.size}일 쌓여 있어요`);

  // 2) 식사 환경 — 주간 시계열 + '어제'의 끼니별 사실(reinforce/observe가 인용할 단단한 근거)
  const envRows = rows.filter((r) => r.environment);
  if (envRows.length >= 3) {
    const bad = envRows.filter((r) => r.environment !== 'table').length;
    card('env-week', `식사 환경: 기록 ${envRows.length}끼 중 화면·이동 식사 ${Math.round((bad / envRows.length) * 100)}% (${recurrenceLabel(bad)})`,
      'diagnosis', `최근 기록된 ${envRows.length}끼 가운데 ${bad}끼가 화면이나 이동과 함께한 식사였어요`);
  }
  // 어제의 끼니 환경(일일 카드) — 산문은 '식탁' 끼니를 우선(부모 실행을 칭찬으로 되돌릴 기회 — reinforce 사고 교훈)
  const yRows = rows.filter((r) => age(r.log_date) === 1 && r.environment && SLOT_KO[r.slot || '']);
  if (yRows.length) {
    const yBest = yRows.find((r) => r.environment === 'table') || yRows[0];
    const eseed = Math.floor(todayMs / 86400000); const eslot = SLOT_KO[yBest.slot || ''];
    const tableV = [`어제 ${eslot}을 화면 없이 식탁에 앉아 먹었어요`, `어제 ${eslot}은 화면 없이 식탁에서 보냈네요`, `어제 ${eslot}은 식탁에 앉아 차분히 먹었어요`];
    const screenV = [`어제 ${eslot}은 화면을 보며 먹었어요`, `어제 ${eslot}은 영상과 함께한 시간이었어요`, `어제 ${eslot}엔 화면이 곁에 있었네요`];
    const yProse = yBest.environment === 'table'
      ? tableV[eseed % tableV.length]
      : yBest.environment === 'screen'
        ? screenV[eseed % screenV.length]
        : `어제 ${eslot}은 ${ENV_KO[yBest.environment || ''] || '자리를 옮겨 가며'} 먹었어요`;
    card('env-y', `어제 끼니 환경: ${yRows.map((r) => `${SLOT_KO[r.slot || '']}(${ENV_KO[r.environment || ''] || r.environment})`).join(' · ')}`, 'daily', yProse);
  }

  // 3) 자주 오르는 음식 — ⭐ 집/기관 분리(M5: 기관 급식 메뉴를 '집에서 잘 먹는다' 칭찬 근거로 세탁 금지 — P10)
  const topOf = (rs2: FactRow[], n: number) => {
    const f: Record<string, number> = {};
    rs2.forEach((r) => { if (r.ate_well !== false) (r.menus || []).forEach((m) => { const t = m.trim(); if (t) f[t] = (f[t] || 0) + 1; }); });
    return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const homeTop = topOf(rows.filter((r) => r.place !== 'daycare'), 4);
  const dcTop = topOf(rows.filter((r) => r.place === 'daycare'), 3);
  if (homeTop.length) card('top-home', `집에서 자주 오르는 음식: ${homeTop.map(([m, c]) => `${m} ${c}회`).join(' · ')}`,
    'diagnosis', `집 식탁에는 ${homeTop.slice(0, 2).map(([m]) => m).join('·')} 같은 음식이 자주 올라요`);
  if (dcTop.length) card('top-dc', `기관 급식에 자주 나오는 음식(집 칭찬 근거 아님·P10): ${dcTop.map(([m, c]) => `${m} ${c}회`).join(' · ')}`,
    'diagnosis', `어린이집 급식에는 ${dcTop[0][0]} 같은 음식이 자주 나와요`);   // ⭐ 급식은 '차려진' 것 — '잘 먹는다' 판단 금지(이사님), 나온다는 사실만

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
    .forEach(([k, v]) => card(`refuse:${k}`, `거부: ${k} — ${recurrenceLabel(v.days.size)}(마지막 ${ago(v.last)} · 횟수=거부한 날 수)`,
      'diagnosis', v.days.size <= 1 ? `최근 식탁에서 ${k} 거부가 한 차례 있었어요` : `최근 식탁에서 ${k} 거부가 몇 차례 있었어요`));

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

  const mirror = buildMealMirror({ rows, today, daySeed: Math.floor(todayMs / 86400000), recent: p.recentMirrors, name: p.name });
  return { cards: cards.slice(0, 14), noteCards, forbidParts, mirror };
}

/** 기존 호출부 호환 어댑터(D-04) — 문자열 카드만 쓰는 경로(크론 프롬프트·api/coach)는 이대로. */
export function compileFacts(p: { rows: FactRow[]; today: string }): { cards: string[]; noteCards: string[]; forbidParts: string[]; mirror: string | null } {
  const r = compileFactCards(p);
  return { cards: r.cards.map((c) => c.text), noteCards: r.noteCards, forbidParts: r.forbidParts, mirror: r.mirror };
}
