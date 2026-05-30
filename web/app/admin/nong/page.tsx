/**
 * /admin/nong — 농진청 국가표준식품성분표 10.4 전체(3,366식품) 브라우즈(PC 어드민).
 * 내부 보유 원천(도감 노출 X). 검색(식품명·대표 식재료) + 대표 식재료 정규화 확인.
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type NF = { code: string; name: string; food_group: string | null; rep: string | null; nutrients: Record<string, number | null>; covers: string[] | null };

export default async function AdminNong({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 480, margin: '60px auto', padding: 24, fontFamily: 'Pretendard' }}><p style={{ color: '#6B7280' }}>🔒 관리자 전용. <Link href="/admin" style={{ color: '#FF6B1A' }}>← 콘솔</Link></p></main>;
  }
  const db = createSupabaseAdmin();
  const { count } = await db.from('nong_foods').select('*', { count: 'exact', head: true });
  let query = db.from('nong_foods').select('code,name,food_group,rep,nutrients,covers').order('rep', { ascending: true }).limit(300);
  if (q && q.trim()) query = db.from('nong_foods').select('code,name,food_group,rep,nutrients,covers').or(`name.ilike.%${q.trim()}%,rep.ilike.%${q.trim()}%`).limit(300);
  const { data } = await query;
  const rows = (data || []) as NF[];

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a2b4a' }}>🌾 농진청 식품성분표 10.4</h1>
          <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>내부 원천 {count ?? '—'}식품 (도감 노출 X) · 부위/형태는 <b>대표 식재료</b>로 정규화</p>
        </div>
        <Link href="/admin" style={{ fontSize: 13, color: '#FF6B1A', fontWeight: 700, textDecoration: 'none' }}>← 콘솔</Link>
      </header>

      <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input name="q" defaultValue={q || ''} placeholder="식품명·대표 식재료 검색 (예: 소고기, 시금치)" style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 14, fontFamily: 'inherit' }} />
        <button type="submit" style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#1a2b4a', color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>검색</button>
      </form>
      <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>{q ? `'${q}' 결과 ${rows.length}건` : `대표 식재료순 ${rows.length}건 표시(검색으로 좁히기)`}</p>

      <div style={{ overflowX: 'auto', background: 'white', border: '1px solid #ECECEC', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 820 }}>
          <thead><tr style={{ background: '#F0F7F0', color: '#1B5E20', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>대표</th><th style={{ padding: '8px 12px' }}>농진청 식품명</th><th style={{ padding: '8px 12px' }}>식품군</th><th style={{ padding: '8px 12px', textAlign: 'right' }}>kcal</th><th style={{ padding: '8px 12px', textAlign: 'right' }}>단백</th><th style={{ padding: '8px 12px' }}>공급 영양소(15%↑)</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} style={{ borderTop: '1px solid #F0F0F0' }}>
                <td style={{ padding: '7px 12px', fontWeight: 800, color: '#C45A00', whiteSpace: 'nowrap' }}>{r.rep}</td>
                <td style={{ padding: '7px 12px', color: '#1a2b4a' }}>{r.name}</td>
                <td style={{ padding: '7px 12px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{r.food_group}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#6B7280' }}>{r.nutrients?.energy_kcal ?? '-'}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#6B7280' }}>{r.nutrients?.protein_g ?? '-'}</td>
                <td style={{ padding: '7px 12px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {(r.covers || []).slice(0, 10).map((x) => <span key={x} style={{ fontSize: 10, fontWeight: 700, color: '#1B5E20', background: '#E8F5E9', borderRadius: 5, padding: '1px 6px' }}>{x}</span>)}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#9CA3AF' }}>결과 없음</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 10 }}>최대 300건 표시 — 검색으로 좁혀보세요. 적재: <code>python3 scripts/import-nong-foods.py</code></p>
    </main>
  );
}
