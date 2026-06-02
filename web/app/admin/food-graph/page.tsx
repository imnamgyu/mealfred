/**
 * /admin/food-graph — 네트워크 매트릭스 검수 (2뷰).
 *  view=pairing(기본): 식재료↔식재료 궁합 네트워크(무방향). 셀=엣지·가중치.
 *    - pair(주황) 숫자=같이 쓰인 레시피 수(동시출현), bridge(녹색)=맛·식감 닮은 사촌.
 *  view=kit: 음식×식재료 이분 매트릭스(골고루 키트용). 셀=그 음식 레시피에 그 식재료가 메인으로 든 수.
 *    - "이 키트 식재료를 어떤 음식에 더하면 되나" (김치찌개에 치즈=0 → 추천 금지).
 * 데이터: lib/food-graph.json · lib/kit-dish-matrix.json (scripts/gen-food-graph.py · gen-kit-matrix.py)
 */
import Link from 'next/link';
import graph from '@/lib/food-graph.json';
import kit from '@/lib/kit-dish-matrix.json';
import ingLight from '@/public/ingredients-light.json';
import { neighborsOf } from '@/lib/foodGraph';

export const dynamic = 'force-dynamic';

type Edge = { a: string; b: string; kind: 'pair' | 'bridge'; strength: number; basis: string; count?: number };
type Ing = { nm: string; cat: string; grade: string; must_eat?: boolean; must_eat_tier?: string; must_eat_nutrient?: string };

const EDGES = (graph as { edges: Edge[]; meta?: Record<string, number | string> }).edges;
const GMETA = (graph as { meta?: Record<string, number | string> }).meta || {};
const GNODES = (graph as { nodes?: string[] }).nodes || [];
const ING = (ingLight as { ingredients: Ing[] }).ingredients;
const KIT = kit as { dishes: { key: string; em: string; n: number }[]; cells: Record<string, Record<string, number>>; scores?: Record<string, Record<string, number>>; ingredients: string[]; meta: Record<string, number | string> };

const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const EMAP = new Map<string, Edge>();
EDGES.forEach((e) => EMAP.set(ekey(e.a, e.b), e));

const GRADE_RANK: Record<string, number> = { 자주: 0, 가끔: 1, 드물게: 2, 향신료: 3 };
const SETS: Record<string, { label: string; filter: (x: Ing) => boolean }> = {
  'core-freq': { label: '필수 core + ⭐3', filter: (x) => x.must_eat_tier === 'core' || x.grade === '자주' },
  core: { label: '필수 core(19)', filter: (x) => x.must_eat_tier === 'core' },
  freq: { label: '⭐3 자주(14)', filter: (x) => x.grade === '자주' },
  mustall: { label: '💎 보석 전체(48)', filter: (x) => !!x.must_eat },
  all: { label: '전체(155)', filter: () => true },
};

function pairCell(e: Edge | undefined) {
  if (!e) return { bg: 'transparent', fg: '#D1D5DB', txt: '·', title: '' };
  if (e.kind === 'bridge') return { bg: '#E3F4E8', fg: '#1B7A3D', txt: '사촌', title: `사촌(닮음) · ${e.basis}` };
  const c = e.count ?? e.strength;
  return { bg: c >= 15 ? '#FBD9B8' : c >= 7 ? '#FDEBD6' : '#FCF5EC', fg: '#B45309', txt: String(c), title: `궁합 · 같이 쓰는 레시피 ${c}개` };
}
function kitCell(score: number) {
  if (!score) return { bg: 'transparent', fg: '#E5E7EB', txt: '·' };
  const bg = score >= 3 ? '#A9DCC0' : score >= 2 ? '#D2EEDC' : '#EFF8F2';
  return { bg, fg: '#1B7A3D', txt: String(score) };
}

function sortFoods(list: Ing[]) {
  return [...list].sort((a, b) => {
    const ma = a.must_eat_tier === 'core' ? 0 : a.must_eat ? 1 : 2;
    const mb = b.must_eat_tier === 'core' ? 0 : b.must_eat ? 1 : 2;
    if (ma !== mb) return ma - mb;
    const g = (GRADE_RANK[a.grade] ?? 9) - (GRADE_RANK[b.grade] ?? 9);
    return g !== 0 ? g : a.cat.localeCompare(b.cat);
  });
}

