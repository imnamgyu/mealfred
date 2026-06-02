/**
 * /admin/food-graph — 음식↔식재료 궁합 네트워크 매트릭스(샘플 검수용).
 * 행·열 = 식재료, 셀 = 엣지. bridge(닮음/사촌) 녹색 · pair(궁합/곁들임) 주황 + 가중치(숫자).
 *   - pair 셀 숫자 = 같이 쓰인 레시피 수(count), bridge 셀 = 사촌(strength 3 고정).
 * 기본 집합 = 필수 영양보석 core(19) + ⭐3 자주(14). ?set= 으로 전환.
 * 데이터: lib/food-graph.json (scripts/gen-food-graph.py)
 */
import Link from 'next/link';
import graph from '@/lib/food-graph.json';
import ingLight from '@/public/ingredients-light.json';
import { neighborsOf } from '@/lib/foodGraph';

export const dynamic = 'force-dynamic';

type Edge = { a: string; b: string; kind: 'pair' | 'bridge'; strength: number; basis: string; count?: number };
type Ing = { nm: string; cat: string; grade: string; must_eat?: boolean; must_eat_tier?: string; must_eat_nutrient?: string; em?: string };

const EDGES = (graph as { edges: Edge[]; meta?: Record<string, number> }).edges;
const META = (graph as { meta?: Record<string, number> }).meta || {};
const ING = (ingLight as { ingredients: Ing[] }).ingredients;
const byNm = new Map(ING.map((x) => [x.nm, x]));

const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const EMAP = new Map<string, Edge>();
EDGES.forEach((e) => EMAP.set(ekey(e.a, e.b), e));

const GRADE_RANK: Record<string, number> = { 자주: 0, 가끔: 1, 드물게: 2, 향신료: 3 };

const SETS: Record<string, { label: string; filter: (x: Ing) => boolean }> = {
  'core-freq': { label: '필수 core + ⭐3 자주', filter: (x) => x.must_eat_tier === 'core' || x.grade === '자주' },
  core: { label: '필수 core (19)', filter: (x) => x.must_eat_tier === 'core' },
  freq: { label: '⭐3 자주 (14)', filter: (x) => x.grade === '자주' },
  mustall: { label: '💎 영양보석 전체 (48)', filter: (x) => !!x.must_eat },
  all: { label: '전체 (155)', filter: () => true },
};

function cell(e: Edge | undefined) {
  if (!e) return { bg: 'transparent', fg: '#D1D5DB', txt: '·', title: '' };
  if (e.kind === 'bridge') return { bg: '#E3F4E8', fg: '#1B7A3D', txt: '사촌', title: `사촌(닮음) · ${e.basis}` };
  const c = e.count ?? e.strength;
  const bg = c >= 15 ? '#FBD9B8' : c >= 7 ? '#FDEBD6' : '#FCF5EC';
  return { bg, fg: '#B45309', txt: String(c), title: `궁합 · 같이 쓰는 레시피 ${c}개` };
}

