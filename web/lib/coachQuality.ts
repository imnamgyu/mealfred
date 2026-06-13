/**
 * lib/coachQuality.ts — Letter B 발행전 '품질축' 결정론 스캐너 (WBS v2-하이브리드 EPIC D)
 *
 * 사상(인계서 G·H): 근본원인 ①'검증 게이트가 그린이어도 좋은 편지가 아니다'(품질축 0줄 미검사)와
 *   ②'거울·추천 슬롯이 발행 직전 가드를 우회한다'(무검증 채널)를 닫는다.
 *   - (G) LLM 출력의 굳은 클리셰 은유·데이터 나열(영수증화)·모호 기간어·재료 밖 음식명(괴식 입구)을
 *         결정론 정규식으로 검출 → 위반이면 EPIC C가 재생성한다.
 *   - (H) 본문+거울+추천을 합본(combineForVerify)해 슬롯값도 같은 검사망에 올린다.
 *
 * 전부 순수 함수 — fs/HTTP·시계·LLM 불사용. lib/coach.ts의 FORBID_TIME/fruitSaltyMix와 동일한
 *   '문장 분리 + 정규식 검출' 패턴을 따른다. coach.ts·route.ts는 무변경 — 이 파일은 순수 함수만 export하고
 *   배선(composeLetterB 재생성 루프)은 EPIC C의 몫이다.
 *
 * ⚠️ 오탐 방지가 생명: 따뜻한 은유 1회·1회 사실 인용·수치 동반 기간어는 정상 편지의 자산이므로 통과시킨다.
 *   '과용'(은유 2종+ 또는 반복)·'나열'(2문장+)·'수치 없는 모호어'만 위반으로 본다.
 *
 * 원자: D-01 metaphorOveruse · D-02 mealEnumeration · D-03 vagueTimeWord ·
 *       D-04 offMaterialFood · D-05 letterQualityBad/letterQualityScan · D-06 combineForVerify.
 */

// ── 튜닝 상수(임계) — 한 곳에서 조정 ──────────────────────────────────────────────
/** D-01: 서로 다른 클리셰 은유 종류가 이 값을 '초과'하면 과용(기본 1 → 2종 이상 위반). */
export const DISTINCT_METAPHOR_MAX = 1;
/** D-01: 같은 클리셰 은유가 이 값을 '초과'해 등장하면 과용(기본 1 → 같은 은유 2회 이상 위반). */
export const SAME_METAPHOR_MAX = 1;
/** D-02: '{시점어}{음식}먹었어요' 류 나열 문장이 이 값을 '초과'하면 나열 패턴(기본 1 → 2문장 이상 위반). */
export const ENUM_MAX = 1;
/** D-03: 모호 기간어 직후 이 글자수 윈도우 안에 수치 단위가 있으면 면제(예 '최근 7일'). */
const VAGUE_NUMBER_WINDOW = 12;

// ── 문장 분리(coach.ts 패턴 재사용) ───────────────────────────────────────────────
function splitSentences(L: string): string[] {
  return (L || '').split(/[.!?。\n]/);
}

// ── D-01 — 은유 클리셰 사전 + metaphorOveruse(L) ──────────────────────────────────
/**
 * 인계서 G의 클리셰 은유 사전을 근거화. v3가 '통장에 적금 쌓듯 계단을 오르듯' 류로 수렴하던 것을 검출.
 * ⚠️ 동음 오탐 가드: '문'은 '문득/방문/주문/질문/문제/문의'를 배제하고 '문을 열-' 형태로만,
 *   '길'은 '길어/길게/기다림'을 배제하고 '새로운 길·먹는 길·길을 걷-·여정'으로만 한정한다.
 */
