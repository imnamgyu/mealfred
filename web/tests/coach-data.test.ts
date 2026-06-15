/**
 * tests/coach-data.test.ts — EPIC I 데이터 정합성 회귀 (I-01~I-07)
 *
 * Letter B '재료 결정론'이 실측 근거 위에 서도록 데이터층을 못 박는다:
 *   ① 식재료 급식빈도·상위%(ingredient-freq) ② GROUP_INGREDIENTS 정비(RANKED 단호박 강등)
 *   ③ 괴식 조합 차단(comboGuard·kit-dish-matrix) ④ food-graph 경계 ⑤ 근거 문구(recoEvidence).
 *
 * ⚠️ 원본 GROUP_INGREDIENTS(coachRecos)는 무변경 = Letter A 대조군 보존. 정비는 EPIC A의
 *    GROUP_INGREDIENTS_RANKED가 수행(단호박 0회→끝). 상세 = lib/coachRecos-data.audit.md.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { freqOf, topPctOf, isCommon } from '../lib/ingredientFreq';
import { dishIngredientFit, ingredientPairFit, validCombos } from '../lib/comboGuard';
import { evidenceFor } from '../lib/recoEvidence';
import { GROUP_INGREDIENTS, weeklyExposureTarget } from '../lib/coachRecos';
import { GROUP_INGREDIENTS_RANKED, GIO_FREQ } from '../lib/coachMaterials';
import { neighborsOf } from '../lib/foodGraph';
import { NUTRI_MAP } from '../lib/nutrition';

// ── 데이터 픽스처(빌드 산출물·정적 JSON) ─────────────────────────────────────────
const WEB = path.join(__dirname, '..');
const freqJson = JSON.parse(fs.readFileSync(path.join(WEB, 'public', 'ingredient-freq.json'), 'utf8')) as Record<string, { freq: number; rank: number; topPct: number }>;
const dexNms = new Set((JSON.parse(fs.readFileSync(path.join(WEB, 'public', 'ingredients-light.json'), 'utf8')).ingredients as { nm: string }[]).map((x) => x.nm));
const recipes = JSON.parse(fs.readFileSync(path.join(WEB, 'public', 'ingredient-recipes.json'), 'utf8')) as Record<string, { name: string; freq: number }[]>;
const graph = JSON.parse(fs.readFileSync(path.join(WEB, 'lib', 'food-graph.json'), 'utf8')) as { nodes: string[]; edges: { a: string; b: string; kind: string }[] };

// ── I-01 — 식재료 급식빈도·상위% 산출(public/ingredient-freq.json) ──────────────
describe('I-01 ingredient-freq.json — 산출 정합', () => {
  it('I-01-1 산출 키 전부 도감 표준명(차집합 0)', () => {
    const outside = Object.keys(freqJson).filter((k) => !dexNms.has(k));
    expect(outside).toEqual([]);
  });
  it('I-01-2 당근 상위% < 근대 상위%(당근이 더 흔함·실측 2% vs 39%)', () => {
    expect(freqJson['당근'].topPct).toBeLessThan(freqJson['근대'].topPct);
    expect(freqJson['당근'].topPct).toBe(2);
    expect(freqJson['근대'].topPct).toBe(39);
  });
  it('I-01-3 단호박 0회 → 미수록', () => {
    expect(freqJson['단호박']).toBeUndefined();
  });
  it('I-01-4 요거트 0회 → 미수록', () => {
    expect(freqJson['요거트']).toBeUndefined();
  });
  it('I-01-5 치즈 freq>0 · topPct 범위(실측 18·27%)', () => {
    expect(freqJson['치즈'].freq).toBeGreaterThan(0);
    expect(freqJson['치즈'].topPct).toBeGreaterThan(0);
    expect(freqJson['치즈'].topPct).toBeLessThanOrEqual(100);
  });
  it('I-01-6 rank 단조성(freq 큰 식재료 rank가 더 작다)', () => {
    const sorted = Object.values(freqJson).sort((a, b) => b.freq - a.freq);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].freq < sorted[i - 1].freq) expect(sorted[i].rank).toBeGreaterThan(sorted[i - 1].rank);
    }
  });
  it('I-01-7 topPct 범위 0<topPct<=100(전수)', () => {
    for (const v of Object.values(freqJson)) {
      expect(v.topPct).toBeGreaterThan(0);
      expect(v.topPct).toBeLessThanOrEqual(100);
    }
  });
  it('I-01-8 양념(마늘·소금·간장) 0개', () => {
    for (const s of ['마늘', '소금', '간장', '참기름', '설탕']) expect(freqJson[s]).toBeUndefined();
  });
  it('I-01-9 ingredient-freq vs GIO_FREQ 단일 진실원 일치(freq·pct)', () => {
    for (const [nm, v] of Object.entries(freqJson)) {
      expect(v.freq).toBe(GIO_FREQ[nm].freq);
      expect(v.topPct).toBe(GIO_FREQ[nm].pct);
    }
  });
});

// ── I-02 — freq 로더 lib/ingredientFreq.ts ──────────────────────────────────────
describe('I-02 ingredientFreq 로더 — 순수 함수', () => {
  it('I-02-1 수록 식재료 조회', () => {
    const v = freqOf('당근');
    expect(v).not.toBeNull();
    expect(v!.freq).toBeGreaterThan(0);
    expect(v!.topPct).toBe(2);
  });
  it('I-02-2 미수록 0회 식재료 null(단호박·요거트)', () => {
    expect(freqOf('단호박')).toBeNull();
    expect(freqOf('요거트')).toBeNull();
  });
  it('I-02-3 topPctOf 0회 null(상위 100% 위장 금지)', () => {
    expect(topPctOf('단호박')).toBeNull();
  });
  it('I-02-4 isCommon 임계 경계', () => {
    expect(isCommon('당근', 20)).toBe(true);
    expect(isCommon('근대', 20)).toBe(false);
    expect(isCommon('근대', 40)).toBe(true);
  });
  it('I-02-5 isCommon은 freq 0 배제(미수록은 흔함 아님)', () => {
    expect(isCommon('단호박', 100)).toBe(false);
  });
  it('I-02-6 존재하지 않는 임의 문자열 null', () => {
    expect(freqOf('존재안함xyz')).toBeNull();
    expect(topPctOf('존재안함xyz')).toBeNull();
  });
  it('I-02-7 빈 문자열·공백 null', () => {
    expect(freqOf('')).toBeNull();
    expect(freqOf('  ')).toBeNull();
    expect(topPctOf('')).toBeNull();
  });
  it('I-02-8 순수성(2회 호출 동일·전역 불변)', () => {
    expect(freqOf('당근')).toEqual(freqOf('당근'));
    expect(topPctOf('치즈')).toBe(topPctOf('치즈'));
  });
  it('I-02-9 rank·topPct 동행(rank 작으면 topPct 작거나 같음)', () => {
    const a = freqOf('당근')!;
    const b = freqOf('근대')!;
    expect(a.rank).toBeLessThan(b.rank);
    expect(a.topPct).toBeLessThanOrEqual(b.topPct);
  });
});

// ── I-03 — GROUP_INGREDIENTS 정비(원본 무변경 + RANKED 단호박 강등) ──────────────
describe('I-03 GROUP_INGREDIENTS 정비 — RANKED 빈도순·원본 보존', () => {
  it('I-03-1 비타민A채소 RANKED 선두는 빈도 있는 식재료(단호박 아님)', () => {
    const head = GROUP_INGREDIENTS_RANKED['비타민A채소'][0];
    expect(head).not.toBe('단호박');
    expect(freqOf(head)).not.toBeNull();
    expect(head).toBe('당근');
  });
  it('I-03-2 단호박 제거 아닌 후순위(끝)', () => {
    const list = GROUP_INGREDIENTS_RANKED['비타민A채소'];
    expect(list).toContain('단호박');   // 영양 유지
    expect(list.indexOf('단호박')).toBeGreaterThan(list.indexOf('당근'));
    expect(list.indexOf('단호박')).toBeGreaterThan(list.indexOf('시금치'));
  });
  it('I-03-3 원본은 Letter A 대조군이라 무변경(단호박 선두 보존)', () => {
    expect(GROUP_INGREDIENTS['비타민A채소'][0]).toBe('단호박');   // A-01-7 회귀와 정합
    expect(GROUP_INGREDIENTS['기타채소'][0]).toBe('브로콜리');
  });
  it('I-03-4 모든 그룹(RANKED) 비어있지 않음', () => {
    for (const g of Object.values(GROUP_INGREDIENTS_RANKED)) expect(g.length).toBeGreaterThanOrEqual(1);
  });
  it('I-03-5 RANKED는 원본의 순열(집합 보존·내용 무손실)', () => {
    for (const [g, list] of Object.entries(GROUP_INGREDIENTS)) {
      expect([...GROUP_INGREDIENTS_RANKED[g]].sort()).toEqual([...list].sort());
    }
  });
  it('I-03-6 각 그룹 최소 1개는 급식빈도 근거 있음(전부 0회 그룹 없음)', () => {
    // 급식빈도 근거 = ingredient-freq(채소·유제품 권위표) ∪ ingredient-recipes(전 식품군 dish 빈도).
    //   rankIngredients가 둘 다 쓰므로(pct 점수 + popularDishesFor), 이 합집합이 '죽은 대표' 판정 기준.
    const hasFreq = (ing: string) => freqOf(ing) !== null || !!recipes[ing];
    for (const list of Object.values(GROUP_INGREDIENTS_RANKED)) {
      expect(list.some(hasFreq)).toBe(true);
    }
  });
  it('I-03-6b 비타민A채소 RANKED는 freq 내림차순(당근>시금치>근대>단호박)', () => {
    // ingredient-freq 권위표가 커버하는 그룹은 freq 내림차순 정렬이 보장됨(단호박 0=끝).
    const list = GROUP_INGREDIENTS_RANKED['비타민A채소'];
    expect(list).toEqual(['당근', '시금치', '근대', '단호박']);
  });
  it('I-03-7 영양 필수 식재료 보존(브로콜리·검은콩·연어·멸치)', () => {
    expect(GROUP_INGREDIENTS_RANKED['기타채소']).toContain('브로콜리');
    expect(GROUP_INGREDIENTS_RANKED['콩류']).toContain('검은콩');
    expect(GROUP_INGREDIENTS_RANKED['생선·해산물']).toContain('연어');
    expect(GROUP_INGREDIENTS_RANKED['생선·해산물']).toContain('멸치');
  });
  it('I-03-8 STAPLE 곡물 보존(현미·귀리·잡곡)', () => {
    for (const s of ['현미', '귀리', '잡곡']) expect(GROUP_INGREDIENTS_RANKED['곡물']).toContain(s);
  });
  it('I-03-9 weeklyExposureTarget 회귀 — challenge 비지 않음', () => {
    const t = weeklyExposureTarget(
      [{ group: '비타민A채소', level: 'red', weeklyEst: 0 }],
      ['당근'],   // 당근은 liked → challenge는 단호박/시금치/근대
      0,
    );
    expect(t).not.toBeNull();
    expect(t).not.toBe('당근');
  });
  it('I-03-10 각 그룹 내 중복 없음', () => {
    for (const list of Object.values(GROUP_INGREDIENTS_RANKED)) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

// ── I-04 — 괴식 조합 차단 lib/comboGuard.ts ──────────────────────────────────────
describe('I-04 comboGuard — 괴식 차단(kit-dish-matrix + food-graph)', () => {
  it('I-04-1 괴식 미역국×당근 차단(score 1<2)', () => {
    expect(dishIngredientFit('미역국', '당근').ok).toBe(false);
    expect(dishIngredientFit('미역국', '당근').score).toBe(1);
  });
  it('I-04-2 볶음밥×당근 허용(score 3)', () => {
    expect(dishIngredientFit('볶음밥', '당근').ok).toBe(true);
    expect(dishIngredientFit('볶음밥', '당근').score).toBe(3);
  });
  it('I-04-3 카레×당근 허용(score 3)', () => {
    expect(dishIngredientFit('카레', '당근').ok).toBe(true);
  });
  it('I-04-4 비빔밥·덮밥×당근 허용', () => {
    expect(dishIngredientFit('비빔밥', '당근').ok).toBe(true);
    expect(dishIngredientFit('덮밥', '당근').ok).toBe(true);
  });
  it('I-04-5 미수록 조합 금지(undefined를 통과로 위장 금지)', () => {
    expect(dishIngredientFit('존재안함국', '당근').ok).toBe(false);
    expect(dishIngredientFit('존재안함국', '당근').score).toBe(0);
  });
  it('I-04-6 임계 경계 — score 2 허용·1 차단(국=2, 미역국=1)', () => {
    expect(dishIngredientFit('국', '당근').score).toBe(2);
    expect(dishIngredientFit('국', '당근').ok).toBe(true);
    expect(dishIngredientFit('미역국', '당근').ok).toBe(false);
  });
  it('I-04-7 validCombos 화이트리스트(미역국 제외)', () => {
    const r = validCombos(['미역국', '볶음밥', '카레'], ['당근']);
    expect(r).toEqual([{ dish: '볶음밥', ing: '당근' }, { dish: '카레', ing: '당근' }]);
  });
  it('I-04-8 ingredientPairFit 테이블 근거만', () => {
    expect(ingredientPairFit('당근', '시금치').ok).toBe(true);   // 강한 궁합(lift 1.58·strong) — 약신호(당근+두부 lift 0.58)는 차단
    expect(ingredientPairFit('당근', '두부').ok).toBe(false);    // lift 0.58 우연 이하 → strong 아님 → 차단
    expect(ingredientPairFit('당근', '존재안함').ok).toBe(false);
  });
  it('I-04-9 ingredientPairFit 무방향(대칭)', () => {
    expect(ingredientPairFit('당근', '두부').ok).toBe(ingredientPairFit('두부', '당근').ok);
  });
  it('I-04-10 dish를 ingredientPairFit에 넣으면 금지(경계 강제)', () => {
    expect(ingredientPairFit('볶음밥', '당근').ok).toBe(false);   // 볶음밥은 food-graph 노드 아님
  });
  it('I-04-11 빈/공백 입력 금지', () => {
    expect(dishIngredientFit('', '당근').ok).toBe(false);
    expect(dishIngredientFit('미역국', '').ok).toBe(false);
    expect(ingredientPairFit('', '두부').ok).toBe(false);
  });
  it('I-04-12 validCombos 빈 입력', () => {
    expect(validCombos([], [])).toEqual([]);
    expect(validCombos(['미역국'], ['당근'])).toEqual([]);
  });
  it('I-04-13 score<2 dish 괴식 스냅샷 회귀(미역국·빵토스트·쌈·요거트간식·김치찌개)', () => {
    for (const dish of ['미역국', '빵·토스트', '쌈', '요거트·간식', '김치찌개']) {
      expect(dishIngredientFit(dish, '당근').ok).toBe(false);
    }
  });
});

// ── I-05 — food-graph 경계(식재료 그래프) ────────────────────────────────────────
describe('I-05 food-graph 경계 — pair/bridge·dish 미포함', () => {
  it('I-05-1 당근 핵심 pair 존재(두부·달걀·감자)', () => {
    const pairs = new Set(neighborsOf('당근').filter((n) => n.kind === 'pair').map((n) => n.nm));
    for (const x of ['두부', '달걀', '감자']) expect(pairs.has(x)).toBe(true);
  });
  it('I-05-2 dish는 graph 노드 아님(볶음밥·카레·짜파게티 0)', () => {
    for (const d of ['볶음밥', '카레', '짜파게티']) expect(graph.nodes.includes(d)).toBe(false);
  });
  it('I-05-3 dish+당근은 kit-matrix로 커버(graph 부재 보완)', () => {
    expect(dishIngredientFit('볶음밥', '당근').ok).toBe(true);
    expect(dishIngredientFit('카레', '당근').ok).toBe(true);
  });
  it('I-05-4 graph 엣지 카운트 드리프트 감지(pair 940·bridge 175·합 1115 — 레시피 + dietary4u 영유아표준식단 + 식판 병합, 과일 교차채널·미역+당근 괴식 차단)', () => {
    const pair = graph.edges.filter((e) => e.kind === 'pair').length;
    const bridge = graph.edges.filter((e) => e.kind === 'bridge').length;
    expect(pair).toBe(940);    // 레시피 동시출현 + dietary4u(learned_menus source=dietary4u 3,484메뉴) + 식판 strong 신규, 과일·괴식 제외
    expect(bridge).toBe(175);
    expect(graph.edges.length).toBe(1115);
  });
  it('I-05-5 노드 수(201 — dietary4u 합산·현 도감 기준)', () => {
    expect(graph.nodes.length).toBe(201);
  });
  it('I-05-6 미역 pair에 당근 없음(미역국 괴식과 정합)', () => {
    const pairs = neighborsOf('미역').filter((n) => n.kind === 'pair').map((n) => n.nm);
    expect(pairs).not.toContain('당근');
  });
  it('I-05-7 무방향 대칭(당근→두부 pair ⇒ 두부→당근 pair)', () => {
    const carHasTofu = neighborsOf('당근').some((n) => n.kind === 'pair' && n.nm === '두부');
    const tofuHasCar = neighborsOf('두부').some((n) => n.kind === 'pair' && n.nm === '당근');
    expect(carHasTofu).toBe(true);
    expect(tofuHasCar).toBe(true);
  });
  it('I-05-8 bridge≠pair 분리(비트·파스닙=bridge, 두부·감자=pair)', () => {
    const nb = neighborsOf('당근');
    const bridges = new Set(nb.filter((n) => n.kind === 'bridge').map((n) => n.nm));
    const pairs = new Set(nb.filter((n) => n.kind === 'pair').map((n) => n.nm));
    expect(bridges.has('비트')).toBe(true);
    expect(pairs.has('두부')).toBe(true);
    expect(bridges.has('두부')).toBe(false);
  });
});

// ── I-06 — 근거 문구 lib/recoEvidence.ts ─────────────────────────────────────────
describe('I-06 recoEvidence — 식재료→영양역할+급식 상위%', () => {
  it('I-06-1 당근 근거 문구(비타민A·상위)', () => {
    const e = evidenceFor('당근');
    expect(e.nutrients).toContain('비타민A');
    expect(e.text).toContain('상위');
    expect(e.text).toContain('비타민A');
  });
  it('I-06-2 0회 식재료 상위% 위장 금지(단호박)', () => {
    const e = evidenceFor('단호박');
    expect(e.freqPct).toBeNull();
    expect(e.text).not.toContain('상위');
  });
  it('I-06-3 멸치 칼슘 역할', () => {
    expect(evidenceFor('멸치').nutrients).toContain('칼슘');
  });
  it('I-06-4 연어 비타민D/오메가3', () => {
    const n = evidenceFor('연어').nutrients;
    expect(n.includes('비타민D') || n.includes('오메가3')).toBe(true);
  });
  it('I-06-5 영양·빈도 모두 없는 식재료 빈 text(허위 근거 0)', () => {
    expect(evidenceFor('존재안함xyz').text).toBe('');
  });
  it('I-06-6 역할 라벨 매핑(비타민A→눈·면역)', () => {
    expect(evidenceFor('당근').text).toMatch(/눈|면역/);
  });
  it('I-06-7 text에 재료 밖 음식명 미포함(사실만)', () => {
    expect(evidenceFor('당근').text).not.toContain('미역국');
    expect(evidenceFor('당근').text).not.toContain('볶음밥');
  });
  it('I-06-8 순수성(2회 호출 동일)', () => {
    expect(evidenceFor('당근')).toEqual(evidenceFor('당근'));
  });
  it('I-06-9 freqPct null이면 nutrients만으로 text 구성(멸치=칼슘·상위 절 없음)', () => {
    const e = evidenceFor('멸치');   // 멸치 freq 0(미수록)이나 NUTRIENT_FOODS 칼슘 대표
    expect(e.freqPct).toBeNull();
    expect(e.text.length).toBeGreaterThan(0);
    expect(e.text).not.toContain('상위');
  });
  it('I-06-10 중복 영양소 제거(Set)', () => {
    const n = evidenceFor('시금치').nutrients;
    expect(new Set(n).size).toBe(n.length);
  });
  it('I-06-11 빈/공백 입력 빈 text', () => {
    expect(evidenceFor('').text).toBe('');
    expect(evidenceFor('  ').text).toBe('');
  });
  it('I-06-12 freqPct는 I-02 단일 소스 일치', () => {
    expect(evidenceFor('당근').freqPct).toBe(topPctOf('당근'));
    expect(evidenceFor('치즈').freqPct).toBe(topPctOf('치즈'));
  });
});

// ── I-07 — 통합 계약(I-01~06 산출물 교차 정합) ──────────────────────────────────
describe('I-07 데이터 정합 통합 계약', () => {
  const nutriHas = (ing: string) => Object.prototype.hasOwnProperty.call(NUTRI_MAP, ing);
  const graphHas = (ing: string) => graph.nodes.includes(ing);
  const dexHas = (ing: string) => dexNms.has(ing);

  it('I-07-1 고아 식재료 0(전 대표가 도감/graph/NUTRI_MAP 중 1+)', () => {
    const orphans: string[] = [];
    for (const list of Object.values(GROUP_INGREDIENTS)) {
      for (const ing of list) {
        if (!dexHas(ing) && !graphHas(ing) && !nutriHas(ing)) orphans.push(ing);
      }
    }
    expect(orphans).toEqual([]);
  });
  it('I-07-2 빈도 대표 근거 일관(freq 있는 당근 → evidence에 상위)', () => {
    expect(evidenceFor('당근').text).toContain('상위');
  });
  it('I-07-3 추천 빈손 0(challenge 식재료별 인기 음식 1+ 또는 STAPLE)', () => {
    // 비타민A채소 RANKED 중 freq 있는 대표는 kit-matrix dish가 1+ 존재
    for (const ing of GROUP_INGREDIENTS_RANKED['비타민A채소']) {
      if (freqOf(ing) === null) continue;   // 단호박 등 미수록은 도전 후순위(빈손 허용)
      const dishes = validCombos(['볶음밥', '비빔밥', '카레', '국', '무침·나물', '죽·미음'], [ing]);
      expect(dishes.length).toBeGreaterThanOrEqual(1);
    }
  });
  it('I-07-4 추천 파이프 괴식 0(validCombos에 미역국 미포함)', () => {
    const r = validCombos(['미역국', '볶음밥', '카레', '비빔밥'], ['당근']);
    expect(r.some((c) => c.dish === '미역국')).toBe(false);
  });
  it('I-07-5 freqMap 소스 경로 고정(graphSource 격리 — route는 getRecipeFreq, graphSource가 ingredient-recipes.json 소유)', () => {
    // JSON 직접 read는 graphSource로 격리됨(handoff §4). 크론은 graphSource 경유로만 freqMap을 읽는다.
    const src = fs.readFileSync(path.join(WEB, 'app', 'api', 'cron', 'coach', 'route.ts'), 'utf8');
    expect(src).toContain('getRecipeFreq');
    const gs = fs.readFileSync(path.join(WEB, 'lib', 'graphSource.ts'), 'utf8');
    expect(gs).toContain('ingredient-recipes.json');
  });
  it('I-07-6 ingredient-freq vs ingredient-recipes 방향 일관(당근>근대)', () => {
    // 두 소스 모두 있는 식재료: ingredient-freq 상위% 작은 식재료가 더 흔하다(당근<근대 topPct)
    expect(freqJson['당근'].topPct).toBeLessThan(freqJson['근대'].topPct);
    // ingredient-recipes에도 당근·근대 둘 다 존재(소스 경로 살아있음)
    expect(recipes['당근']).toBeDefined();
    expect(recipes['근대']).toBeDefined();
  });
  it('I-07-7 단호박 회전 시 환각 방지(evidence에 상위 절 0)', () => {
    expect(evidenceFor('단호박').text).not.toContain('상위');
    expect(evidenceFor('단호박').freqPct).toBeNull();
  });
  it('I-07-8 A 대조군 불변(원본 GROUP_INGREDIENTS 무변경 — Letter A 영향 0)', () => {
    expect(GROUP_INGREDIENTS['비타민A채소']).toEqual(['단호박', '당근', '시금치', '근대']);
    expect(GROUP_INGREDIENTS['고기·계란']).toEqual(['달걀', '계란', '소고기', '닭고기', '메추리알']);
  });
});
