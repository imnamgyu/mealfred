/**
 * lib/coachRecos.ts — 코칭 음식·식재료 추천을 네트워크 테이블로 '근거화'(환각·괴식 차단).
 *
 *  ② 잘 먹는 식재료 → 사촌(food-graph bridge)  ②′ 궁합(food-graph pair)
 *  ① 그 식재료가 '가장 많이 쓰이는 실존 음식'(ingredient-recipes freq · kit-matrix 실측 count)
 *
 *  설계 원칙(이사님): 추상 '조리법'을 추천하면 LLM이 조합을 지어내다 괴식이 난다.
 *  → 우리는 **또래가 실제로 가장 자주 먹는 '음식 이름'**만 권한다(조합은 그 음식 안에 이미 들어 있음).
 *  조리법 상세(양념·불세기)는 주지 않는다(부모가 검색). 궁합도 그래프(실측)만, 지어낸 궁합 금지.
 *
 *  순수 함수 — fs/HTTP 불사용. freqMap(ingredient-recipes)은 호출자가 주입(없으면 kit-matrix 폴백).
 */
import { verifiedCousinsOf, garnishPairsOf, type Neighbor } from './foodGraph';
import { dishesForIngredient } from './kitGuide';
import { isSpicyDish, isSpicyIngredient } from './spicy';

export type FreqMap = Record<string, { name: string; freq: number }[]>;

// 부족 식품군 → 대표 식재료(도감 표준명). 과일은 간식 채널(lib/coach SNACK_CHANNEL)이라 제외.
// ⚠️ 정렬·내용 무변경(Letter A pickFoodReco seed%length 회전 보존) — coachMaterials가 빈도 순 사본(RANKED)을 별도로 만든다.
export const GROUP_INGREDIENTS: Record<string, string[]> = {
  '곡물': ['현미', '귀리', '잡곡', '고구마', '감자'],
  '콩류': ['두부', '검은콩', '콩', '콩나물'],
  '유제품': ['치즈', '요거트', '우유'],
  '고기·계란': ['달걀', '계란', '소고기', '닭고기', '메추리알'],
  '생선·해산물': ['고등어', '연어', '새우', '멸치'],
  '비타민A채소': ['단호박', '당근', '시금치', '근대'],
  '기타채소': ['브로콜리', '양배추', '애호박', '버섯', '토마토'],
};

// ⭐ 주식 곡물(이사님) — 밀·쌀은 '날것'으로 다른 식재료와 섞어/곁들여 먹지 않는다. 반드시 '먹는 형태'로만 추천: 밀→빵·면·떡, 쌀→밥·떡.
export const STAPLE_FORMS: Record<string, string[]> = {
  '밀': ['빵', '면', '떡'], '밀가루': ['빵', '면', '떡'],
  '쌀': ['밥', '떡'], '멥쌀': ['밥', '떡'], '백미': ['밥', '떡'], '찹쌀': ['찰밥', '떡'],
  '보리': ['보리밥'], '현미': ['현미밥'], '잡곡': ['잡곡밥'], '귀리': ['오트밀', '귀리죽'], '기장': ['잡곡밥'], '수수': ['잡곡밥'],
};
/** 주식 곡물이면 '먹는 형태'(밥·빵·면·떡)로 표시. 아니면 원래 이름. (궁합/사촌 목록에서 날 곡물명 노출 방지) */
export const stapleDisplay = (nm: string): string => (STAPLE_FORMS[nm] ? STAPLE_FORMS[nm][0] : nm);

