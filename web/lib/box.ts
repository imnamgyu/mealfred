/**
 * lib/box.ts — 개인맞춤 '극다품종 소량' 주간 박스 배합 알고리즘.
 *
 * 아이 분석(안 먹어본 것·부족 영양소·빈약 식품군·기관에서 거부)으로 그 주 보낼 식재료를 고른다.
 * 원칙: ① 부족을 메우되 ② 다품종 소량(한 종류 듬뿍 X) ③ Satter/SOS — 부담 0, 강요 X(노출 기회만).
 *   - 우선순위: 빈약 식품군의 안 먹어본 필수 > 빈약군 권장 > 기관 거부 재노출(소량) > 다양성 채움
 *   - 식품군 라운드로빈으로 골고루(한 군에 몰리지 않게). 매운 식재료 제외.
 */

import { isSpicyIngredient } from './spicy';

export type PoolItem = { nm: string; cat: string; grade: string; em?: string; must_eat?: boolean; must_eat_tier?: 'core' | 'good' };
export type BoxReason = '결핍보강' | '필수도전' | '권장도전' | '거부재노출';
export type BoxItem = { nm: string; em: string; cat: string; reason: BoxReason };

export type BoxInput = {
  pool: PoolItem[];
  eaten: Set<string>;          // 이미 잘 먹는(또는 먹어본) 식재료
  weakCats?: string[];         // 빈약 식품군(카테고리) — 적게 먹은 순
  reds?: string[];            // 부족 영양소(라벨) — 결핍 보강 우선용
  nutrientsOf?: (nm: string) => string[];   // 식재료→영양소 (결핍 매칭용, 선택)
  daycareRefused?: string[];   // 기관에서 거부 → 집에서 소량 재노출
  staleOf?: (nm: string) => number;   // 마지막 노출 후 일수(미경험=큰 값). 필수인데 오래 안 먹은 것 우선용
  size?: number;               // 박스 품종 수(기본 7 — 핵심 5 + 맛보기 2)
  coreSize?: number;           // 핵심 슬롯 수(기본 5): 결핍보강·거부재노출·필수도전. 나머지(size-coreSize)는 맛보기(권장도전)
};

// 우선순위 = 💎 영양 보석(core>good) 먼저 → 그 안에서 급식 빈도(자주>가끔>드물게). '꼭 챙길 영양'을 박스 1순위로.
const FREQ_RANK: Record<string, number> = { 자주: 0, 가끔: 1, 드물게: 2, 향신료: 9 };
const meRank = (p: PoolItem) => (p.must_eat ? (p.must_eat_tier === 'core' ? 0 : 1) : 2);
const rank = (p: PoolItem) => meRank(p) * 10 + (FREQ_RANK[p.grade] ?? 3);

export function composeWeeklyBox(input: BoxInput): BoxItem[] {
  const { pool, eaten, reds = [], nutrientsOf, daycareRefused = [], size = 7 } = input;
  const coreSize = Math.min(input.coreSize ?? 5, size);   // 핵심 5 + 맛보기 2 = 7
  const weakCats = input.weakCats || [];
  const picked = new Set<string>();
  const out: BoxItem[] = [];
  const emOf: Record<string, string> = {};
  pool.forEach((p) => { if (p.em) emOf[p.nm] = p.em; });

  const add = (nm: string, cat: string, reason: BoxReason, cap: number) => {
    if (picked.has(nm) || out.length >= cap) return;
    picked.add(nm); out.push({ nm, em: emOf[nm] || '🍽', cat, reason });
  };

  // 향신료/매운 제외한 안 먹어본 후보 (고추·김치 등 매운 식재료는 grade와 무관하게 제외 — box-product '매운 건 안 와요' 약속)
  const candidates = pool.filter((p) => !eaten.has(p.nm) && p.grade !== '향신료' && !isSpicyIngredient(p.nm));

  // 카테고리 라운드로빈 헬퍼 — 군별 다양성(한 군에 몰리지 않게), 빈약군 우선
  const roundRobin = (items: PoolItem[], reason: (p: PoolItem) => BoxReason, cap: number) => {
    const byCat: Record<string, PoolItem[]> = {};
    items.forEach((p) => { (byCat[p.cat] ||= []).push(p); });
    // 군별 정렬: 영양 보석 먼저 → 같은 우선순위면 '안 먹은 지 오래된(또는 미경험)' 순
    Object.values(byCat).forEach((arr) => arr.sort((a, b) => {
      const g = rank(a) - rank(b);
      return g !== 0 ? g : (input.staleOf?.(b.nm) ?? 999) - (input.staleOf?.(a.nm) ?? 999);
    }));
    const cats = Object.keys(byCat).sort((a, b) => {
      const wa = weakCats.indexOf(a), wb = weakCats.indexOf(b);
      return (wa === -1 ? 99 : wa) - (wb === -1 ? 99 : wb);
    });
    for (let round = 0; out.length < cap; round++) {
      let added = false;
      for (const c of cats) {
        const p = byCat[c][round];
        if (p && !picked.has(p.nm)) { add(p.nm, p.cat, reason(p), cap); added = true; if (out.length >= cap) break; }
      }
      if (!added) break;
    }
  };

  // ── 핵심(core) 슬롯 5: ① 결핍보강 → ② 거부재노출 → ③ 필수도전(must-eat) ──
  // ① 결핍 영양소를 채우는 안 먹어본 식재료 (매칭 가능할 때)
  if (reds.length && nutrientsOf) {
    const redSet = new Set(reds);
    candidates
      .filter((p) => nutrientsOf(p.nm).some((n) => redSet.has(n)))
      .sort((a, b) => rank(a) - rank(b))
      .forEach((p) => add(p.nm, p.cat, '결핍보강', coreSize));
  }
  // ② 기관에서 거부한 식재료 → 집에서 소량 재노출 (풀에 있고 향신료 아님, 집에 있어서 뺀 건 제외)
  daycareRefused.forEach((nm) => {
    const p = pool.find((x) => x.nm === nm && x.grade !== '향신료' && !isSpicyIngredient(x.nm));
    if (p && !eaten.has(p.nm)) add(p.nm, p.cat, '거부재노출', coreSize);
  });
  // ③ 필수도전(💎 must-eat)으로 핵심 채우기
  roundRobin(candidates.filter((p) => p.must_eat && !picked.has(p.nm)), () => '필수도전', coreSize);

  // ── 맛보기(taster) 슬롯 2: 권장도전. 핵심이 데이터 부족으로 5 미달이면 남은 것으로 size까지 채움 ──
  roundRobin(candidates.filter((p) => !picked.has(p.nm)), (p) => (p.must_eat ? '필수도전' : '권장도전'), size);

  return out;
}

export const BOX_REASON_META: Record<BoxReason, { label: string; color: string }> = {
  결핍보강: { label: '부족 영양 보강', color: '#C62828' },
  거부재노출: { label: '집에서 다시', color: '#C45A00' },
  필수도전: { label: '💎 영양 보석', color: '#C45A00' },
  권장도전: { label: '도전 식재료', color: '#1565C0' },
};