export const METAPHOR_CLICHES: { key: string; re: RegExp }[] = [
  { key: '통장', re: /통장|적금|저금/g },
  // '문' 은유: '문을 열-/문이 열-/마음의 문/작은 문' 형태만. 문득·방문·주문·질문·문제·문의·전문 등은 제외.
  { key: '문', re: /(?<![가-힣])(?:작은\s*문|마음의\s*문|문)\s*(?:을|이|하나)?\s*(?:열|연|여는|열어|열렸|열며)/g },
  { key: '계단', re: /계단/g },
  // '걸음' 은유: 한 걸음·발걸음·걸음씩. '걸음' 단독·'한 걸음씩'은 코칭 상투구라 비중 큼.
  { key: '걸음', re: /걸음/g },
  { key: '무대', re: /무대/g },
  { key: '디딤돌', re: /디딤돌/g },
  { key: '사슬', re: /사슬|체인/g },
  // '길/여정' 은유: '새로운 길·먹는 길·이 길·함께 걷는 길·길을 걷-·여정'. 길어/길게/길어지 등 형용사는 제외.
  //   '함께 걷는 길이에요'의 '길이'는 길이(length)가 아니라 길+copula라 허용 매칭(앞에 걷는/걸어가는 동반).
  { key: '길', re: /여정|(?:걷는|걸어가는|함께\s*가는)\s*길|(?:새로운|먹는|그)\s*길(?![어게])|길(?![어게이])\s*(?:을|에서)\s*(?:걷|걸|함께|나아|가)/g },
  { key: '풍경', re: /풍경/g },
];

/**
 * 굳은 클리셰 은유의 '과용'을 검출 — true면 재생성 트리거.
 * (1) 서로 다른 클리셰 key가 DISTINCT_METAPHOR_MAX(1)종을 초과(2종+) 매칭 → true.
 * (2) 같은 key가 SAME_METAPHOR_MAX(1)회를 초과(2회+) 등장 → true.
 * 단일 key 1회 등장은 false(따뜻한 비유는 자산 — 오탐 방지).
 */
export function metaphorOveruse(L: string): boolean {
  const text = L || '';
  if (!text) return false;
  let distinct = 0;
  for (const { re } of METAPHOR_CLICHES) {
    const m = text.match(re);
    const count = m ? m.length : 0;
    if (count > SAME_METAPHOR_MAX) return true;   // 같은 은유 반복
    if (count > 0) distinct++;
  }
  return distinct > DISTINCT_METAPHOR_MAX;          // 서로 다른 은유 2종+ 동시
}

// ── D-02 — '어제 X 먹었어요' 나열 패턴 mealEnumeration(L) ──────────────────────────
const AGO_WORD = /어제|그제|그저께|오늘|아침|점심|저녁|[0-9]+일\s*전/;
const ATE = /먹(었|었어요|었네요|음|고)|드셨|비웠|비웠어요|남겼|남겼어요/;
/**
 * 데이터 나열(거울 재서술로 편지가 영수증화)을 검출 — true면 재생성 트리거.
 *  - 한 문장에 시점어 + 섭취동사가 동시 매칭되는 문장이 ENUM_MAX(1)를 초과(2문장+)하면 나열 → true.
 *  - 또는 한 문장에 시점어 + (쉼표/가운뎃점 구분 명사 3개+) + 섭취동사 = 나열 → true.
 * 단발 사실 인용 1회는 허용(품질 좋은 편지의 정상 요소). FORBID_TIME(coach.ts·환각 기간)과 역할 분리.
 */
export function mealEnumeration(L: string): boolean {
  const text = L || '';
  if (!text) return false;
  const sentences = splitSentences(text);
  let enumSentences = 0;
  for (const s of sentences) {
    if (!AGO_WORD.test(s) || !ATE.test(s)) continue;
    enumSentences++;
    // 쉼표/가운뎃점으로 명사 3개+ 나열 + 끝에 섭취동사(시점어 동반) = 단문 1개로도 나열
    const listItems = s.split(/[,，·、]/).filter((p) => /[가-힣]/.test(p)).length;
    if (listItems >= 3) return true;
  }
  return enumSentences > ENUM_MAX;
}