export default async function FoodGraphMatrix({ searchParams }: { searchParams: Promise<{ set?: string; view?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === 'kit' ? 'kit' : 'pairing';
  const setKey = sp.set && SETS[sp.set] ? sp.set : (view === 'kit' ? 'mustall' : 'core-freq');
  const set = SETS[setKey];
  const foods = sortFoods(ING.filter(set.filter));
  const tab = (v: string, label: string) => (
    <Link href={`/admin/food-graph?view=${v}`} style={{ fontSize: 13, fontWeight: view === v ? 800 : 600, padding: '7px 14px', borderRadius: 9, textDecoration: 'none', color: view === v ? '#fff' : '#4B5563', background: view === v ? '#1a2b4a' : '#EEF0F3' }}>{label}</Link>
  );
  const setChips = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 10px' }}>
      {Object.entries(SETS).map(([k, v]) => (
        <Link key={k} href={`/admin/food-graph?view=${view}&set=${k}`} style={{ fontSize: 12, fontWeight: k === setKey ? 800 : 600, padding: '6px 11px', borderRadius: 8, textDecoration: 'none', color: k === setKey ? '#fff' : '#4B5563', background: k === setKey ? '#C45A00' : '#F3F4F6', border: '1px solid #E5E7EB' }}>{v.label}{view === 'kit' ? ' (열)' : ''}</Link>
      ))}
    </div>
  );

  return (
    <main style={{ padding: '24px 28px', fontFamily: 'Pretendard, sans-serif', maxWidth: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a2b4a' }}>🕸 네트워크 매트릭스</h1>
      {(() => {
        const fmt = (v: number | string | undefined) => Number(v || 0).toLocaleString('en-US');
        const stats: [string, string][] = [
          ['🥕 정제 식재료(도감)', `${ING.length}종`],
          ['🍲 음식 형태(키트)', `${KIT.dishes.length}형태`],
          ['🕸 궁합 그래프', `노드 ${GNODES.length} · 페어 ${fmt(GMETA.pairs)} · 사촌 ${fmt(GMETA.bridges)}`],
          ['📊 키트 채점 셀', `${fmt(KIT.meta?.scored_cells)}칸`],
          ['📚 수집 메뉴 코퍼스', `레시피 ${fmt(KIT.meta?.corpus_recipes)} + 식약처 ${fmt(KIT.meta?.corpus_mfds)} + 급식 ${fmt(KIT.meta?.corpus_neis_unique)} → learned ${fmt(KIT.meta?.learned_total)}`],
        ];
        return (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 4px' }}>
            {stats.map(([k, v]) => (
              <div key={k} style={{ background: '#FFF6EC', border: '1px solid #FFD8B0', borderRadius: 10, padding: '8px 13px' }}>
                <div style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 700, marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 15, color: '#C45A00', fontWeight: 800 }}>{v}</div>
              </div>
            ))}
          </div>
        );
      })()}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>{tab('pairing', '식재료 ↔ 식재료 (궁합)')}{tab('kit', '음식 × 식재료 (골고루 키트)')}</div>

      {view === 'pairing' ? (
        <PairingView foods={foods} setKey={setKey} setChips={setChips} />
      ) : (
        <KitView foods={foods} setChips={setChips} />
      )}
    </main>
  );

  // ── 식재료↔식재료 궁합 ──
  function PairingView({ foods, setChips }: { foods: Ing[]; setKey: string; setChips: React.ReactNode }) {
    let inView = 0;
    const names = foods.map((f) => f.nm);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (EMAP.has(ekey(names[i], names[j]))) inView++;
    return (
      <>
        <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 8, lineHeight: 1.6 }}>
          무방향 · <b>가중치 있음</b>. <b style={{ color: '#B45309' }}>주황=궁합(pair)</b> 숫자=레시피 <b>동시출현</b> 수, <b style={{ color: '#1B7A3D' }}>녹색=사촌(bridge)</b> 맛·식감 닮음. 셀 hover=근거.
        </p>
        <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 4 }}>전체 pair {GMETA.pairs ?? 0} · bridge {GMETA.bridges ?? 0} · 레시피 {GMETA.recipes_used ?? 0} ㅣ 이 뷰 {foods.length}종 · 엣지 {inView}</div>
        {setChips}
        <div style={{ overflow: 'auto', border: '1px solid #ECECEC', borderRadius: 10, maxHeight: '70vh' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 10 }}>
            <thead><tr><th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, background: '#fff', minWidth: 92, borderBottom: '2px solid #E5E7EB' }} />{foods.map((f) => <th key={f.nm} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#FBFBFA', borderBottom: '2px solid #E5E7EB', padding: '4px 2px', height: 80, verticalAlign: 'bottom' }}><div style={{ writingMode: 'vertical-rl', whiteSpace: 'nowrap', fontWeight: 700, color: f.must_eat_tier === 'core' ? '#C45A00' : '#4B5563', margin: '0 auto' }}>{f.must_eat ? '💎' : f.grade === '자주' ? '⭐' : ''}{f.nm}</div></th>)}</tr></thead>
            <tbody>{foods.map((rf, i) => <tr key={rf.nm}><th style={{ position: 'sticky', left: 0, zIndex: 1, background: '#fff', textAlign: 'right', padding: '2px 8px', whiteSpace: 'nowrap', fontWeight: 700, color: rf.must_eat_tier === 'core' ? '#C45A00' : '#374151', borderRight: '1px solid #EEE' }}>{rf.must_eat ? '💎' : rf.grade === '자주' ? '⭐' : ''}{rf.nm}</th>{foods.map((cf, j) => { if (i === j) return <td key={cf.nm} style={{ width: 26, background: '#1a2b4a' }} />; const c = pairCell(EMAP.get(ekey(rf.nm, cf.nm))); return <td key={cf.nm} title={c.title} style={{ width: 26, height: 22, textAlign: 'center', background: c.bg, color: c.fg, fontWeight: 700, fontSize: c.txt === '사촌' ? 8 : 9, borderRight: '1px solid #F3F4F6', borderBottom: '1px solid #F3F4F6' }}>{c.txt}</td>; })}</tr>)}</tbody>
          </table>
        </div>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1a2b4a', margin: '22px 0 8px' }}>식재료별 전체 이웃 <span style={{ fontWeight: 600, fontSize: 12, color: '#9CA3AF' }}>(뷰 밖 포함·검수용)</span></h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 10 }}>{foods.map((f) => { const nb = neighborsOf(f.nm); const br = nb.filter((n) => n.kind === 'bridge'); const pr = nb.filter((n) => n.kind === 'pair'); return <div key={f.nm} style={{ border: '1px solid #ECECEC', borderRadius: 9, padding: '10px 12px', background: '#fff' }}><div style={{ fontWeight: 800, color: '#1a2b4a', fontSize: 13 }}>{f.must_eat ? '💎 ' : f.grade === '자주' ? '⭐ ' : ''}{f.nm}</div>{br.length > 0 && <div style={{ marginTop: 5, fontSize: 11.5, color: '#1B7A3D' }}><b>사촌</b> {br.map((n) => n.nm).join(' · ')}</div>}{pr.length > 0 && <div style={{ marginTop: 4, fontSize: 11.5, color: '#B45309' }}><b>궁합</b> {pr.slice(0, 12).map((n) => `${n.nm}(${n.count ?? n.strength})`).join(' · ')}</div>}{nb.length === 0 && <div style={{ marginTop: 5, fontSize: 11, color: '#D1D5DB' }}>연결 없음(고립)</div>}</div>; })}</div>
      </>
    );
  }

  // ── 음식 × 식재료 (골고루 키트) ──
  function KitView({ foods, setChips }: { foods: Ing[]; setChips: React.ReactNode }) {
    const dishes = KIT.dishes;
    const scoreOf = (dishKey: string, nm: string) => KIT.scores?.[dishKey]?.[nm] || 0;
    const countOf = (dishKey: string, nm: string) => KIT.cells[dishKey]?.[nm] || 0;
    return (
      <>
        <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 8, lineHeight: 1.6 }}>
          <b>행 = 음식(조리 형태)</b>, <b>열 = 식재료</b>. 셀 숫자 = <b>LLM 정성 적합도 0~3</b>(3=아주 자연스러움·2=잘 어울림·1=가능). <b>빈칸 = 넣지 마라</b>(김치찌개에 치즈 같은 것). LLM이 레시피 동시출현(증거)을 보고 판단+적대검수, 코퍼스 갭(톳 등)도 채움. 열은 칩으로 전환(기본 💎보석=키트 후보).
        </p>
        <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 4 }}>음식 {dishes.length}형태 · 채점 셀 {KIT.meta?.scored_cells ?? 0} · 레시피 {KIT.meta?.recipes_used ?? 0}개 증거 ㅣ 이 뷰 식재료(열) {foods.length}종</div>
        {setChips}
        <div style={{ overflow: 'auto', border: '1px solid #ECECEC', borderRadius: 10, maxHeight: '70vh' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 10 }}>
            <thead><tr><th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, background: '#fff', minWidth: 104, borderBottom: '2px solid #E5E7EB' }} />{foods.map((f) => <th key={f.nm} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#FBFBFA', borderBottom: '2px solid #E5E7EB', padding: '4px 2px', height: 80, verticalAlign: 'bottom' }}><div style={{ writingMode: 'vertical-rl', whiteSpace: 'nowrap', fontWeight: 700, color: f.must_eat_tier === 'core' ? '#C45A00' : '#4B5563', margin: '0 auto' }}>{f.must_eat ? '💎' : ''}{f.nm}</div></th>)}</tr></thead>
            <tbody>{dishes.map((d) => <tr key={d.key}><th style={{ position: 'sticky', left: 0, zIndex: 1, background: '#fff', textAlign: 'right', padding: '2px 8px', whiteSpace: 'nowrap', fontWeight: 700, color: '#374151', borderRight: '1px solid #EEE' }}>{d.em} {d.key} <span style={{ color: '#C7C7C7', fontWeight: 500 }}>{d.n}</span></th>{foods.map((f) => { const sc = scoreOf(d.key, f.nm); const c = kitCell(sc); const cnt = countOf(d.key, f.nm); return <td key={f.nm} title={sc ? `${d.key} + ${f.nm} — 적합도 ${sc}/3 (레시피 동시출현 ${cnt})` : `${d.key} + ${f.nm} — 0(넣지 마라)`} style={{ width: 26, height: 22, textAlign: 'center', background: c.bg, color: c.fg, fontWeight: 700, fontSize: 9, borderRight: '1px solid #F3F4F6', borderBottom: '1px solid #F3F4F6' }}>{c.txt}</td>; })}</tr>)}</tbody>
          </table>
        </div>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1a2b4a', margin: '22px 0 8px' }}>키트 식재료별 → 어떤 음식에 <span style={{ fontWeight: 600, fontSize: 12, color: '#9CA3AF' }}>(가이드 미리보기)</span></h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 10 }}>{foods.map((f) => { const ds = dishes.map((d) => ({ k: d.key, em: d.em, s: scoreOf(d.key, f.nm) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s); const best = ds.filter((x) => x.s >= 2); return <div key={f.nm} style={{ border: '1px solid #ECECEC', borderRadius: 9, padding: '10px 12px', background: '#fff' }}><div style={{ fontWeight: 800, color: '#1a2b4a', fontSize: 13 }}>{f.must_eat ? '💎 ' : ''}{f.nm} <span style={{ fontWeight: 500, fontSize: 10.5, color: '#9CA3AF' }}>{f.cat.replace('_', '·')}</span></div>{best.length > 0 && <div style={{ marginTop: 5, fontSize: 11.5, color: '#1B7A3D', fontWeight: 600 }}>👍 {best.slice(0, 10).map((x) => `${x.em}${x.k}(${x.s})`).join(' · ')}</div>}{ds.filter((x) => x.s === 1).length > 0 && <div style={{ marginTop: 3, fontSize: 11, color: '#9CA3AF' }}>가능 {ds.filter((x) => x.s === 1).slice(0, 10).map((x) => `${x.k}`).join(' · ')}</div>}{ds.length === 0 && <div style={{ marginTop: 5, fontSize: 11, color: '#D9534F' }}>⚠ 어울리는 음식 없음</div>}</div>; })}</div>
      </>
    );
  }
}
