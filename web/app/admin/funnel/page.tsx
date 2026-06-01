/**
 * /admin/funnel — 마케팅 펀넬 코호트 (Phase 1, DB 기반).
 *
 * 가입일(KST) 코호트로: 가입 → 자녀 등록 → 첫 끼니(활성)까지 며칠에 걸쳐 도달했는지.
 * Phase 1은 DB에 이미 있는 단계만(가입=auth.users·자녀=children·첫끼니=meal_logs).
 * 홈 진입·사인업 페이지(익명 트래픽)는 Phase 2(mf_vid 쿠키 + /api/funnel)에서 앞단에 붙는다.
 *
 * 접근: 관리자만(service_role로 전 계정 읽음).
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const kstDate = (ts: string) => new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
const wd = ['일', '월', '화', '수', '목', '금', '토'];
const label = (d: string) => { const t = new Date(d + 'T00:00:00+09:00'); return `${d.slice(5)} (${wd[t.getDay()]})`; };

export default async function FunnelPage() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 420, margin: '60px auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a2b4a' }}>🔒 관리자 전용</h1>
      <p style={{ marginTop: 8, color: '#6B7280', fontSize: 14 }}>mealfred.com 계정으로 <Link href="/admin" style={{ color: '#C45A00' }}>로그인</Link>하세요.</p>
    </main>;
  }

  const db = createSupabaseAdmin();
  // 가입(auth.users) — 작은 유저베이스 가정(perPage 1000, 추후 페이지네이션)
  const { data: usersData } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users = (usersData?.users || []).filter((u) => u.created_at);
  // 자녀 등록(children) + 첫 끼니(meal_logs)
  const { data: children } = await db.from('children').select('id,parent_id,created_at');
  const childIds = (children || []).map((c) => c.id);
  const { data: meals } = childIds.length
    ? await db.from('meal_logs').select('child_id').in('child_id', childIds)
    : { data: [] as { child_id: string }[] };

  const parentHasChild = new Set((children || []).map((c) => c.parent_id));
  const childHasMeal = new Set((meals || []).map((m) => m.child_id));
  const parentHasMeal = new Set((children || []).filter((c) => childHasMeal.has(c.id)).map((c) => c.parent_id));

  // 가입일(KST) 코호트
  type Cell = { signup: number; child: number; meal: number };
  const coh: Record<string, Cell> = {};
  const tot: Cell = { signup: 0, child: 0, meal: 0 };
  users.forEach((u) => {
    const d = kstDate(u.created_at!);
    const c = (coh[d] ||= { signup: 0, child: 0, meal: 0 });
    c.signup++; tot.signup++;
    if (parentHasChild.has(u.id)) { c.child++; tot.child++; }
    if (parentHasMeal.has(u.id)) { c.meal++; tot.meal++; }
  });
  const dates = Object.keys(coh).sort().reverse().slice(0, 30);

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  const Stage = ({ n, base, color }: { n: number; base: number; color: string }) => (
    <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 800, color: '#1a2b4a' }}>{n}</span>
      <span style={{ display: 'inline-block', minWidth: 38, marginLeft: 6, fontSize: 11, fontWeight: 700, color }}>{base ? `${pct(n, base)}%` : '–'}</span>
    </td>
  );

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <header style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a2b4a' }}>📊 마케팅 펀넬 · 가입일 코호트</h1>
          <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>가입한 날 기준으로, 자녀 등록·첫 끼니까지 얼마나 내려갔나 (KST)</p>
        </div>
        <Link href="/admin" style={{ fontSize: 12, fontWeight: 800, color: '#1a2b4a', background: '#F1F1F0', borderRadius: 8, padding: '8px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}>← 콘솔</Link>
      </header>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[
          { label: '가입', n: tot.signup, sub: '누적', c: '#1a2b4a' },
          { label: '자녀 등록', n: tot.child, sub: `가입 대비 ${pct(tot.child, tot.signup)}%`, c: '#C45A00' },
          { label: '첫 끼니 (활성)', n: tot.meal, sub: `가입 대비 ${pct(tot.meal, tot.signup)}%`, c: '#16A085' },
        ].map((x) => (
          <div key={x.label} style={{ padding: 14, background: 'white', border: '1px solid #ECECEC', borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 700 }}>{x.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: x.c, marginTop: 2 }}>{x.n}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>{x.sub}</div>
          </div>
        ))}
      </div>

      {/* 코호트 테이블 */}
      <div style={{ background: 'white', border: '1px solid #ECECEC', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#FAFAF8', color: '#6B7280', fontSize: 11, fontWeight: 800 }}>
              <th style={{ padding: '9px 10px', textAlign: 'left' }}>가입일</th>
              <th style={{ padding: '9px 10px', textAlign: 'right' }}>가입</th>
              <th style={{ padding: '9px 10px', textAlign: 'right' }}>→ 자녀 등록</th>
              <th style={{ padding: '9px 10px', textAlign: 'right' }}>→ 첫 끼니</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#FFF8F0', borderBottom: '2px solid #FFE0C0', fontSize: 13 }}>
              <td style={{ padding: '9px 10px', fontWeight: 800, color: '#C45A00' }}>합계</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: '#1a2b4a' }}>{tot.signup}</td>
              <Stage n={tot.child} base={tot.signup} color="#C45A00" />
              <Stage n={tot.meal} base={tot.signup} color="#16A085" />
            </tr>
            {dates.map((d) => {
              const c = coh[d];
              return (
                <tr key={d} style={{ borderBottom: '1px solid #F3F3F1' }}>
                  <td style={{ padding: '9px 10px', color: '#374151', fontWeight: 600 }}>{label(d)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: '#1a2b4a' }}>{c.signup}</td>
                  <Stage n={c.child} base={c.signup} color="#C45A00" />
                  <Stage n={c.meal} base={c.signup} color="#16A085" />
                </tr>
              );
            })}
            {dates.length === 0 && <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#9CA3AF' }}>아직 가입 데이터가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 14, fontSize: 11.5, color: '#9CA3AF', lineHeight: 1.7 }}>
        · 코호트 = <b>가입한 날</b> 기준. 6/1 가입자가 6/3에 자녀를 등록해도 6/1 행에 잡힙니다.<br />
        · <b>홈페이지 진입 · 사인업 페이지</b> 도달(익명 트래픽)은 <b>Phase 2</b>에서 앞단에 붙습니다(`mf_vid` 쿠키 + `/api/funnel`).<br />
        · 최근 30일 · 첫 끼니 = 활성(가입만 하고 안 쓴 사람과 실제 쓰는 사람 구분).
      </p>
    </main>
  );
}