// ── D-03 — 모호 기간어 vagueTimeWord(L) (FORBID_TIME과 분리) ───────────────────────
const VAGUE_TIME = /요즘|요새|근래|최근|이번\s*주|얼마\s*전|한동안|당분간|며칠째/g;
const NUMBER_UNIT = /[0-9]+\s*(일|번|회|가지)/;
/**
 * 수치 없는 정성 기간어('요즘·최근·한동안…')를 검출 — true면 재생성 트리거.
 *  코드가 '최근 7일 중 3일'처럼 수치를 재료로 줬는데 LLM이 모호어로 뭉개면 위반.
 *  ⚠️ 면제: 매칭 직후 VAGUE_NUMBER_WINDOW(12)자 안에 수치 단위(N일/번/회/가지)가 있으면 허용('최근 7일'=OK).
 *  FORBID_TIME(coach.ts:379 — 지난달·N개월·N일간 환각 기간)과 역할 중복 없음(이건 수치 없는 정성어만).
 */
export function vagueTimeWord(L: string): boolean {
  const text = L || '';
  if (!text) return false;
  VAGUE_TIME.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAGUE_TIME.exec(text)) !== null) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + VAGUE_NUMBER_WINDOW);
    if (!NUMBER_UNIT.test(after)) return true;   // 수치 동반 없음 = 모호어 위반
  }
  return false;
}

// ── D-04 — 재료 밖 음식명 스캔 offMaterialFood(L, allowed) ─────────────────────────
// 조리 음식명 후보 추출. '면'은 한국어 조건 어미(-면: 드시면·보여주면…)와 동음이라 bare '면'을 쓰지 않고
//   실제 면류(국수·라면·냉면…)만 별도 토큰으로 잡는다(verb -면 과탐 차단 — 오탐 방지).
const DISH_SUFFIX = /([가-힣]{0,4}(?:칼국수|잔치국수|국수|라면|냉면|비빔면|짜장면|쫄면|소면|당면|우동|짬뽕)|[가-힣]{1,6}(?:찌개|탕|볶음|구이|조림|찜|밥|죽|전|무침|나물|샐러드|스프|수프|파스타|빵|떡|두부|국))/g;
/** 일반 명사 단독은 면제(구체 음식명만 검사 — '밥/국/죽'은 환각 음식명이 아니라 일상어). '두부'는 식재료라 단독 면제(마파두부 등 복합어는 검사). */
const ALLOW_GENERIC = new Set(['밥', '국', '죽', '탕', '빵', '떡', '전', '두부', '반찬', '간식', '식사', '끼니']);
// ⚠️ 한자어 동음 오탐 차단(HB-FINDING·엣지 복리) — '전(부침)·국(국물)' 접미사가 비음식 추상어를 false-positive로 잡던 버그.
//   예: '도전·발전·완전·안전·직전·예전' / '전국·완전·결국·중국·한국'. 코칭 산문(근거 문구 "도전해볼 만해요" 등)에 흔해 불필요한 재생성을 유발했다.
const NON_FOOD_WORDS = new Set([
  '도전', '발전', '작전', '실전', '회전', '역전', '사전', '이전', '오전', '운전', '안전', '정전', '직전', '예전', '충전', '완전', '호전', '진전', '관전', '대전',
  '전국', '한국', '미국', '영국', '중국', '천국', '결국', '약국', '본국', '모국', '외국', '각국', '전국적',
]);
/**
 * 편지에서 조리 음식명 후보를 뽑아, allowed(코드가 LLM에 준 인기음식·궁합·사촌·favoriteFoods·STAPLE 표시)
 *   화이트리스트 밖인 것을 위반 목록으로 반환. 빈 배열 = 통과.
 *  화이트리스트 대조 방식이라 임의 코퍼스 스캔의 오탐을 피한다(allowed가 비면 전부 위반 — 호출자가 안전 skip).
 *  매칭은 allowed 원소가 음식명과 같거나 음식명을 포함하면 통과(예 allowed '고등어무조림'이 '고등어무조림' 통과).
 *  ⚠️ 역방향(음식명이 allowed를 포함)은 통과로 보지 않는다 — '당근미역국'이 '미역국'을 품어도 괴식 합성어는 위반.
 *  접미사 없는 식재료명(당근·시금치)은 추출 대상이 아니라 과탐하지 않는다.
 */