// ⭐ 영유아 안전 조리 접두(이사님 2026-06-14: "단호박" 말고 "찐 단호박" — 생물로 오인 방지·조리법+식재료 푸드체이닝).
//   생채소·생선·말린콩·알류처럼 '익혀야 하는' 식재료에만 접두를 붙인다. 가공식품(두부·치즈·곡물 밥형태)은 접두 없음.
const COOK_ADJ: Record<string, string> = {
  // 찐 — 박과·전분뿌리(푹 쪄서 으깨기 좋음)
  단호박: '찐', 감자: '찐', 고구마: '찐', 토란: '찐', 밤: '찐', 돼지감자: '찐',
  // 데친 — 잎·줄기채소·콩나물·갑각(끓는 물에 살짝)
  시금치: '데친', 근대: '데친', 브로콜리: '데친', 양배추: '데친', 콩나물: '데친', 애호박: '데친', 아욱: '데친',
  청경채: '데친', 케일: '데친', 비름나물: '데친', 콜리플라워: '데친', 방울양배추: '데친', 숙주나물: '데친', 새우: '데친', 오징어: '데친',
  // 익힌 — 단단한 뿌리·열매(채 썰거나 볶아 부드럽게)
  당근: '익힌', 토마토: '익힌', 비트: '익힌', 무: '익힌', 우엉: '익힌', 연근: '익힌', 가지: '익힌', 피망: '익힌', 파프리카: '익힌', 오이: '익힌',
  // 삶은 — 말린 콩·알류(완전히 익혀)
  검은콩: '삶은', '콩(대두)': '삶은', 콩: '삶은', 완두: '삶은', 강낭콩: '삶은', 달걀: '삶은', 계란: '삶은', 메추리알: '삶은',
  // 구운/조린 — 생선(가시 발라)
  고등어: '구운', 연어: '구운', 삼치: '구운', 갈치: '구운', 명태: '조린', 대구: '조린', 가자미: '구운',
  // 볶은 — 버섯·잔멸치
  버섯: '볶은', 느타리버섯: '볶은', 표고버섯: '볶은', 양송이버섯: '볶은', 팽이버섯: '볶은', 멸치: '볶은',
  // 익힌 — 고기(완전히 익혀 잘게)
  소고기: '익힌', 돼지고기: '익힌', 닭고기: '삶은', 오리고기: '익힌',
};
/** 조리법+식재료 표기. 익혀야 하는 식재료면 "찐 단호박"처럼 접두를 붙이고, 주식 곡물은 먹는 형태(밥·떡), 그 외(두부·치즈·과일 등)는 원래 이름. */
export const cookedName = (nm: string): string => (STAPLE_FORMS[nm] ? stapleDisplay(nm) : (COOK_ADJ[nm] ? `${COOK_ADJ[nm]} ${nm}` : nm));

// ⭐ 메뉴명 정제(이사님 2026-06-19) — NEIS 원본명을 부모에게 그대로 노출하면 지저분('(간식)꼬마김밥'·'양배추숙쌈&쌈장'·'우유(200ml)').
//   접두 분류태그·접미 부재료('&…')·용량/괄호 메타를 떼어 '음식 이름'만 남긴다(조리법·양념은 여전히 안 줌 — 부모가 검색).
const cleanDishName = (raw: string): string =>
  (raw || '')
    .replace(/^\s*\([^)]*\)\s*/, '')   // 접두 분류태그 '(간식)'·'(중식)' 제거
    .replace(/\s*[&＆].*$/, '')         // '&쌈장'·'＆…' 곁들임 접미 제거
    .replace(/\s*\([^)]*\)\s*$/, '')   // 접미 괄호 '(200ml)'·'(2개)' 용량/수량 메타 제거
    .trim();
// ⭐ 영유아 부적합 메뉴 — isSpicyDish가 못 잡는 매운 국물(육개장·닭개장은 '얼큰' 글자 없이도 매움)·짠지·견과 알레르겐.
const SPICY_EXTRA = /육개장|닭개장|개장|부대찌개|마라|짬뽕|짜글이|얼큰/;
const PICKLE = /장아찌|단무지|깻잎지|오이지|짠지|젓갈|젓무침|^.{0,4}젓$/;
const NUT = /견과|땅콩|호두|아몬드|캐슈|피칸|잣/;
const JUNK_FOOD = /튀김|돈가스|과자|사탕|젤리|초콜릿|캔디|사이다|콜라|탄산|아이스크림|빙수|핫도그/;   // 튀김·초가공·단 음료 권유 금지(이사님)
/** 메뉴가 영유아 추천에 부적합한가(정제 후 이름 기준). 매운류·짠지·견과 알레르겐·튀김/초가공 차단. */
const inappropriateDish = (name: string): boolean => isSpicyDish(name) || SPICY_EXTRA.test(name) || PICKLE.test(name) || NUT.test(name) || JUNK_FOOD.test(name);

