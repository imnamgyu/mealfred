/**
 * lib/ingredientFreq.ts — 식재료 급식빈도·상위% 순수 로더 (WBS EPIC I · I-02).
 *
 * scripts/build-ingredient-freq.py가 산출한 lib/ingredient-freq.json(빌드타임 import)을
 * 엔진이 안전하게 읽도록 하는 순수 로더. C 에픽 4기준 랭킹·D5 근거 문구가
 * 식재료의 급식빈도·상위%를 **동일 API**로 쓰게 한다(죽은 코드 방지·단일 진실원).
 *
 * 데이터 = 인계서 실측표(learned_menus 1000개·전체 분포 상위%) = coachMaterials GIO_FREQ와 동일 값.
 *   당근 freq184·상위2% / 근대 freq11·상위39% / 단호박·요거트=0회→미수록(null).
 *
 * 순수 함수 — fs/HTTP·시계·LLM 불사용(빌드타임 정적 import). 부수효과 없음.
 *   0회(단호박)를 '상위 100%'로 위장하지 않는다 — 미수록은 정직하게 null.
 */
import RAW from './ingredient-freq.json';

export type IngredientFreq = { freq: number; rank: number; topPct: number };

const FREQ = RAW as Record<string, IngredientFreq>;

/** 식재료의 급식빈도 메타 { freq, rank, topPct }. 미수록(0회·단호박·요거트)은 null. */
export function freqOf(nm: string): IngredientFreq | null {
  if (!nm) return null;
  const key = nm.trim();
  if (!key) return null;
  const v = FREQ[key];
  // 방어: freq>0만 유효(0회는 산출에서 빠지지만, 만에 하나 0이 들어와도 null)
  return v && v.freq > 0 ? v : null;
}

/** 급식 상위 백분위(%). 미수록은 null(0회를 '상위 100%'로 위장 금지). */
export function topPctOf(nm: string): number | null {
  const v = freqOf(nm);
  return v ? v.topPct : null;
}

/** 흔한 식재료인가 = topPct<=pctMax 이고 freq>0(미수록은 흔함 아님). 기본 임계 상위 20% 이내. */
export function isCommon(nm: string, pctMax = 20): boolean {
  const v = freqOf(nm);
  return !!v && v.topPct <= pctMax;
}