export default async function FoodGraphMatrix({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const sp = await searchParams;
  const setKey = sp.set && SETS[sp.set] ? sp.set : 'core-freq';
  const set = SETS[setKey];

  const foods = ING.filter(set.filter).sort((a, b) => {
    const ma = a.must_eat_tier === 'core' ? 0 : a.must_eat ? 1 : 2;
    const mb = b.must_eat_tier === 'core' ? 0 : b.must_eat ? 1 : 2;
    if (ma !== mb) return ma - mb;
    const g = (GRADE_RANK[a.grade] ?? 9) - (GRADE_RANK[b.grade] ?? 9);
    if (g !== 0) return g;
    return a.cat.localeCompare(b.cat);
  });
  const names = foods.map((f) => f.nm);

  // 뷰 내 엣지 수
  let inView = 0;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (EMAP.has(ekey(names[i], names[j]))) inView++;

  return (
    <main style={{ padding: '24px 28px', fontFamily: 'Pretendard, sans-serif', maxWidth: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a2b4a' }}>🕸 궁합 네트워크 매트릭스</h1>
      <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 6, lineHeight: 1.6 }}>
        무방향 그래프 · <b>가중치 있음</b>(바이너리 아님). <b style={{ color: '#B45309' }}>주황 = 궁합(pair)</b> 숫자는 우리 레시피에서 <b>같이 쓰인 횟수</b>(동시출현). <b style={{ color: '#1B7A3D' }}>녹색 = 사촌(bridge)</b> 맛·식감 닮음(큐레이션). 셀에 마우스 올리면 근거.
      </p>
      <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 4 }}>
        전체: pair {META.pairs ?? 0} · bridge {META.bridges ?? 0} · 레시피 {META.recipes_used ?? 0}개 사용 · 동시출현 최소 {META.min_co ?? 4}회 · 노드별 top{META.topk ?? 14} ㅣ <b>이 뷰</b>: {names.length}종 · 엣지 {inView}개
      </div>

      {/* 집합 필터 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 10px' }}>
        {Object.entries(SETS).map(([k, v]) => (
          <Link key={k} href={`/admin/food-graph?set=${k}`} style={{
            fontSize: 12, fontWeight: k === setKey ? 800 : 600, padding: '6px 11px', borderRadius: 8, textDecoration: 'none',
            color: k === setKey ? '#fff' : '#4B5563', background: k === setKey ? '#C45A00' : '#F3F4F6', border: '1px solid #E5E7EB',
          }}>{v.label}</Link>
        ))}
      </div>

      {/* 매트릭스 */}
      <div style={{ overflow: 'auto', border: '1px solid #ECECEC', borderRadius: 10, maxHeight: '74vh' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, background: '#fff', minWidth: 92, borderBottom: '2px solid #E5E7EB' }} />
              {foods.map((f) => (
                <th key={f.nm} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#FBFBFA', borderBottom: '2px solid #E5E7EB', padding: '4px 2px', height: 78, verticalAlign: 'bottom' }}>
                  <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', whiteSpace: 'nowrap', fontWeight: 700, color: f.must_eat_tier === 'core' ? '#C45A00' : '#4B5563', margin: '0 auto' }}>
                    {f.must_eat ? '💎' : f.grade === '자주' ? '⭐' : ''}{f.nm}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {foods.map((rf, i) => (
              <tr key={rf.nm}>
                <th style={{ position: 'sticky', left: 0, zIndex: 1, background: '#fff', textAlign: 'right', padding: '2px 8px', whiteSpace: 'nowrap', fontWeight: 700, color: rf.must_eat_tier === 'core' ? '#C45A00' : '#374151', borderRight: '1px solid #EEE' }}>
                  {rf.must_eat ? '💎' : rf.grade === '자주' ? '⭐' : ''}{rf.nm}
                </th>
                {foods.map((cf, j) => {
                  if (i === j) return <td key={cf.nm} style={{ width: 26, height: 22, background: '#1a2b4a' }} />;
                  const c = cell(EMAP.get(ekey(rf.nm, cf.nm)));
                  return (
                    <td key={cf.nm} title={c.title} style={{ width: 26, height: 22, textAlign: 'center', background: c.bg, color: c.fg, fontWeight: 700, fontSize: c.txt === '사촌' ? 8 : 9, borderRight: '1px solid #F3F4F6', borderBottom: '1px solid #F3F4F6', cursor: c.title ? 'help' : 'default' }}>
                      {c.txt}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 식재료별 전체 이웃(뷰 밖 포함) — 샘플 검수용 */}
      <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1a2b4a', margin: '22px 0 8px' }}>식재료별 전체 이웃 <span style={{ fontWeight: 600, fontSize: 12, color: '#9CA3AF' }}>(뷰 밖 연결도 포함 · 검수용)</span></h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 10 }}>
        {foods.map((f) => {
          const nb = neighborsOf(f.nm);
          const br = nb.filter((n) => n.kind === 'bridge');
          const pr = nb.filter((n) => n.kind === 'pair');
          return (
            <div key={f.nm} style={{ border: '1px solid #ECECEC', borderRadius: 9, padding: '10px 12px', background: '#fff' }}>
              <div style={{ fontWeight: 800, color: '#1a2b4a', fontSize: 13 }}>{f.must_eat ? '💎 ' : f.grade === '자주' ? '⭐ ' : ''}{f.nm} <span style={{ fontWeight: 500, fontSize: 10.5, color: '#9CA3AF' }}>{f.cat.replace('_', '·')}{f.must_eat_nutrient ? ` · ${f.must_eat_nutrient}` : ''}</span></div>
              {br.length > 0 && <div style={{ marginTop: 5, fontSize: 11.5, color: '#1B7A3D' }}><b>사촌</b> {br.map((n) => n.nm).join(' · ')}</div>}
              {pr.length > 0 && <div style={{ marginTop: 4, fontSize: 11.5, color: '#B45309' }}><b>궁합</b> {pr.slice(0, 12).map((n) => `${n.nm}(${n.count ?? n.strength})`).join(' · ')}</div>}
              {nb.length === 0 && <div style={{ marginTop: 5, fontSize: 11, color: '#D1D5DB' }}>연결 없음(고립)</div>}
            </div>
          );
        })}
      </div>
    </main>
  );
}