/** 식재료가 '가장 많이 쓰이는 실존 음식' 최대 2개(급식 빈도순). 주식 곡물=먹는 형태 / freqMap(또래 급식 빈도) 우선 → kit-matrix(실측 count>0) 폴백.
 *  매운·짠지·견과 메뉴 제외 + 원본명 정제. 후보가 전부 부적합이어도 kit 카테고리 폴백(볶음·무침)이 받쳐 빈 배열을 피한다(degrade). */
export function popularDishesFor(ing: string, freqMap?: FreqMap): string[] {
  if (STAPLE_FORMS[ing]) return STAPLE_FORMS[ing].slice(0, 2);   // 밀·쌀은 날것 아님 → 빵·면·떡·밥으로만
  if (FRUIT.has(ing)) return [];   // ⭐ 과일은 '과일로' 먹는다(간식채널) — 배=양념인 너비아니구이처럼 '숨은 재료' 음식으로 매핑하면 오인(이사님 괴식 방지)
  const out: string[] = [];
  const add = (raw: string) => {
    if (out.length >= 2) return;
    const nm = cleanDishName(raw);
    if (!nm || nm === ing || inappropriateDish(nm) || out.includes(nm)) return;   // 빈문자·식재료=음식 위장·부적합·중복 차단
    out.push(nm);
  };
  const fm = freqMap?.[ing];
  if (fm) for (const r of fm) { if (out.length >= 2) break; if (r.freq >= 4) add(r.name); }   // freqMap은 이미 freq 내림차순 = 급식 빈도순
  if (out.length < 2) for (const d of dishesForIngredient(ing, 2)) { if (out.length >= 2) break; if (d.count > 0) add(d.dish); }
  return out;
}

/**
 * ⭐ 거울용 구체 추천(2026-06-13, 이사님: 그룹명 말고 구체 음식 — 잘먹는것·사촌·푸드체이닝 전략).
 * 전략 우선순위: ① liked(아이가 이미 잘 먹는 그 그룹 식재료를 한 번 더) → ② pair(잘 먹는 것에 곁들이기)
 *   → ③ chain(잘 먹는 것의 사촌이 결핍군에 있으면 푸드체이닝) → ④ dish(또래 인기 음식으로 도전) → ⑤ plain.
 * 전부 테이블 근거(괴식 0). likedIngredients=시계열 잘 먹는 식재료(호출자가 meal_logs에서).
 */
export type FoodReco = { group: string; food: string; via: 'liked' | 'pair' | 'chain' | 'dish' | 'plain'; pairLiked?: string; dish?: string };
export function pickFoodReco(args: { target: string; likedIngredients: string[]; freqMap?: FreqMap; seed?: number }): FoodReco | null {
  const reps0 = GROUP_INGREDIENTS[args.target];
  if (!reps0 || !reps0.length) return null;
  // ⭐ 식재료 다양화(이사님 06-13 '유제품 계속 우유'·'당근 반복') — '잘 먹는 것' 고착 대신 대표 식재료를 날짜로 회전하고,
  //   그 식재료의 관계(잘먹음/궁합/푸드체이닝/도전)로 프레이밍. → 우유→요거트→치즈, 당근→단호박→시금치.
  const off = (((args.seed || 0) % reps0.length) + reps0.length) % reps0.length;
  const rep = reps0[off];   // 오늘의 추천 식재료(회전)
  const liked = new Set((args.likedIngredients || []).filter(Boolean));
  if (liked.has(rep)) return { group: args.target, food: stapleDisplay(rep), via: 'liked' };
  const pl = safeGarnishOf(rep).find((n) => liked.has(n.nm));   // 궁합 — 잘 먹는 것에 곁들이기(강한 pair·tray/매운/교차괴식 제외)
  if (pl) return { group: args.target, food: rep, via: 'pair', pairLiked: stapleDisplay(pl.nm) };
  for (const lk of liked) {   // 푸드체이닝 — 잘 먹는 것의 검증된 사촌이 이 rep이면
    if (verifiedCousinsOf(lk).some((n) => n.nm === rep)) return { group: args.target, food: rep, via: 'chain', pairLiked: stapleDisplay(lk) };
  }
  const d = popularDishesFor(rep, args.freqMap);   // 또래 인기 음식으로 도전
  if (d.length) return { group: args.target, food: rep, via: 'dish', dish: d[0] };
  return { group: args.target, food: stapleDisplay(rep), via: 'plain' };
}

