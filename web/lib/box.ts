/**
 * lib/box.ts — 개인맞춤 '극다품종 소량' 주간 박스 배합 알고리즘.
 *
 * 아이 분석(안 먹어본 것·부족 영양소·빈약 식품군·기관에서 거부)으로 그 주 보낼 식재료를 고른다.
 * 원칙: ① 부족을 메우되 ② 다품종 소량(한 종류 듬뿍 X) ③ Satter/SOS — 부담 0, 강요 X(노출 기회만).
 *   - 우선순위: 빈약 식품군의 안 먹어본 필수 > 빈약군 권장 > 기관 거부 재노출(소량) > 다양성 채움
 *   - 식품군 라운드로빈으로 골고루(한 군에 몰리지 않게). 매운 식재료 제외.
 */

export type PoolItem = { nm: string; cat: string; grade: string; em?: string };
export type BoxReason = '결핍보강' | '필수도전' | '권장도전' | '거부재노출';
export type BoxItem = { nm: string; em: string; cat: string; reason: BoxReason };

export type BoxInput = {
  pool: PoolItem[];
  eaten: Set<string>;          // 이미 잘 먹는(또는 먹어본) 식재료
  weakCats?: string[];         // 빈약 식품군(카테고리) — 적게 먹은 순
  reds?: string[];            // 부족 영양소(라벨) — 결핍 보강 우선용
  nutrientsOf?: (nm: string) => string[];   // 식재료→영양소 (결핍 매칭용, 선택)
  daycareRefused?: string[];   // 기관에서 거부 → 집에서 소량 재노출
  size?: number;               // 박스 품종 수(기본 12 — 극다품종 소량)
};

const GRADE_RANK: Record<string, number> = { 필수: 0, 권장: 1, 향신료: 9 };

export function composeWeeklyBox(input: BoxInput): BoxItem[] {
  const { pool, eaten, reds = [], nutrientsOf, daycareRefused = [], size = 12 } = input;
  const weakCats = input.weakCats || [];
  const picked = new Set<string>();
  const out: BoxItem[] = [];
  const emOf: Record<string, string> = {};
  pool.forEach((p) => { if (p.em) emOf[p.nm] = p.em; });

  const add = (nm: string, cat: string, reason: BoxReason) => {
    if (picked.has(nm) || out.length >= size) return;
    picked.add(nm); out.push({ nm, em: emOf[nm] || '🍽', cat, reason });
  };

  // 향신료/매운 제외한 안 먹어본 후보
  const candidates = pool.filter((p) => !eaten.has(p.nm) && p.grade !== '향신료');

  // ① 결핍 영양소를 채우는 안 먹어본 식재료 (매칭 가능할 때)
  if (reds.length && nutrientsOf) {
    const redSet = new Set(reds);
    candidates
      .filter((p) => nutrientsOf(p.nm).some((n) => redSet.has(n)))
      .sort((a, b) => (GRADE_RANK[a.grade] ?? 2) - (GRADE_RANK[b.grade] ?? 2))
      .forEach((p) => add(p.nm, p.cat, '결핍보강'));
  }

  // ② 기관에서 거부한 식재료 → 집에서 소량 재노출 (풀에 있고 향신료 아님)
  daycareRefused.forEach((nm) => {
    const p = pool.find((x) => x.nm === nm && x.grade !== '향신료');
    if (p) add(p.nm, p.cat, '거부재노출');
  });

  // ③ 빈약 식품군 라운드로빈 — 군별 필수→권장 순으로 골고루
  const byCat: Record<string, PoolItem[]> = {};
  candidates.forEach((p) => { (byCat[p.cat] ||= []).push(p); });
  Object.values(byCat).forEach((arr) => arr.sort((a, b) => (GRADE_RANK[a.grade] ?? 2) - (GRADE_RANK[b.grade] ?? 2)));
  // 빈약 카테고리 우선, 나머지 뒤
  const cats = Object.keys(byCat).sort((a, b) => {
    const wa = weakCats.indexOf(a), wb = weakCats.indexOf(b);
    return (wa === -1 ? 99 : wa) - (wb === -1 ? 99 : wb);
  });
  for (let round = 0; out.length < size; round++) {
    let added = false;
    for (const c of cats) {
      const p = byCat[c][round];
      if (p && !picked.has(p.nm)) { add(p.nm, p.cat, p.grade === '필수' ? '필수도전' : '권장도전'); added = true; if (out.length >= size) break; }
    }
    if (!added) break;
  }
  return out;
}

export const BOX_REASON_META: Record<BoxReason, { label: string; color: string }> = {
  결핍보강: { label: '부족 영양 보강', color: '#C62828' },
  거부재노출: { label: '집에서 다시', color: '#C45A00' },
  필수도전: { label: '필수 도전', color: '#1B5E20' },
  권장도전: { label: '권장 도전', color: '#1565C0' },
};