export function offMaterialFood(L: string, allowed: string[]): string[] {
  const text = L || '';
  if (!text) return [];
  const allow = (allowed || []).filter(Boolean).map((a) => a.replace(/\s+/g, ''));
  const out: string[] = [];
  const seen = new Set<string>();
  DISH_SUFFIX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DISH_SUFFIX.exec(text)) !== null) {
    const dish = m[1];
    if (ALLOW_GENERIC.has(dish)) continue;                       // 일반명사 단독 면제
    if (NON_FOOD_WORDS.has(dish)) continue;                      // 한자어 동음 추상어 면제(도전·전국 등 — HB-FINDING)
    if (seen.has(dish)) continue; seen.add(dish);
    const ok = allow.some((a) => a === dish || a.includes(dish));
    if (!ok) out.push(dish);
  }
  return out;
}

// ── D-05 — 통합 품질 스캐너 letterQualityScan / letterQualityBad ───────────────────
export type QualityScan = { bad: boolean; reasons: string[] };
/**
 * D-01~D-04를 OR로 합쳐 위반 사유(한국어)를 모은다. reasons는 EPIC C의 verify hint·fixNotes로 재사용.
 *  opts.allowedFoods 미제공 시 offMaterialFood 검사를 생략한다(allowed 없으면 전부 위반=과탐 → 안전 skip).
 */
export function letterQualityScan(letter: string, opts?: { allowedFoods?: string[] }): QualityScan {
  const L = letter || '';
  const reasons: string[] = [];
  if (metaphorOveruse(L)) reasons.push('은유 과용');
  if (mealEnumeration(L)) reasons.push('데이터 나열');
  if (vagueTimeWord(L)) reasons.push('모호 기간어(수치로)');
  if (opts && Array.isArray(opts.allowedFoods)) {
    const off = offMaterialFood(L, opts.allowedFoods);
    if (off.length) reasons.push('목록 밖 음식: ' + off.join('·'));
  }
  return { bad: reasons.length > 0, reasons };
}

/**
 * letterQualityScan(...).bad 단축 — letterDeterministicBad(coach.ts)와 대칭으로 쓰는 단일 진입점.
 *  EPIC C가 composeLetterB 재생성 루프에서 호출한다(merged 합본 텍스트를 넘김).
 */
export function letterQualityBad(letter: string, opts?: { allowedFoods?: string[] }): boolean {
  return letterQualityScan(letter, opts).bad;
}

// ── D-06 — 검증 합본 입력 빌더 combineForVerify / composeVerifiableText ────────────
/**
 * 본문+거울+추천 슬롯을 줄바꿈으로 합본해 단일 검증 텍스트를 만든다(무검증 채널 봉합 — 인계서 H).
 *  EPIC C가 이 합본을 verifyLetter·letterQualityBad·letterDeterministicBad에 넘겨, 본문뿐 아니라
 *  거울(buildMealMirror)·추천(bridgeFacts) 슬롯값도 검사망에 올린다.
 *  ⚠️ 합본은 '검증 입력'에만 쓰고 실제 발행 본문(letter)은 변형하지 않는다 — 통과 후 각 슬롯 그대로 저장.
 */
export function combineForVerify(body: string, parts?: { mirror?: string | null; recommendations?: string[] | null }): string {
  const recoText = parts?.recommendations && parts.recommendations.length
    ? parts.recommendations.filter(Boolean).join('\n')
    : null;
  return [body, parts?.mirror, recoText].filter(Boolean).join('\n');
}

/**
 * combineForVerify의 명세(D-06) 시그니처 별칭 — recoText를 단일 문자열로 받는 형태.
 *  EPIC C 배선 편의를 위해 둘 다 제공(둘은 같은 합본 규칙).
 */
export function composeVerifiableText(p: { letter: string; mirror?: string | null; recoText?: string | null }): string {
  return [p.letter, p.mirror, p.recoText].filter(Boolean).join('\n');
}
