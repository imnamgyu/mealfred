/**
 * lib/graphSource.ts — 추천 네트워크 데이터의 *단일 읽기 경로* (서버 전용).
 *
 * 왜 있나(coaching-db-migration-handoff §4 + #2): 사촌·궁합·음식×식재료가 SQL로 이관됐다.
 *   "추천 로직은 그대로" 두고 "데이터를 *어디서* 읽는가"만 이 한 겹으로 격리해 무중단 전환을 대비한다.
 *   소비 함수(strongPairsOf·scoreCombo·neighborsOf·verifiedCousinsOf·dishesForIngredient)는 *byte 무변경* —
 *   여기 내부만 (스냅샷 JSON ↔ SQL) 로 바뀐다. 반환 shape = 기존 JSON '이름(name) shape'(= 접점 계약).
 *
 * 2층 소스:
 *   · L2 스냅샷(기본·동기): lib/food-graph.json·kit-dish-matrix.json 을 import.
 *       이 파일들은 데이터 세션이 *SQL→이름기반 JSON*으로 야간 export(동일 path·shape) → 클라/SSG/빌드가 그대로 읽음.
 *   · L1 SQL(서버·비동기·항상 ON·2026-06-21 플래그 졸업): warmGraphFromSql(db)가 ingredient_edges⋈ingredients로
 *       id→name resolve해 메모리 캐시를 교체. 크론이 매 실행 자녀 루프 전 1회 호출 → 야간 학습 강화가 재배포 없이 반영. 실패/빈약하면 L2(JSON) 유지(safe degrade).
 *
 * 규칙(handoff): 이 데이터는 *여기서만* 읽는다 — 엔진 모듈은 직접 import 금지(전환 시 누락 방지).
 */
import foodGraphJson from './food-graph.json';
import dishMatrixJson from './kit-dish-matrix.json';
import nutrientMapJson from './nutrient-map.generated.json';
import ingredientsLightJson from '../public/ingredients-light.json';
import recipeFreqJson from '../public/ingredient-recipes.json';

// ── 메모리 캐시 — 기본 L2(JSON·lazy), warm되면 L1(SQL)로 교체. getX()는 항상 동기(소비 함수 무변경). ──
// ⚠️ JSON은 *게터 안에서만* 참조한다(모듈 최상위에서 .edges 읽으면 tree-shake 깨져 클라 번들에 food-graph 누수).
//    null = 미초기화 → 첫 호출에 JSON으로 lazy 초기화. (getNutrientMap만 쓰는 클라는 edges/matrix JSON을 안 당김.)
let _edges: unknown = null;
let _dishMatrix: unknown = null;
let _warmed = false;

// warm 시 소비 모듈의 lazy 인덱스(foodGraph ADJ·kitGuide IDX)를 무효화하도록 등록받는다.
// (graphSource가 소비 모듈을 import하면 순환 → 소비 모듈이 자기 무효화 콜백을 등록하는 방향만 허용.)
const _invalidators: Array<() => void> = [];
export function registerGraphInvalidator(fn: () => void): void { _invalidators.push(fn); }

/** food-graph edges 배열(궁합 pair·사촌 bridge·식판 tray). a/b는 '이름'. foodGraph.ts가 RawEdge[]로 cast. */
export function getEdges(): unknown { if (_edges === null) _edges = (foodGraphJson as { edges: unknown[] }).edges; return _edges; }
/** kit-dish-matrix(음식×식재료 cells·scores·dishes). comboMatrix/kitGuide가 KitData로 cast. */
export function getDishMatrix(): unknown { if (_dishMatrix === null) _dishMatrix = dishMatrixJson; return _dishMatrix; }
/** nutrient-map.generated(농진청 영양맵) — 현재 JSON 유지(SQL 이관 대상 아님). */
export function getNutrientMap(): unknown { return nutrientMapJson; }
/** ingredients-light(도감 경량: nm·cat) — 크론 catMap 소스. */
export function getIngredientsLight(): unknown { return ingredientsLightJson; }
/** ingredient-recipes(또래 급식 빈도) — 크론 freqMap 소스. */
export function getRecipeFreq(): unknown { return recipeFreqJson; }
/** 현재 캐시가 SQL(L1)로 채워졌는가. */
export function isGraphWarmed(): boolean { return _warmed; }

