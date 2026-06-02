/**
 * lib/season.ts — 식재료별 제철(월) 단일 소스 + 박스 배송 적합성.
 * 데이터: lib/ingredient-season.json (도감 166종, LLM 큐레이션+적대검증, scripts/gen-corpus-stats 와 별개 워크플로).
 *   months = 한국 국산 노지 출하 성수기(1~12). null = 연중/저장품(말린콩·곡물·견과)·신선제철 개념 약한 것(고기·계란·유제품·가공).
 * 제철 = 영양가 높고·신선·제값. 박스는 제철 우선으로 '제철 영양' 강점을 만든다.
 * 소비처: 홈 박스 배지(app/page.tsx)·박스 배합(lib/box.ts)·도감(app/foods).
 */
import SEASON_DATA from './ingredient-season.json';

const SEASON: Record<string, number[] | null> = (SEASON_DATA as { season: Record<string, number[] | null> }).season;

/** 그 식재료의 제철 월(국산 노지 성수기). 연중/저장품은 null. */
export function seasonMonths(nm: string): number[] | null {
  const m = SEASON[nm];
  return Array.isArray(m) && m.length ? m : null;
}

/** 그 달 제철인가 (1~12월). */
export function inSeason(nm: string, month: number): boolean {
  const m = SEASON[nm];
  return Array.isArray(m) && m.includes(month);
}

/** 그 달 제철인 식재료 이름들 (이달의 제철 페이지용). */
export function seasonalOf(month: number): string[] {
  return Object.entries(SEASON).filter(([, m]) => Array.isArray(m) && m.includes(month)).map(([nm]) => nm);
}

/** 제철 월 배열 → 사람이 읽는 라벨. 12→1 연속(겨울 wrap)은 범위로, 아니면 나열. */
export function seasonRangeLabel(months: number[] | null | undefined): string {
  if (!months || !months.length) return '';
  const s = [...new Set(months)].sort((a, b) => a - b);
  if (s.length >= 11) return '거의 연중';
  const isRun = (arr: number[]) => arr.every((v, i) => i === 0 || v === arr[i - 1] + 1);
  if (isRun(s)) return `${s[0]}~${s[s.length - 1]}월`;
  // 12→1 wrap: 회전시켜 연속이면 범위로
  for (let r = 1; r < s.length; r++) {
    const rot = [...s.slice(r), ...s.slice(0, r).map((v) => v + 12)];
    if (rot.every((v, i) => i === 0 || v === rot[i - 1] + 1)) {
      const end = ((rot[rot.length - 1] - 1) % 12) + 1;
      return `${rot[0]}~${end}월`;
    }
  }
  return s.join('·') + '월';
}

/** 박스 배송 시 산폐·신선도 위험으로 제외할 '신선 해산물'.
 *  생선·갑각/조개는 운송 중 산폐·상함 위험 → 박스 제외. 단 건어물(멸치·가다랑어)·해조류(별도 cat)는 안전해 유지. */
const SHELF_STABLE_SEA = new Set(['멸치', '가다랑어']);
export function isPerishableSeafood(nm: string, cat: string): boolean {
  return (cat === '생선' || cat === '갑각_조개') && !SHELF_STABLE_SEA.has(nm);
}