/**
 * ⭐ 주간 노출 타깃(이사님 Task#11): 본문(exposure)이 노출할 '실제 결핍 도전 음식'을 영양 신호에서 산출.
 *   기존 mission_target(콩류)이 실제로 green이면 거울(채소·과일 결핍)과 모순 → 끼니 채널 결핍군의 도전 음식으로 정렬.
 *   끼니 채널만(과일·유제품=간식 제외), 채소 우선, '아직 안 먹는 것(도전)' 우선. 주간 1개 고정(푸드체이닝 일관성).
 */
const MEAL_GROUPS = ['비타민A채소', '기타채소', '콩류', '생선·해산물', '곡물', '고기·계란'];
export function weeklyExposureTarget(signals: { group: string; level: string; weeklyEst: number }[], liked: string[], seed = 0): string | null {
  const cand = (signals || []).filter((s) => MEAL_GROUPS.includes(s.group) && s.level !== 'green');
  if (!cand.length) return null;
  const vegBonus = (g: string) => (g === '비타민A채소' || g === '기타채소' ? -5 : 0);   // 편식 핵심 = 채소 우선
  cand.sort((a, b) => ((a.level === 'red' ? 0 : 10) + vegBonus(a.group) + a.weeklyEst) - ((b.level === 'red' ? 0 : 10) + vegBonus(b.group) + b.weeklyEst));
  const reps = GROUP_INGREDIENTS[cand[0].group] || [];
  if (!reps.length) return null;
  const likedSet = new Set(liked || []);
  const challenge = reps.filter((r) => !likedSet.has(r));   // 도전 = 아직 잘 안 먹는 것
  const pool = challenge.length ? challenge : reps;
  const pick = pool[(((seed % pool.length) + pool.length) % pool.length)];
  return stapleDisplay(pick);
}

/** 식재료 → 소속 식품군(역색인). 풀이 여러 군에 걸칠 때 라벨용. */
const ING_GROUP: Record<string, string> = (() => { const m: Record<string, string> = {}; for (const [g, list] of Object.entries(GROUP_INGREDIENTS)) for (const i of list) if (!m[i]) m[i] = g; return m; })();
export const groupOfIngredient = (ing: string): string | null => ING_GROUP[ing] || null;

// ── ⭐ 곁들임 안전 필터(이사님 2026-06-19) — 부모에게 "잘 먹는 X 곁들이면 좋아요"로 노출되는 궁합만 거른다 ──
//   사고: strongPairsOf는 'tray(식판 동시출현)'+레시피 동시출현을 다 strong으로 본다(음식 추천을 '식단'으로 판단 — TR-02 의도, 보존).
//   하지만 곁들임 권유엔 부적합: ① tray(김치+요구르트·미역+돼지고기처럼 김치류가 전 식판에 끼는 류)는 garnishPairsOf가 이미 제외,
//   ② 매운/김치류(isSpicyIngredient), ③ 교차괴식(단과일↔생선/짭짤·생선↔유제품)을 여기서 추가 차단. 식판/레시피에 우연히 떠도 영유아에겐 괴식.
const FRUIT = new Set(['사과', '배', '딸기', '바나나', '포도', '귤', '참외', '수박', '멜론', '복숭아', '키위', '블루베리', '자두', '감', '오렌지', '망고', '감귤', '체리', '레몬', '파인애플', '자몽']);
const SEAFOOD_RE = /고등어|연어|새우|멸치|오징어|명태|갈치|삼치|대구|가자미|꽁치|조기|임연수|주꾸미|낙지|문어|바지락|홍합|굴|전복|게맛살|어묵|미역|다시마|김|파래|매생이|톳|꼬막|조개|가다랑어|꽁치|우럭|홍어|골뱅이|해물|해산물/;
const isFruit = (nm: string): boolean => FRUIT.has(nm);
const isSeafood = (nm: string): boolean => groupOfIngredient(nm) === '생선·해산물' || SEAFOOD_RE.test(nm);
const isDairy = (nm: string): boolean => groupOfIngredient(nm) === '유제품' || /우유|치즈|요거트|요구르트|크림|버터|연유/.test(nm);
const isLegume = (nm: string): boolean => groupOfIngredient(nm) === '콩류';
// ⭐ 단 것(과일·우유류) ↔ 짠 단백질(생선·해산물·콩/두부)은 섞지 않는다(이사님: 바나나·사과·우유에 콩·두부·생선·멸치·김 ❌).
const isSweetBland = (nm: string): boolean => isFruit(nm) || isDairy(nm);
const isSavoryProtein = (nm: string): boolean => isSeafood(nm) || isLegume(nm);
/** 두 식재료가 영유아에게 명백한 교차괴식인가(무방향): 단과일/우유류 ↔ 생선·해산물/콩·두부. (생선↔콩 같은 짠↔짠은 허용 — 두부+멸치) */
const garnishConflict = (a: string, b: string): boolean =>
  (isSweetBland(a) && isSavoryProtein(b)) || (isSavoryProtein(a) && isSweetBland(b));
