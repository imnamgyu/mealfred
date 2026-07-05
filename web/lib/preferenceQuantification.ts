/**
 * lib/preferenceQuantification.ts — 선호계량화 모듈 (신호포착 · 이사님 2026-06-19)
 *
 * 진짜 연속성 천장 = '아이가 뭘 받아들이는지 모름'(ate_well 이진·미상 80%). 이 모듈이 수용 신호를
 * 식재료별 '선호 상태(liked/exploring/unknown/disliked)·확신도·추세'로 정량화해, 커리큘럼 졸업 판정과
 * 추천 앵커가 '확신 신호'에만 의존하게 한다(미상을 liked로 오판 차단).
 *
 * 설계(preference-quantification-engine.html): 수용 5단계 척도(0거부·1만짐/탐색·2한입·3조금·4완식)·
 *   집 필터(기관 급식 제외)·Wilson 하한·확신도·콜드스타트. 다축(식재료 우선·메뉴/조리형태는 후속).
 * 전부 순수 함수(DB·LLM·시계 의존 0 — asOf 인자). 크론/배치가 호출.
 */
import { normalizeIngredient } from './lexicon';

export type AcceptState = 'liked' | 'exploring' | 'unknown' | 'disliked';
export type FoodPref = {
  axis: 'ingredient';
  key: string;
  served: number; accepted: number; explored: number; rejected: number; unknownN: number;
  acceptRate: number;   // accepted / (accepted+rejected) — 미상 제외
  score: number;        // Wilson 하한(확신도 보정 수용률 0~1)
  confidence: number;   // 0~1 (명시 신호 표본)
  state: AcceptState;
  trend: 'rising' | 'flat' | 'falling';
  lastSeen: string;
};
export type PrefRow = {
  log_date: string; place?: string | null;
  ingredients?: string[] | null;
  refused?: string | null;   // 남긴·거부 음식(칩 join 문자열) — 해당 식재료는 끼니 레벨 대신 '거부(0)'로 귀속
  ate_well?: boolean | null; acceptance_level?: number | null;
};

/** 수용 0~4 레벨 정규화 — acceptance_level(5단계) 우선, 없으면 ate_well 이진(true→4·false→0·null→미상). */
export function acceptanceLevel(r: { acceptance_level?: number | null; ate_well?: boolean | null }): number | null {
  if (typeof r.acceptance_level === 'number') return Math.max(0, Math.min(4, Math.round(r.acceptance_level)));
  if (r.ate_well === true) return 4;
  if (r.ate_well === false) return 0;
  return null;   // 미상(null) — '먹었는지 모름'은 liked도 disliked도 아님
}

/** Wilson 점수 하한(95%) — 표본이 적을수록 보수적(1/1 완식을 '확실히 좋아함'으로 단정 안 함). */
export function wilsonLower(pos: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const p = pos / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / d;
  return Math.max(0, Math.min(1, c));
}

const TH = { likedScore: 0.5, likedMin: 2, dislikedMin: 2, dislikedRate: 0.34, signalMin: 2, recentDays: 14, trendGap: 0.6 };

/** refused 문자열(칩 join) → 토큰 Set. 원형 + 렉시콘 정규화형(탕수육→돼지고기) 둘 다 —
 *  엔진 식재료는 정규화돼 있어 원형만으로는 요리명 거부가 주 식재료와 영영 안 만난다(거부가 수용으로 뒤집히는 미스매치 차단).
 *  과길이 토큰은 레거시 자유문장(공백제거 잔재) — 문장 속 식재료를 거부로 오귀속하지 않게 버린다. */
export function parseRefused(refused: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of String(refused || '').split(/[,，·]/)) {
    const t = raw.trim().replace(/\s/g, '');
    if (!t || t.length > 12) continue;
    out.add(t);
    const n = normalizeIngredient(t);
    if (n) out.add(n);
  }
  return out;
}
/** 이 식재료가 거부 목록에 걸리나 — 정확일치 or 토큰(메뉴명)이 식재료를 포함('브로콜리볶음'⊃'브로콜리').
 *  1글자 식재료(김·무·밤)는 정확일치만 — '김치'⊃'김' 같은 오탐 차단. */
