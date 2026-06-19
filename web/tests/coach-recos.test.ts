/**
 * tests/coach-recos.test.ts — freqMap 어댑터 + Letter A 보존 회귀 (WBS EPIC A · A-11·A-01)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { normalizeFreqMap, ingredientGioFreq, rankIngredients, GIO_FREQ, warmIngredientFreqFromSql, isFreqWarmed, resetIngredientFreqWarm } from '../lib/coachMaterials';
import { popularDishesFor, GROUP_INGREDIENTS, STAPLE_FORMS, buildRecoFacts, youaRankOf, safeGarnishOf } from '../lib/coachRecos';
import { strongPairsOf, garnishPairsOf } from '../lib/foodGraph';
import { isSpicyIngredient } from '../lib/spicy';
import recipeFreqJson from '../public/ingredient-recipes.json';

const FM = normalizeFreqMap(recipeFreqJson);
const ALL_REPS = [...new Set([...Object.values(GROUP_INGREDIENTS).flat(), ...Object.keys(STAPLE_FORMS)])];
const SEAFOOD = /고등어|연어|새우|멸치|오징어|명태|갈치|삼치|대구|가자미|미역|다시마|김|어묵|게맛살|바지락|홍합|전복/;

describe('⭐급식 순위(이사님 2026-06-19) — youaRankOf + buildRecoFacts 근거 주입', () => {
  it('youaRankOf — 수록 식재료는 순위/등장률, 미수록·_meta는 null(정직)', () => {
    const r = youaRankOf('당근');   // youa 98.6 상위권
    expect(r).not.toBeNull();
    expect(r!.topPct).toBeGreaterThanOrEqual(1);
    expect(r!.topPct).toBeLessThanOrEqual(100);
    expect(r!.pct).toBeGreaterThan(0);
    expect(youaRankOf('존재하지않는식재료xyz')).toBeNull();   // 미수록 — 0을 꼴등으로 위장 안 함
    expect(youaRankOf('_meta')).toBeNull();
  });
  it('동률 안전 순위 — 같은 등장률 식재료는 같은 순위(정수 등수 자의성 차단)', () => {
    const a = youaRankOf('당근'); const b = youaRankOf('두부');   // 둘 다 98.6
    if (a && b && a.pct === b.pct) expect(a.rank).toBe(b.rank);
  });
  it('buildRecoFacts — 추천 타깃 줄에 안심 톤 근거 절(서열·등수·% 금지)', () => {
    const r = buildRecoFacts({ likedIngredients: [], targetIngredient: '당근', target: '비타민A채소' });
    expect(r.text).toContain('자주 오르는 익숙한');   // 안심 톤
    expect(r.text).not.toContain('상위');            // 서열·등수 금지(이사님)
    expect(r.text).not.toMatch(/\d+\s*%/);           // % 노출 금지
  });
  it('buildRecoFacts — youa 미수록 타깃은 근거 절 생략(degrade)', () => {
    const r = buildRecoFacts({ likedIngredients: [], targetIngredient: '존재하지않는식재료xyz', target: '곡류' });
    expect(r.text).not.toContain('자주 오르는');
  });
});

describe('⭐F-18 buildRecoFacts suppressCousins — 슬롯 활성 시 사촌(경쟁 두부원) 제거', () => {
  const liked = ['감자', '소고기', '계란'];   // 감자→사촌 두부가 part(b)로 새던 케이스
  it('기본은 part(b) 사촌 줄을 포함(잘 먹는 음식 푸드체이닝)', () => {
    const r = buildRecoFacts({ likedIngredients: liked, target: '비타민A채소', targetIngredient: '단호박' });
    expect(r.text).toContain('[오늘 타깃');           // part(a) 슬롯 타깃
    expect(r.lines.length).toBeGreaterThan(1);        // part(b) 사촌/궁합 줄 존재
  });
  it('suppressCousins=true면 part(b) 제거 → [오늘 타깃] 한 줄만(슬롯과 경쟁하는 두부 사촌 차단)', () => {
    const r = buildRecoFacts({ likedIngredients: liked, target: '비타민A채소', targetIngredient: '단호박', suppressCousins: true });
    expect(r.text).toContain('단호박');               // 슬롯 음식은 유지
    expect(r.cousins.length).toBe(0);                 // 사촌 0(두부 등 경쟁 음식 미발생)
    expect(r.lines.every((l) => l.includes('[오늘 타깃') )).toBe(true);   // 타깃 줄만
  });
});

describe('A-11 normalizeFreqMap — ingredient-recipes → FreqMap', () => {
  it('A-11-1 정상 객체를 freq 내림차순 정규화', () => {
    const fm = normalizeFreqMap({ 당근: [{ name: '볶음밥', freq: 10 }, { name: '국', freq: 30 }] });
    expect(fm['당근'].map((x) => x.name)).toEqual(['국', '볶음밥']);
  });
  it('A-11-2 null/형식불량 → {} (graceful)', () => {
    expect(normalizeFreqMap(null)).toEqual({});
    expect(normalizeFreqMap('str')).toEqual({});
    expect(normalizeFreqMap(42)).toEqual({});
  });
  it('A-11-3 배열 아닌 값·잘못된 항목 제거', () => {
    const fm = normalizeFreqMap({ 당근: 'nope', 시금치: [{ name: '국', freq: 5 }, { bad: 1 }] });
    expect(fm['당근']).toBeUndefined();
    expect(fm['시금치']).toEqual([{ name: '국', freq: 5 }]);
  });
  it('A-11-4 빈 배열 키는 결과에서 제외', () => {
    expect(normalizeFreqMap({ 당근: [] })).toEqual({});
  });
});

describe('A-11 popularDishesFor — freqMap 빈객체 시 kit-matrix 폴백(죽은 코드 방지)', () => {
  it('A-11-5 freqMap 미주입이어도 kit-matrix로 인기 음식 반환', () => {
    const dishes = popularDishesFor('당근');   // freqMap 없이
    expect(Array.isArray(dishes)).toBe(true);
    expect(dishes.length).toBeGreaterThan(0);   // kit-matrix(dishesForIngredient) 폴백 동작
  });
  it('A-11-6 freqMap 빈객체여도 폴백 동작(graceful)', () => {
    const dishes = popularDishesFor('당근', {});
    expect(dishes.length).toBeGreaterThan(0);
  });
});

describe('A-01 Letter A 보존 — GROUP_INGREDIENTS 원본 불변(대조군)', () => {
  it('A-01-7 비타민A채소 원본 0번은 여전히 단호박(정렬 변경 없음)', () => {
    expect(GROUP_INGREDIENTS['비타민A채소'][0]).toBe('단호박');
  });
  it('A-01-7b 기타채소 원본 순서 유지(브로콜리 먼저)', () => {
    expect(GROUP_INGREDIENTS['기타채소'][0]).toBe('브로콜리');
  });
});

// ── ⭐ J-01 곁들임 안전 게이트(2026-06-19) — tray/매운/교차괴식 차단 ──────────────────
describe('J-01 garnishPairsOf / safeGarnishOf — 곁들임 안전(strongPairsOf는 무변경)', () => {
  it('J-01-1 garnishPairsOf ⊆ strongPairsOf 이고 tray-src 엣지 제외(두부 토마토는 tray라 빠짐)', () => {
    const sp = strongPairsOf('두부').map((n) => n.nm);
    const gp = garnishPairsOf('두부');
    expect(gp.every((n) => n.src !== 'tray')).toBe(true);                 // tray 제외
    expect(gp.every((n) => sp.includes(n.nm))).toBe(true);               // 부분집합(strong에서만 추림)
    expect(sp).toContain('토마토');                                       // strongPairsOf엔 tray 토마토 남음(TR-02 의도 보존)
    expect(gp.map((n) => n.nm)).not.toContain('토마토');                  // 곁들임 뷰에선 제거
  });
  it('J-01-2 safeGarnishOf(두부)에 김치 없음(매운류 차단) — strongPairsOf엔 있음', () => {
    expect(strongPairsOf('두부').some((n) => n.nm === '김치')).toBe(true);
    expect(safeGarnishOf('두부').some((n) => n.nm === '김치')).toBe(false);
  });
  it('J-01-3 [속성] 모든 대표의 safeGarnishOf에 매운류·tray 0(미래 그래프 재생성 회귀 가드)', () => {
    for (const r of ALL_REPS) {
      for (const n of safeGarnishOf(r)) {
        expect(isSpicyIngredient(n.nm)).toBe(false);
        expect(n.src).not.toBe('tray');
      }
    }
  });
  it('J-01-4 [속성] 유제품 대표 곁들임에 생선·해산물 0(생선↔유제품 교차괴식 가드)', () => {
    for (const dairy of ['치즈', '요거트', '우유']) {
      for (const n of safeGarnishOf(dairy)) expect(SEAFOOD.test(n.nm)).toBe(false);
    }
  });
  it('J-01-5 라이브 누수 봉합 — 두부 타깃·liked=김치 본문에 "김치 곁들" 없음', () => {
    const r = buildRecoFacts({ likedIngredients: ['김치'], target: '콩류', targetIngredient: '두부' });
    expect(r.lines[0]).not.toContain('김치');   // part(a) 슬롯 줄에 김치 곁들임 권유 없음
  });
});

// ── ⭐ J-02 popularDishesFor 메뉴 정제 ───────────────────────────────────────────────
describe('J-02 popularDishesFor — NEIS 원본명 정제·부적합 차단', () => {
  it('J-02-1 접두 분류태그·짠지 제거(당근: (간식)/깻잎지 안 나옴)', () => {
    const d = popularDishesFor('당근', FM);
    expect(d.length).toBeGreaterThan(0);
    expect(d.some((x) => x.startsWith('('))).toBe(false);
    expect(d).not.toContain('깻잎지');
    expect(d).not.toContain('(간식)꼬마김밥');
  });
  it('J-02-2 isSpicyDish 미탐 매운국 차단(소고기: 육개장 안 나옴)', () => {
    expect(popularDishesFor('소고기', FM)).not.toContain('육개장');
    expect(popularDishesFor('닭고기', FM)).not.toContain('닭개장');
  });
  it('J-02-3 [속성] 정제 산출물에 접두괄호·&접미·용량괄호 없음', () => {
    for (const r of ALL_REPS) {
      for (const dish of popularDishesFor(r, FM)) {
        expect(/^\(/.test(dish)).toBe(false);
        expect(/[&＆]/.test(dish)).toBe(false);
        expect(/\([^)]*\)$/.test(dish)).toBe(false);
      }
    }
  });
});

// ── ⭐ J-03/J-04 급식 표기 별칭 + 분모 정직화 ────────────────────────────────────────
describe('J-03 youaRankOf 별칭 — 표준명 불일치 봉합(% 날조 0)', () => {
  it('J-03-1 동의어·대표 매핑 전부 non-null', () => {
    for (const r of ['요거트', '달걀', '콩', '검은콩', '현미', '잡곡', '버섯', '쌀', '백미', '밀가루']) {
      expect(youaRankOf(r), r).not.toBeNull();
    }
  });
  it('J-03-2 별칭 값이 원천 키와 일치(요거트=요구르트·달걀=계란)', () => {
    expect(youaRankOf('요거트')!.pct).toBe(youaRankOf('요구르트')!.pct);
    expect(youaRankOf('달걀')!.pct).toBe(youaRankOf('계란')!.pct);
  });
  it('J-03-3 연어는 의도적 null(한국 영유아 급식 희소·정직)', () => {
    expect(youaRankOf('연어')).toBeNull();
  });
  it('J-04-1 [속성] 모든 대표가 youa 해소(연어만 예외)', () => {
    const nulls = ALL_REPS.filter((r) => !youaRankOf(r));
    expect(nulls).toEqual(['연어']);
  });
});

// ── ⭐ J-05 급식빈도 반영(안전가산) + OCR 리밸런싱 준비 ──────────────────────────────
describe('J-05 빈도 가중 — 라이브 우선 + youa 동률 가산(골든 보존)', () => {
  it('J-05-1 ingredientGioFreq 골든 보존(당근 184/2·요거트 0)', () => {
    expect(ingredientGioFreq('당근')).toEqual({ freq: 184, pct: 2 });   // 라이브=스냅샷 동일값 → 그린
    expect(ingredientGioFreq('요거트').freq).toBe(0);                    // 라이브 침묵 → GIO 폴백
    expect(ingredientGioFreq('아스파라거스')).toEqual({ freq: 0, pct: 100 });
  });
  it('J-05-2 rankIngredients 결정론 유지(동률 타이브레이크 삽입 후에도)', () => {
    const a = rankIngredients({ targetGroup: '비타민A채소', groupLevel: 'red', liked: [] });
    const b = rankIngredients({ targetGroup: '비타민A채소', groupLevel: 'red', liked: [] });
    expect(a).toEqual(b);
    expect(a[0].ing).toBe('당근');             // 최상위 불변(대조군)
    expect(a.at(-1)!.ing).toBe('단호박');      // 최하위 불변
  });
});

// ── ⭐ J-06 안심 톤(서열·등수·% 금지) ──────────────────────────────────────────────
describe('J-06 급식 근거 — 안심 톤만, 서열·% 금지(이사님 2026-06-19)', () => {
  it('J-06-1 [속성] 모든 그룹×대표 본문에 상위/등수/% 없음', () => {
    for (const [g, list] of Object.entries(GROUP_INGREDIENTS)) for (const ing of list) {
      const t = buildRecoFacts({ likedIngredients: [], target: g, targetIngredient: ing, freqMap: FM }).text;
      expect(t, `${g}|${ing}`).not.toContain('상위');
      expect(t, `${g}|${ing}`).not.toMatch(/\d+\s*%/);
      expect(t, `${g}|${ing}`).not.toContain('등장률');
    }
  });
  it('J-06-2 희소 재료(단호박 등장률 1.4%)는 "자주 오른다" 주장 안 함(정직)', () => {
    const t = buildRecoFacts({ likedIngredients: [], target: '비타민A채소', targetIngredient: '단호박', freqMap: FM }).text;
    expect(t).toContain('단호박');
    expect(t).not.toContain('자주 오르는');
  });
  it('J-06-3 흔한 재료(당근)는 안심 절 포함', () => {
    const t = buildRecoFacts({ likedIngredients: [], target: '비타민A채소', targetIngredient: '당근', freqMap: FM }).text;
    expect(t).toContain('자주 오르는 익숙한');
  });
});

// ── ⭐ J-07 괴식 추가 규칙(단↔짠·날곡물·과일매핑·튀김·김치앵커) ────────────────────────
describe('J-07 괴식 규칙 — 단↔짠/날곡물/과일매핑/초가공/김치앵커', () => {
  it('J-07-1 과일은 popularDishesFor가 빈 배열(배→너비아니구이 매핑 차단)', () => {
    expect(popularDishesFor('배', FM)).toEqual([]);
    expect(popularDishesFor('사과', FM)).toEqual([]);
  });
  it('J-07-2 단↔짠 차단: 유제품 곁들임에 생선·콩류 0 (생선↔콩 같은 짠↔짠은 허용=두부+멸치)', () => {
    for (const dairy of ['치즈', '요거트', '우유']) {
      for (const n of safeGarnishOf(dairy)) {
        expect(SEAFOOD.test(n.nm), `${dairy}+${n.nm}`).toBe(false);
        expect(GROUP_INGREDIENTS['콩류'].includes(n.nm), `${dairy}+${n.nm}`).toBe(false);
      }
    }
    expect(safeGarnishOf('두부').some((n) => n.nm === '멸치')).toBe(true);   // 짠↔짠 과차단 방지
  });
  it('J-07-3 [속성] 날곡물(생쌀·밀가루 등)은 어떤 곁들임에도 안 나옴', () => {
    const rawGrains = new Set(Object.keys(STAPLE_FORMS));
    for (const r of ALL_REPS) for (const n of safeGarnishOf(r)) expect(rawGrains.has(n.nm), `${r}+${n.nm}`).toBe(false);
  });
  it('J-07-4 [속성] popularDishesFor 산출물에 튀김·초가공·단음료 없음', () => {
    for (const r of ALL_REPS) for (const d of popularDishesFor(r, FM)) {
      expect(/튀김|돈가스|과자|사탕|젤리|초콜릿|사이다|콜라|탄산|아이스크림/.test(d), `${r}:${d}`).toBe(false);
    }
  });
  it('J-07-5 김치류 liked 앵커는 part(b)에서 제외("김치 → 섞어라" 차단)', () => {
    const r = buildRecoFacts({ likedIngredients: ['김치', '두부'], target: '비타민A채소', targetIngredient: '단호박' });
    expect(r.text).not.toContain('김치 →');
    expect(r.lines.some((l) => l.startsWith('두부 →'))).toBe(true);   // 비김치 앵커는 정상
  });
});

// ── ⭐ J-08 새벽 크론 런타임 리밸런싱(warmIngredientFreqFromSql) ─────────────────────
describe('J-08 warmIngredientFreqFromSql — 런타임 warm(급식 식단표+실기록·I-01-9 무손상)', () => {
  type Rows = { ingredients: string[] }[];
  const mockDb = (byTable: Record<string, Rows>) => ({
    from: (t: string) => ({ select: () => Promise.resolve({ data: byTable[t] || [], error: null }) }),
  });
  afterEach(() => resetIngredientFreqWarm());

  it('J-08-1 warm 성공 → ingredientGioFreq가 식단표 빈도 반영(라이브와 뒤집힘)', async () => {
    const rows: Rows = [];
    for (let i = 0; i < 30; i++) rows.push({ ingredients: ['브로콜리'] });   // 브로콜리 압도적 1위
    for (let i = 0; i < 5; i++) rows.push({ ingredients: ['당근'] });
    for (let i = 0; i < 22; i++) rows.push({ ingredients: [`기타${i}`] });   // 분모 20종+
    const r = await warmIngredientFreqFromSql(mockDb({ institution_menu_items: rows }));
    expect(r.ok).toBe(true);
    expect(isFreqWarmed()).toBe(true);
    expect(ingredientGioFreq('브로콜리').freq).toBe(30);
    expect(ingredientGioFreq('브로콜리').pct).toBeLessThan(ingredientGioFreq('당근').pct);   // 더 흔함=상위%↓
  });
  it('J-08-2 두 소스 합산(식단표 + 실기록 모두 등장 카운트)', async () => {
    const inst: Rows = []; for (let i = 0; i < 25; i++) inst.push({ ingredients: [`식단표${i}`, '당근'] });   // 당근 ×25
    const logs: Rows = []; for (let i = 0; i < 10; i++) logs.push({ ingredients: ['당근'] });                // 당근 +10
    const r = await warmIngredientFreqFromSql(mockDb({ institution_menu_items: inst, meal_logs: logs }));
    expect(r.ok).toBe(true);
    expect(ingredientGioFreq('당근').freq).toBe(35);   // 25(식단표) + 10(실기록)
  });
  it('J-08-3 SEASONING 제외(마늘·소금 미카운트)', async () => {
    const rows: Rows = []; for (let i = 0; i < 25; i++) rows.push({ ingredients: ['마늘', '소금', `채소${i}`] });
    await warmIngredientFreqFromSql(mockDb({ meal_logs: rows }));
    expect(ingredientGioFreq('마늘').freq).toBe(0);   // warm에 없음 → 폴백
  });
  it('J-08-4 빈약(<20종)·에러는 스냅샷 유지(safe degrade)', async () => {
    expect((await warmIngredientFreqFromSql(mockDb({ meal_logs: [{ ingredients: ['당근'] }] }))).ok).toBe(false);
    expect(isFreqWarmed()).toBe(false);
    const err = await warmIngredientFreqFromSql({ from: () => ({ select: () => Promise.resolve({ data: null, error: { m: 'x' } }) }) });
    expect(err.ok).toBe(false);
    expect(ingredientGioFreq('당근')).toEqual({ freq: 184, pct: 2 });   // 스냅샷 그대로
  });
  it('J-08-5 한쪽 테이블 없어도(institution 부재) 다른 쪽으로 degrade', async () => {
    const logs: Rows = []; for (let i = 0; i < 25; i++) logs.push({ ingredients: [`재료${i}`, '시금치'] });
    const r = await warmIngredientFreqFromSql(mockDb({ meal_logs: logs }));   // institution_menu_items → []
    expect(r.ok).toBe(true);
    expect(ingredientGioFreq('시금치').freq).toBe(25);
  });
  it('J-08-6 warm 후에도 GIO_FREQ(정적 권위표·I-01-9 비교 대상) 무변경', async () => {
    const rows: Rows = []; for (let i = 0; i < 25; i++) rows.push({ ingredients: [`x${i}`, '당근'] });
    await warmIngredientFreqFromSql(mockDb({ meal_logs: rows }));
    expect(GIO_FREQ['당근']).toEqual({ freq: 184, pct: 2 });   // 정적 파일/GIO 불변 → I-01-9 안전
  });
});