const KIMCHI_EXTRA = /깍두기|총각/;   // isSpicyIngredient(/김치/)가 못 잡는 김치류
/** ⭐ 곁들임 추천 전용 안전 궁합 — garnishPairsOf(tray 제외)에서 ①매운/김치류 ②날곡물(생쌀·밀가루) ③교차괴식을 한 번 더 거른다.
 *  부모 노출 "곁들이면 좋아요" 경로 전용(strongPairsOf는 무변경). */
export function safeGarnishOf(nm: string): Neighbor[] {
  return garnishPairsOf(nm).filter((n) =>
    !isSpicyIngredient(n.nm) && !KIMCHI_EXTRA.test(n.nm) &&
    !STAPLE_FORMS[n.nm] &&                   // 생쌀·현미·밀가루 등 날곡물은 곁들임 금지(밥·빵·면·떡 '먹는 형태'로만)
    !garnishConflict(nm, n.nm));
}

// ── ⭐ 콜드스타트 시드 사다리(이사님 2026-06-19) — '확신 liked'가 적을 때 추천이 두부 디폴트로 무너지지 않게 ──
//   아린처럼 ate_well 미상(null)이 80%면 '뭘 좋아하는지' 모른다 → 추천 출발점(앵커)을 사다리로 보강:
//   Tier2 = '자주 차려진 음식'(수용도 무관·집 빈도) → food-graph 사촌/궁합으로 네트워크 확장.
//   Tier3 = 그마저 빈약하면 '영유아 급식 고빈도(youa-freq=dietary4u 표준식단 등장률) 큐레이션'(아이 잘 먹음×급식 흔함×안전).
import youaFreqJson from './youa-freq.json';
const YOUA_TOP: string[] = Object.entries(youaFreqJson as Record<string, unknown>)
  .filter(([k, v]) => k !== '_meta' && typeof v === 'number')
  .sort((a, b) => (b[1] as number) - (a[1] as number))
  .map(([k]) => k)
  .filter((k) => !!groupOfIngredient(k));   // 식품군 인식되는 표준 식재료만(사촌·궁합 그래프 진입 가능)