export function refusedIng(ing: string, tokens: Set<string>): boolean {
  if (!tokens.size) return false;
  if (tokens.has(ing)) return true;
  if (ing.length < 2) return false;
  for (const t of tokens) if (t.includes(ing)) return true;
  return false;
}

/** 수용 신호 → 식재료별 선호 정량화. homeOnly(기본 true)=기관 급식 제외(부모 통제 영역만). */
export function quantifyPreferences(rows: PrefRow[], asOf: string, opt?: { homeOnly?: boolean }): FoodPref[] {
  const homeOnly = opt?.homeOnly !== false;
  const asOfMs = Date.parse(asOf);
  const agg: Record<string, { served: number; acc: number; exp: number; rej: number; unk: number; last: string; recent: number[]; early: number[] }> = {};
  for (const r of rows) {
    if (homeOnly && r.place === 'daycare') continue;
    const mealLvl = acceptanceLevel(r);
    const refusedTokens = parseRefused(r.refused);
    const daysAgo = Math.round((asOfMs - Date.parse(r.log_date)) / 86400000);
    for (const ing of (r.ingredients || [])) {
      if (!ing) continue;
      // ⭐ 혼합 끼니 귀속 — 끼니 레벨은 그 끼니의 '분위기'일 뿐. refused로 특정된 식재료는 거부(0)로.
      //   "완식인데 브로콜리만 남김"에서 브로콜리가 liked로 오집계되던 것 차단(모듈 핵심 약속 = 오판 방지).
      const lvl = refusedIng(ing, refusedTokens) ? 0 : mealLvl;
      const a = (agg[ing] ||= { served: 0, acc: 0, exp: 0, rej: 0, unk: 0, last: '', recent: [], early: [] });
      a.served++;
      if (lvl == null) a.unk++;
      else if (lvl >= 3) a.acc++;       // 3조금·4완식 = 수용
      else if (lvl === 0) a.rej++;      // 0거부
      else a.exp++;                     // 1만짐·2한입 = 탐색(진전의 증거)
      if (r.log_date > a.last) a.last = r.log_date;
      if (lvl != null) (daysAgo <= TH.recentDays ? a.recent : a.early).push(lvl);
    }
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null);
  return Object.entries(agg).map(([key, a]) => {
    const decided = a.acc + a.rej;          // 명시 수용/거부(탐색·미상 제외)
    const signal = a.acc + a.rej + a.exp;   // 명시 신호(미상 제외)
    const acceptRate = decided > 0 ? a.acc / decided : 0;
    const score = wilsonLower(a.acc, decided);
    const confidence = Math.min(1, signal / 3);
    let state: AcceptState;
    if (signal < TH.signalMin) state = 'unknown';
    else if (a.rej >= TH.dislikedMin && acceptRate < TH.dislikedRate) state = 'disliked';
    else if (a.acc >= TH.likedMin && score >= TH.likedScore) state = 'liked';
    else state = 'exploring';
    const rAvg = avg(a.recent), eAvg = avg(a.early);
    const trend: FoodPref['trend'] = (rAvg != null && eAvg != null)
      ? (rAvg > eAvg + TH.trendGap ? 'rising' : rAvg < eAvg - TH.trendGap ? 'falling' : 'flat') : 'flat';
    return { axis: 'ingredient' as const, key, served: a.served, accepted: a.acc, explored: a.exp, rejected: a.rej, unknownN: a.unk, acceptRate, score, confidence, state, trend, lastSeen: a.last };
  }).sort((x, y) => y.score - x.score || y.served - x.served);
}

/** 확신 liked 식재료(추천 앵커·콜드스타트 게이트·칭찬 근거) — state==='liked'만(미상·탐색 제외). */
export function confidentLiked(prefs: FoodPref[]): string[] { return prefs.filter((p) => p.state === 'liked').map((p) => p.key); }
/** 탐색 중(진전의 증거 — 만짐·한입) — 커리큘럼이 '받아들이기 시작' 진척으로 인정할 후보. */
export function exploringFoods(prefs: FoodPref[]): string[] { return prefs.filter((p) => p.state === 'exploring').map((p) => p.key); }
/** 확실히 거부 — 재노출 타깃에서 잠시 빼거나 푸드체이닝 우회 대상. */
export function dislikedFoods(prefs: FoodPref[]): string[] { return prefs.filter((p) => p.state === 'disliked').map((p) => p.key); }
