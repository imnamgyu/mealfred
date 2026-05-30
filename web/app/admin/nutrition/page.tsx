/**
 * /admin/nutrition — 식재료 → 영양소 매핑 뷰어(PC 어드민).
 * 농진청 10.4 정밀맵(gen-nutrient-map.py 생성)을 표로 보며 검수. conf=low는 매칭 재확인 대상.
 */
import { createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import Link from 'next/link';
import GEN from '@/lib/nutrient-map.generated.json';

export const dynamic = 'force-dynamic';

type Row = { nong: string; conf: string; n: string[] };
const MAP = GEN as Record<string, Row>;

const CONF = { high: { c: '#1B5E20', bg: '#E8F5E9', t: '정확' }, mid: { c: '#1565C0', bg: '#E3F2FD', t: '보통' }, low: { c: '#C62828', bg: '#FFEBEE', t: '검수요' } } as const;

export default async function AdminNutrition() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 480, margin: '60px auto', padding: 24, fontFamily: 'Pretendard' }}><p style={{ color: '#6B7280' }}>🔒 관리자 전용. <Link href="/admin" style={{ color: '#FF6B1A' }}>← 콘솔</Link></p></main>;
  }
  const entries = Object.entries(MAP);
  const confCount = { high: 0, mid: 0, low: 0 } as Record<string, number>;
  entries.forEach(([, v]) => { confCount[v.conf] = (confCount[v.conf] || 0) + 1; });
  // 영양소 커버리지 분포(어떤 영양소가 몇 종에서 잡히나)
  const nutCount: Record<string, number> = {};
  entries.forEach(([, v]) => v.n.forEach((x) => { nutCount[x] = (nutCount[x] || 0) + 1; }));
  const nutRank = Object.entries(nutCount).sort((a, b) => b[1] - a[1]);
  // 검수요(low) 먼저, 그다음 이름순
  const sorted = entries.sort((a, b) => {
    const o = { low: 0, mid: 1, high: 2 } as Record<string, number>;
    return (o[a[1].conf] - o[b[1].conf]) || a[0].localeCompare(b[0]);
  });

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a2b4a' }}>🧬 식재료 → 영양소 매핑</h1>
          <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>농진청 국가표준식품성분표 10.4 · 1일 KDRI 15%↑ 공급 영양소 · {entries.length}종</p>
        </div>
        <Link href="/admin" style={{ fontSize: 13, color: '#FF6B1A', fontWeight: 700, textDecoration: 'none' }}>← 콘솔</Link>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['high', 'mid', 'low'] as const).map((k) => (
          <span key={k} style={{ fontSize: 12, fontWeight: 800, color: CONF[k].c, background: CONF[k].bg, borderRadius: 8, padding: '5px 12px' }}>{CONF[k].t} {confCount[k] || 0}</span>
        ))}
      </div>

      {/* 영양소별 커버 식재료 수 */}
      <details style={{ marginBottom: 14, background: 'white', border: '1px solid #ECECEC', borderRadius: 10, padding: '10px 14px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#1a2b4a' }}>📊 영양소별 커버 식재료 수 ({nutRank.length}종 영양소)</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {nutRank.map(([n, c]) => (
            <span key={n} style={{ fontSize: 11.5, fontWeight: 700, color: '#374151', background: '#F4F4F5', borderRadius: 7, padding: '3px 9px' }}>{n} <b style={{ color: c < 5 ? '#C62828' : '#16A085' }}>{c}</b></span>
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>숫자 작은 영양소(빨강)는 공급 식재료가 적어 신호등에서 결핍 뜨기 쉬움 — 추천에 우선 반영 고려.</p>
      </details>

      <div style={{ overflowX: 'auto', background: 'white', border: '1px solid #ECECEC', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 720 }}>
          <thead><tr style={{ background: '#FFF0E0', color: '#C45A00', textAlign: 'left' }}>
            <th style={{ padding: '9px 12px' }}>식재료</th><th style={{ padding: '9px 12px' }}>농진청 매칭</th><th style={{ padding: '9px 12px' }}>신뢰</th><th style={{ padding: '9px 12px' }}>커버 영양소</th>
          </tr></thead>
          <tbody>
            {sorted.map(([nm, v]) => (
              <tr key={nm} style={{ borderTop: '1px solid #F0F0F0' }}>
                <td style={{ padding: '8px 12px', fontWeight: 800, color: '#1a2b4a', whiteSpace: 'nowrap' }}>{nm}</td>
                <td style={{ padding: '8px 12px', color: '#6B7280' }}>{v.nong}</td>
                <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 11, fontWeight: 800, color: CONF[v.conf as keyof typeof CONF]?.c, background: CONF[v.conf as keyof typeof CONF]?.bg, borderRadius: 6, padding: '2px 8px' }}>{CONF[v.conf as keyof typeof CONF]?.t}</span></td>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {v.n.length ? v.n.map((x) => <span key={x} style={{ fontSize: 10.5, fontWeight: 700, color: '#1B5E20', background: '#E8F5E9', borderRadius: 6, padding: '2px 7px' }}>{x}</span>) : <span style={{ color: '#C62828', fontSize: 11 }}>없음</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 10 }}>출처: 국가표준식품성분표 10개정판 DB10.4(01_참고자료/D_농진청성분DB). 재생성: <code>cd web && python3 scripts/gen-nutrient-map.py</code></p>
    </main>
  );
}