// ⭐ 급식 표기 정규화(이사님 2026-06-19) — 도감 표준명 ↔ youa-freq(dietary4u) 키 불일치 봉합.
//   동의어·콩류 대두·곡물/버섯 대표 매핑. 전부 youa에 '실재하는 키'로만 매핑(% 날조 0 — 0회를 흔함으로 위장하지 않는다는 원칙 유지).
const ING_YOUA_ALIAS: Record<string, string> = {
  '요거트': '요구르트', '달걀': '계란',            // 표기 동의어
  '콩': '콩(대두)', '검은콩': '콩(대두)',          // 콩류 → 대두
  '현미': '멥쌀', '잡곡': '보리', '쌀': '멥쌀', '백미': '멥쌀', '밀가루': '밀',   // 곡물 표기/대표(밥·빵류 급식 매우 흔함)
  '버섯': '느타리버섯',                            // 버섯 대표(급식 최빈 버섯)
  // ⚠️ 연어는 의도적 미매핑 — 한국 영유아 급식에 거의 안 나옴(고가·수입). null='자주 나옴' 위장 금지(정직).
};
// ⭐ 급식 출현 순위(이사님 2026-06-19) — 추천 음식이 '급식에 얼마나 흔한지'를 근거로 붙인다('자주 나오니 처음 권하기 좋다').
//   youa-freq는 횟수가 아니라 '등장률%'이고 98.6에 다수 동률 → 정수 등수 대신 '동률 안전 순위(엄격히 큰 것 +1)→상위 N%'.
//   모집단 = youa 전 항목(식품군 미인식 키 포함) — 분모를 인위로 좁히지 않아야 '상위 N%'가 정직(전체 급식 식재료 기준).
const YOUA_RANK: Record<string, { rank: number; total: number; pct: number; topPct: number }> = (() => {
  const all = (Object.entries(youaFreqJson as Record<string, unknown>)
    .filter(([k, v]) => k !== '_meta' && typeof v === 'number')) as [string, number][];
  const pcts = all.map(([, v]) => v);
  const total = all.length;
  const m: Record<string, { rank: number; total: number; pct: number; topPct: number }> = {};
  for (const [k, pct] of all) {
    const rank = pcts.filter((p) => p > pct).length + 1;   // 동률 안전: 같은 등장률은 같은 순위
    m[k] = { rank, total, pct, topPct: Math.max(1, Math.round((rank / total) * 100)) };
  }
  return m;
})();
/** 급식(영유아 표준식단) 출현 순위 — topPct=상위 N%(동률 안전), pct=등장률%. 표기 별칭 해소 후 조회. 미수록(매칭 실패)은 null(0을 '꼴등'으로 위장 금지). */
export function youaRankOf(ing: string): { rank: number; total: number; pct: number; topPct: number } | null {
  return YOUA_RANK[ing] ?? YOUA_RANK[ING_YOUA_ALIAS[ing]] ?? null;
}
// ⭐ '또래 급식에도 자주 오른다'고 안심 톤으로 말할 최소 등장률(이사님 2026-06-19: 서열·등수·% 노출 금지). 미만/미수록은 근거 절 생략(근거 없으면 안 넣음).
const YOUA_COMMON_PCT = 50;
/** 부모 노출용 급식 안심 문구(서열·% 없음). 충분히 흔한 재료만 '익숙하다'고, 아니면 빈 문자열(degrade). */
export const youaReassuranceFor = (ing: string): string => {
  const yr = youaRankOf(ing);
  return yr && yr.pct >= YOUA_COMMON_PCT ? '또래 급식에도 자주 오르는 익숙한 재료' : '';
};
/** 확신 liked가 적을 때의 추천 앵커 시드 — Tier2(자주 차려진=servedIngredients) → Tier3(youa 급식 고빈도). 중복·간식채널(과일/유제품) 제외·식품군 인식만. */
export function coldStartSeed(servedIngredients: string[], max = 6): string[] {
  const out: string[] = []; const seen = new Set<string>();
  for (const s of [...(servedIngredients || []), ...YOUA_TOP]) {
    const g = s && groupOfIngredient(s);
    if (!g || seen.has(s) || g === '과일') continue;   // 간식채널(과일)은 끼니 추천 앵커 제외(SNACK_CHANNEL 동치·순환 import 회피)
    seen.add(s); out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export type IngredientPool = { pool: string[]; mode: 'supply' | 'challenge' | 'mixed'; reason: string };
/**
 * ⭐ 주간 추천 식재료 풀(이사님 2026-06-14): 주간 계획 시 '먹으면 좋을 식재료 5개'를 영양 거울 기반으로 선정 →
 *   일일은 이 풀을 '돌아가며' 추천(같은 식재료 연속 금지·6/2·6/3 콩 반복 방지).
 *   선정 규칙: ① 영양이 많이 무너질수록(red 2+) '보급 위주' — 결핍군 대표 식재료(채소·심각도 우선).
 *   ② 영양 균형 OK면 '도전' — 잘 먹는 것의 검증된 사촌(푸드체이닝) + 아직 안 먹는 인기 식재료.
 *   ③ 그 사이면 혼합. 전부 사촌(food-graph bridge) 고려. 과일·유제품(간식채널) 제외. 순수 함수.
 */
export function buildIngredientPool(args: { signals: { group: string; level: string; weeklyEst: number }[]; likedIngredients: string[]; freqMap?: FreqMap; max?: number }): IngredientPool {
  const max = args.max ?? 5;
  const likedSet = new Set((args.likedIngredients || []).filter(Boolean));
  const meal = (args.signals || []).filter((s) => MEAL_GROUPS.includes(s.group));
  const vegBonus = (g: string) => (g === '비타민A채소' || g === '기타채소' ? -5 : 0);
  // ⭐ 1-A(이사님 2026-06-15) — 결핍 '상위 3군'만 추천(영양 거울 6군 전부에 흩뿌리면 매일 다른 군이라 초점이 흐려짐).
  //   심각도순(red 먼저·채소 가점·주간추정 적은 순) 정렬 후 top3. red도 이 3군 안에서만 세 mode 결정.
  const nonGreen = meal.filter((s) => s.level !== 'green')
    .sort((a, b) => ((a.level === 'red' ? 0 : 10) + vegBonus(a.group) + a.weeklyEst) - ((b.level === 'red' ? 0 : 10) + vegBonus(b.group) + b.weeklyEst))
    .slice(0, 3);
  const red = nonGreen.filter((s) => s.level === 'red');
  const pool: string[] = [];
  const add = (x?: string | null) => { if (x && !pool.includes(x) && pool.length < max) pool.push(x); };
  const cousinsOfLiked = () => { const out: string[] = []; for (const lk of (args.likedIngredients || []).slice(0, 8)) for (const c of verifiedCousinsOf(lk)) if (!likedSet.has(c.nm) && groupOfIngredient(c.nm) && MEAL_GROUPS.includes(groupOfIngredient(c.nm)!)) out.push(c.nm); return out; };

  let mode: IngredientPool['mode'];
  if (red.length >= 2) {
    mode = 'supply';   // 많이 무너짐 → 결핍군 대표 보급(심각도순 라운드로빈)
    const reps = nonGreen.map((s) => (GROUP_INGREDIENTS[s.group] || []).filter(Boolean));
    for (let i = 0; pool.length < max && reps.some((r) => r[i]); i++) for (const r of reps) add(r[i]);
  } else if (red.length === 0 && nonGreen.length <= 1) {
    mode = 'challenge';   // 균형 OK → 사촌(푸드체이닝) + 아직 안 먹는 도전
    for (const c of cousinsOfLiked()) add(c);
    for (const s of nonGreen) for (const r of (GROUP_INGREDIENTS[s.group] || [])) if (!likedSet.has(r)) add(r);
  } else {
    mode = 'mixed';   // 1 red 또는 yellow 多 → 보급 + 사촌 도전 섞기
    for (const s of nonGreen) { const r = (GROUP_INGREDIENTS[s.group] || []).find((x) => !likedSet.has(x)) || (GROUP_INGREDIENTS[s.group] || [])[0]; add(r); }
    for (const c of cousinsOfLiked()) add(c);
  }
  if (!pool.length) for (const s of nonGreen) for (const r of (GROUP_INGREDIENTS[s.group] || [])) add(r);   // 폴백
  return { pool: pool.slice(0, max), mode, reason: `${mode}(red ${red.length}·결핍군 ${nonGreen.length})` };
}

export type RecoFacts = { target: string | null; cousins: string[]; lines: string[]; text: string };

/**
 * 추천 사실 블록 — (a) 타깃(부족 식품군) 대표 식재료의 인기 음식 + 잘 먹는 식재료와의 궁합,
 * (b) 잘 먹는 식재료 → 사촌(+그 사촌의 인기 음식)·궁합. 전부 테이블 근거(편지는 이 목록 밖을 지어내지 않는다).
 */
export function buildRecoFacts(args: { likedIngredients: string[]; target?: string | null; targetIngredient?: string | null; freqMap?: FreqMap; suppressCousins?: boolean }): RecoFacts {
  const liked = (args.likedIngredients || []).slice(0, 8);
  const likedSet = new Set(liked);
  const lines: string[] = [];
  const cousins: string[] = [];

  // (a) 타깃 — 오늘의 추천 식재료의 인기 음식 + 잘 먹는 식재료와의 궁합.
  //   ⭐ targetIngredient(주간 풀에서 일일 회전된 식재료)가 오면 그것을 쓴다(매일 그룹 첫 대표=두부 반복 방지·6/2·6/3 콩 사고).
  //   없으면 기존대로 target 그룹의 첫 대표(하위호환).
  const headCandidates = args.targetIngredient
    ? [args.targetIngredient]
    : (args.target && GROUP_INGREDIENTS[args.target] ? GROUP_INGREDIENTS[args.target] : []);
  for (const ing of headCandidates) {
    const dishes = popularDishesFor(ing, args.freqMap);
    if (!dishes.length && !STAPLE_FORMS[ing]) continue;
    const grp = args.target || groupOfIngredient(ing) || '오늘';
    const pairWithLiked = [...new Set(safeGarnishOf(ing).filter((n) => likedSet.has(n.nm)).slice(0, 3).map((n) => stapleDisplay(n.nm)))].slice(0, 2);   // 강한 궁합만(tray/매운/교차괴식 제외)·주식은 먹는 형태
    const dishStr = (dishes.length ? dishes : (STAPLE_FORMS[ing] || [])).join('·');
    // ⭐ 급식 안심 근거(이사님 2026-06-19) — 서열·등수·% 금지, '익숙한 재료'라는 안심 톤만. 충분히 흔한 재료만, 근거 없으면 절 생략(degrade).
    const evid = youaReassuranceFor(ing) ? ` · ${youaReassuranceFor(ing)}` : '';
    lines.push(`[오늘 타깃 ${grp}] ${cookedName(ing)} (또래 인기 음식: ${dishStr}${pairWithLiked.length ? ` · 잘 먹는 ${pairWithLiked.join('·')} 곁들이면 좋아요` : ''}${evid})`);   // ⭐ 조리법+식재료(찐 단호박) — 생물 오인 방지
    break;   // 오늘 추천 식재료 1개만
  }

  // (b) 잘 먹는 식재료 → 사촌(+그 사촌의 인기 음식)·궁합
  //   ⭐ F-18(2026-06-19) — 주간슬롯이 오늘 음식 타깃을 이미 정한 날(suppressCousins)은 part(b)를 생략한다.
  //   part(b)의 사촌(예: 감자→두부)이 슬롯 음식(단호박)과 경쟁해 본문이 두부로 회귀하던 근원(랄프위검 rank1). 슬롯이 곧 푸드체이닝 타깃이므로 두 번째 체인은 불필요.
  for (const ing of (args.suppressCousins ? [] : liked)) {
    if (lines.length >= 4) break;
    if (isSpicyIngredient(ing) || KIMCHI_EXTRA.test(ing)) continue;   // ⭐ 김치류 앵커 제외 — "김치 → 궁합 X"는 '김치에 X 섞어라' 권유라 금지(이사님)
    const cs = verifiedCousinsOf(ing).filter((n) => !likedSet.has(n.nm) && !cousins.includes(n.nm)).slice(0, 1);   // 검증된 사촌만
    const pr = [...new Set(safeGarnishOf(ing).filter((n) => !likedSet.has(n.nm)).slice(0, 3).map((n) => stapleDisplay(n.nm)))].slice(0, 2);   // 강한 궁합만(tray/매운/교차괴식 제외)·주식은 먹는 형태
    if (!cs.length && !pr.length) continue;
    const parts: string[] = [];
    for (const c of cs) {
      cousins.push(c.nm);
      if (STAPLE_FORMS[c.nm]) { parts.push(`사촌 ${stapleDisplay(c.nm)}`); continue; }   // 주식 곡물 사촌 = 먹는 형태(빵·떡·밥)로만
      const dishes = popularDishesFor(c.nm, args.freqMap);
      parts.push(dishes.length ? `사촌 ${cookedName(c.nm)}(또래 인기: ${dishes.join('·')})` : `사촌 ${cookedName(c.nm)}`);   // ⭐ 조리법+식재료(찐 단호박)
    }
    if (pr.length) parts.push(`궁합 ${pr.join('·')}`);
    lines.push(`${stapleDisplay(ing)} → ${parts.join(' / ')}`);   // 앵커도 주식이면 먹는 형태(멥쌀→밥)로
  }

  return { target: args.target ?? null, cousins, lines, text: lines.join('\n') };
}
