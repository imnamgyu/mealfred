/**
 * tests/coach-hybrid-rotation.test.ts — EPIC H · 재료 회전·수렴 방지 (H-03·H-07)
 *
 * 개선 B(재료=코드가 매일 회전·3일내 재사용 금지, 문장만 LLM)의 회전이 결정론이고 3일 창에서
 *   같은 추천 식재료를 반복하지 않음을 박제. 'LLM이 매일 독립 최적화→당근→미역국 수렴'을 코드가
 *   막는 증거. 실제 엔진은 rotateRecommendation(ranked, recentRecos) — ranked는 4기준 점수순,
 *   recentRecos는 직전 3일 이력(시드 회전이 아니라 '점수순 중 최근 미사용 최상위').
 *
 * H-03 = 함수 단위 회전 불변식 · H-07 = 14일 시계열 통주(다일 리플레이가 배포 게이트라는 6/11 교훈).
 */
import { describe, it, expect } from 'vitest';
import {
  rankIngredients, rotateRecommendation, GROUP_INGREDIENTS_RANKED,
} from '../lib/coachMaterials';
import type { GroupLevel } from '../lib/nutrition';

/** 14일 회전 시뮬: 같은 결핍군이 고정돼도 추천 식재료가 회전함을 증명(직전 3일 무재사용). */
function simulate(targetGroup: string, level: GroupLevel, liked: string[], days = 14): string[] {
  const ranked = rankIngredients({ targetGroup, groupLevel: level, liked });   // 입력 고정 → ranked 고정
  const seq: string[] = [];
  let recent: string[] = [];
  for (let d = 0; d < days; d++) {
    const pick = rotateRecommendation({ ranked, recentRecos: recent });
    if (!pick) break;
    seq.push(pick);
    recent = [pick, ...recent].slice(0, 3);   // 직전 3일 창(2 cooldown — 자신 포함 3일)
  }
  return seq;
}

// ── H-03 — 회전 함수 불변식 ────────────────────────────────────────────────────────
describe('HB-03 rotateRecommendation 결정론·3일 무재사용 (H-03)', () => {
  const ranked = [{ ing: '당근', score: 9 }, { ing: '시금치', score: 5 }, { ing: '근대', score: 5 }, { ing: '단호박', score: 3 }];

  it('HB-03-1 결정론: 동일 입력 두 번 = 동일 식재료', () => {
    const a = rotateRecommendation({ ranked, recentRecos: ['당근'] });
    const b = rotateRecommendation({ ranked, recentRecos: ['당근'] });
    expect(a).toBe(b);
    expect(a).toBe('시금치');
  });
  it('HB-03-2 3일 창 무재사용: 14일 회전에서 results[i]∉{results[i-1],results[i-2]}', () => {
    const seq = simulate('비타민A채소', 'red', []);
    expect(seq.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < seq.length; i++) {
      expect(seq.slice(Math.max(0, i - 2), i)).not.toContain(seq[i]);
    }
  });
  it('HB-03-3 풀 4종 고른 순회(각 식재료 >=2회 등장·편중 없음)', () => {
    const seq = simulate('비타민A채소', 'red', []);
    const counts: Record<string, number> = {};
    for (const x of seq) counts[x] = (counts[x] || 0) + 1;
    for (const ing of GROUP_INGREDIENTS_RANKED['비타민A채소']) {
      expect(counts[ing] || 0).toBeGreaterThanOrEqual(2);
    }
  });
  it('HB-03-4 recentRecos 명시 제외 존중(3종 쿨다운 → 남은 1종)', () => {
    const pick = rotateRecommendation({ ranked, recentRecos: ['당근', '시금치', '근대'] });
    expect(pick).toBe('단호박');
  });
  it('HB-03-5 풀 1종 군은 throw 없이 그 1종 반환', () => {
    const single = [{ ing: '당근', score: 9 }];
    expect(() => rotateRecommendation({ ranked: single, recentRecos: ['당근'] })).not.toThrow();
    expect(rotateRecommendation({ ranked: single, recentRecos: ['당근'] })).toBe('당근');   // 폴백(null 금지)
  });
  it('HB-03-6 빈 랭킹 → null(throw 0)', () => {
    expect(rotateRecommendation({ ranked: [], recentRecos: [] })).toBeNull();
  });
  it('HB-03-7 인접 byte-동일 0(수렴 방지 핵심 지표)', () => {
    const seq = simulate('비타민A채소', 'red', []);
    let adjacent = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) adjacent++;
    expect(adjacent).toBe(0);
  });
  it('HB-03-8 다른 결핍군은 독립 회전(군 간 간섭 없음)', () => {
    const vitA = simulate('비타민A채소', 'red', []);
    const other = simulate('기타채소', 'red', []);
    // 각자 자기 풀만 순회
    for (const x of vitA) expect(GROUP_INGREDIENTS_RANKED['비타민A채소']).toContain(x);
    for (const x of other) expect(GROUP_INGREDIENTS_RANKED['기타채소']).toContain(x);
  });
});

// ── H-07 — 14일 시계열 통주(수렴 0) ────────────────────────────────────────────────
describe('HB-07 14일 리플레이 수렴 방지 (H-07)', () => {
  it('HB-07-1 비타민A채소 red 고정 14일 → 고유 추천 >=3종', () => {
    const seq = simulate('비타민A채소', 'red', []);
    expect(new Set(seq).size).toBeGreaterThanOrEqual(3);
  });
  it('HB-07-2 인접일 동일 추천 0건(수렴 방지)', () => {
    const seq = simulate('비타민A채소', 'red', []);
    let adjacent = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) adjacent++;
    expect(adjacent).toBe(0);
  });
  it('HB-07-3 3일 창 재사용 0건', () => {
    const seq = simulate('비타민A채소', 'red', []);
    let repeat = 0;
    for (let i = 0; i < seq.length; i++) if (seq.slice(Math.max(0, i - 2), i).includes(seq[i])) repeat++;
    expect(repeat).toBe(0);
  });
  it('HB-07-4 리플레이 결정론(byte-동일 시계열)', () => {
    expect(JSON.stringify(simulate('비타민A채소', 'red', []))).toBe(JSON.stringify(simulate('비타민A채소', 'red', [])));
  });
  it('HB-07-5 풀 소진 라운드로빈(4종 등장 횟수 편중 max-min<=2)', () => {
    const seq = simulate('비타민A채소', 'red', []);
    const counts = GROUP_INGREDIENTS_RANKED['비타민A채소'].map((ing) => seq.filter((x) => x === ing).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });
  it('HB-07-6 다른 결핍군 가정도 수렴 0(일반화)', () => {
    const seq = simulate('기타채소', 'red', []);
    let adjacent = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) adjacent++;
    expect(adjacent).toBe(0);
  });
});
