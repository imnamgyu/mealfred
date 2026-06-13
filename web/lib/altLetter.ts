/**
 * lib/altLetter.ts — coach_letters.context.altLetter(Letter B) 안전 추출 순수 함수 (WBS v2-하이브리드 EPIC F · F-01)
 *
 * 크론(app/api/cron/coach/route.ts)이 compare 자녀에게만 `context.altLetter`를 합본 저장한다(스키마 변경 0).
 * 페이로드는 3종: ok({letter,oneliner,design,designMeta,mirror,materials,...}) · {failed,reason} · {skipped,reason}.
 * 렌더 레이어(app/page.tsx·CompareLetterCard)가 raw jsonb를 직접 만지지 않게, 여기서 검증해 카드 후보만 반환한다.
 *
 * ⭐ 무영향 원칙: altLetter가 없거나(다른 자녀)·실패/스킵·letter 비유효 → null → 단일 카드(Letter A) 그대로.
 * 부수효과 0: 입력 context를 변형하지 않고 읽기만 한다(순수 함수).
 */

/** materials 요약본 — 크론이 저장하는 AltLetterDesignMaterials와 동형(어드민·디버그 보조). 형식 불량은 통째 null. */
export type AltLetterMaterials = {
  food: string | null;
  reason: string;
  targetGroup: string | null;
  combos: { dish: string; ingredient: string; score: number }[];
  reasonPhrases: string[];
};

/** 비교 카드(Letter B) 렌더에 필요한 최소 필드만 정규화한 형태. letter가 유효할 때만 생성. */
export type AltLetter = {
  letter: string;
  oneliner: string | null;
  design: string | null;
  mirror: string | null;
  materials: AltLetterMaterials | null;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** materials가 기대 shape일 때만 통과(food/targetGroup은 string|null, combos·reasonPhrases는 배열). 아니면 null. */
function pickMaterials(v: unknown): AltLetterMaterials | null {
  if (!isObj(v)) return null;
  const reason = typeof v.reason === 'string' ? v.reason : null;
  if (reason === null) return null;   // reason은 필수(요약본의 핵심) — 없으면 형식 불량으로 간주
  const combosRaw = v.combos;
  const combos = Array.isArray(combosRaw)
    ? combosRaw.filter((c): c is { dish: string; ingredient: string; score: number } =>
        isObj(c) && typeof c.dish === 'string' && typeof c.ingredient === 'string' && typeof c.score === 'number')
    : [];
  const phrasesRaw = v.reasonPhrases;
  const reasonPhrases = Array.isArray(phrasesRaw) ? phrasesRaw.filter((p): p is string => typeof p === 'string') : [];
  return {
    food: typeof v.food === 'string' ? v.food : null,
    reason,
    targetGroup: typeof v.targetGroup === 'string' ? v.targetGroup : null,
    combos,
    reasonPhrases,
  };
}

/**
 * context.altLetter에서 Letter B를 안전 추출. letter가 실제 비어있지 않은 문자열일 때만 반환(빈 카드 방지).
 * failed/skipped 페이로드는 letter 키가 없으므로 자연히 null(둘째 카드 생략).
 */
export function pickAltLetter(context: Record<string, unknown> | null | undefined): AltLetter | null {
  if (!isObj(context)) return null;
  const alt = context.altLetter;
  if (!isObj(alt)) return null;   // altLetter 누락·null·비객체(문자열 등) → null
  const letter = alt.letter;
  if (typeof letter !== 'string' || letter.trim().length === 0) return null;   // letter 비유효(빈/공백/비문자열) → null
  return {
    letter,
    oneliner: typeof alt.oneliner === 'string' && alt.oneliner.length > 0 ? alt.oneliner : null,
    design: typeof alt.design === 'string' ? alt.design : null,
    mirror: typeof alt.mirror === 'string' && alt.mirror.length > 0 ? alt.mirror : null,
    materials: pickMaterials(alt.materials),
  };
}
