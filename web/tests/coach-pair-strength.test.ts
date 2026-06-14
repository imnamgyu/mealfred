/**
 * tests/coach-pair-strength.test.ts — 약신호 곁들임 차단 회귀 (떡+달걀 괴식 사고 박제)
 * food-graph pair를 strength≥2(strongPairsOf)로만 추천에 사용 → s=1 우연 동시출현(멥쌀떡↔달걀 lift 0.72) 차단.
 */
import { describe, it, expect } from 'vitest';
import { strongPairsOf, verifiedCousinsOf, neighborsOf, PAIR_MIN_STRENGTH } from '../lib/foodGraph';
import { pickFoodReco } from '../lib/coachRecos';

describe('strongPairsOf — 약신호 pair 차단', () => {
  it('PS-1 달걀의 강한 궁합만(s≥2): 멥쌀떡(s1) 제외·당근/두부(s3) 포함', () => {
    const strong = strongPairsOf('달걀').map((n) => n.nm);
    expect(strong).not.toContain('멥쌀떡');   // s1 — 6/14 떡+달걀 괴식 원천
    expect(strong).toContain('당근');          // s3
    expect(strong).toContain('두부');          // s3
  });
  it('PS-2 strongPairsOf는 전부 strength≥임계(grade 없으면)', () => {
    for (const nm of ['달걀', '당근', '두부', '소고기', '시금치']) {
      for (const n of strongPairsOf(nm)) {
        expect(n.kind).toBe('pair');
        if (!n.grade) expect(n.strength).toBeGreaterThanOrEqual(PAIR_MIN_STRENGTH);
      }
    }
  });
  it('PS-3 멥쌀떡↔달걀 엣지는 그래프엔 존재하되 strong에선 빠짐(보존+차단)', () => {
    expect(neighborsOf('멥쌀떡').some((n) => n.nm === '달걀' && n.kind === 'pair')).toBe(true);   // 그래프 보존
    expect(strongPairsOf('멥쌀떡').some((n) => n.nm === '달걀')).toBe(false);                      // 추천 차단
  });
});

describe('pickFoodReco — 떡 곁들임(s1) 더 이상 추천 안 함', () => {
  it('PS-4 liked=[멥쌀떡]·target=고기·계란 → via:pair pairLiked:떡 가 아님(6/14 버그 차단)', () => {
    const reco = pickFoodReco({ target: '고기·계란', likedIngredients: ['멥쌀떡'], seed: 0 });
    // 달걀↔멥쌀떡은 s1이라 strongPairsOf에서 빠짐 → via:'pair'로 떡을 곁들이라는 추천이 나오면 안 됨
    expect(!(reco && reco.via === 'pair' && reco.pairLiked === '떡')).toBe(true);
    if (reco) expect(['dish', 'plain', 'chain', 'liked']).toContain(reco.via);
  });
  it('PS-5 liked=[두부]·target=고기·계란 → 강한 궁합(두부↔달걀 s3)이면 via:pair 정상 동작', () => {
    const reco = pickFoodReco({ target: '고기·계란', likedIngredients: ['두부'], seed: 0 });
    expect(reco).toBeTruthy();   // 강한 신호는 정상 추천(차단이 과하지 않음 — 오탐 방지)
  });
});

describe('verifiedCousinsOf — 사촌(bridge)은 현행 전부 통과(verified 필드 전 하위호환)', () => {
  it('PS-6 달걀의 사촌(계란·메추리알)은 verifiedCousinsOf에 포함', () => {
    const cousins = verifiedCousinsOf('달걀').map((n) => n.nm);
    expect(cousins).toContain('계란');
    expect(cousins).toContain('메추리알');
  });
});