// supabase 클라의 .select()는 thenable(PostgrestFilterBuilder)이라 Promise가 아닌 PromiseLike로 받는다.
type Queryable = { from: (table: string) => { select: (cols: string) => PromiseLike<{ data: unknown; error: unknown }> } };
type WarmResult = { ok: boolean; edges: number; cells: number; reason?: string };

/**
 * L1 — 서버(크론) 전용 SQL warm. ingredient_edges/dish_ingredient_stats를 ingredients(id→name)로 resolve해
 * 캐시를 '이름 shape'로 교체. 실패하거나 SQL이 빈약하면(이관 미완·부분) L2(JSON) 유지 = safe degrade.
 * 성공 시 등록된 무효화 콜백(ADJ·IDX) 호출 → 다음 빌드가 SQL 데이터로 재구성.
 */
export async function warmGraphFromSql(db: Queryable): Promise<WarmResult> {
  try {
    const { data: ings, error: e1 } = await db.from('ingredients').select('id,name');
    if (e1 || !Array.isArray(ings) || !ings.length) return { ok: false, edges: 0, cells: 0, reason: 'no ingredients' };
    const name: Record<string, string> = {};
    for (const r of ings as Array<{ id: string; name: string }>) name[r.id] = r.name;

    const { data: edgeRows, error: e2 } = await db.from('ingredient_edges')
      .select('a_id,b_id,kind,count,lift,grade,strength,src,basis,verified,tray');
    if (e2 || !Array.isArray(edgeRows)) return { ok: false, edges: 0, cells: 0, reason: 'no edges' };
    const edges = (edgeRows as Array<Record<string, unknown>>)
      .map((e) => ({
        a: name[e.a_id as string], b: name[e.b_id as string],
        kind: e.kind, strength: e.strength, basis: e.basis, count: e.count,
        lift: e.lift, grade: e.grade, verified: e.verified, tray: e.tray, src: e.src,
      }))
      .filter((e) => e.a && e.b);   // id가 ingredients에 없으면 드롭(고아 엣지 방지)

    const { data: dishRows, error: e3 } = await db.from('dish_ingredient_stats').select('dish,ingredient_id,count,score');
    if (e3 || !Array.isArray(dishRows)) return { ok: false, edges: edges.length, cells: 0, reason: 'no dish stats' };
    const cells: Record<string, Record<string, number>> = {};
    const scores: Record<string, Record<string, number>> = {};
    for (const d of dishRows as Array<Record<string, unknown>>) {
      const ing = name[d.ingredient_id as string]; if (!ing) continue;
      const dish = d.dish as string;
      (cells[dish] ||= {})[ing] = Number(d.count) || 0;
      if (d.score != null) (scores[dish] ||= {})[ing] = Number(d.score);
    }

    // 안전 게이트 — SQL이 빈약하면(이관 실패·부분 적재) 추천이 무너지므로 JSON 유지.
    if (edges.length < 100 || Object.keys(cells).length < 10) {
      return { ok: false, edges: edges.length, cells: Object.keys(cells).length, reason: 'sql too sparse — kept JSON snapshot' };
    }

    _edges = edges;
    // dishes(이모지·라벨 메타)는 SQL에 없으므로 JSON 유지, 수치(cells·scores)만 SQL로 교체.
    _dishMatrix = { ...(dishMatrixJson as object), cells, scores };
    _warmed = true;
    for (const fn of _invalidators) fn();   // ADJ·IDX 무효화 → 다음 빌드가 SQL 반영
    return { ok: true, edges: edges.length, cells: Object.keys(cells).length };
  } catch (e) {
    return { ok: false, edges: 0, cells: 0, reason: e instanceof Error ? e.message : String(e) };
  }
}
