/**
 * /admin/community — 커뮤니티 노하우 현황·모더레이션. 관리자(@mealfred.com)만.
 * KPI(총 글·작성자·반응·신고·숨김) + 최근 글 + 숨기기/복구.
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import Link from 'next/link';
import AdminModerateBtn from '@/components/AdminModerateBtn';

export const dynamic = 'force-dynamic';

const kst = (ts: string) => new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(5, 16);

type Post = { id: string; parent_id: string; author_nick: string | null; ingredients: string[]; body: string; age_band: string | null; method_type: string | null; status: string; like_count: number; tried_count: number; report_count: number; created_at: string };

export default async function AdminCommunityPage() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 420, margin: '60px auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a2b4a' }}>🔒 관리자 전용</h1>
      <p style={{ marginTop: 8, color: '#6B7280', fontSize: 14 }}>mealfred.com 계정으로 <Link href="/admin" style={{ color: '#C45A00' }}>로그인</Link>하세요.</p>
    </main>;
  }

  const db = createSupabaseAdmin();
  const { data, error } = await db.from('community_posts')
    .select('id,parent_id,author_nick,ingredients,body,age_band,method_type,status,like_count,tried_count,report_count,created_at')
    .order('created_at', { ascending: false }).limit(120);

  const posts = (data as Post[]) || [];
  const tableMissing = !!error;
  const pub = posts.filter((p) => p.status === 'public');
  const hidden = posts.filter((p) => p.status === 'hidden');
  const authors = new Set(posts.map((p) => p.parent_id)).size;
  const likes = posts.reduce((s, p) => s + (p.like_count || 0), 0);
  const trieds = posts.reduce((s, p) => s + (p.tried_count || 0), 0);
  const reports = posts.reduce((s, p) => s + (p.report_count || 0), 0);
  const todayKst = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
  const todayN = posts.filter((p) => kst(p.created_at).startsWith(todayKst.slice(5))).length;

  const card = (label: string, v: string | number, c = '#1a2b4a') => (
    <div style={{ background: '#fff', border: '1px solid #EFE7DC', borderRadius: 12, padding: '13px 16px', minWidth: 110 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>
      <div style={{ fontSize: 12, color: '#7a8595', fontWeight: 600 }}>{label}</div>
    </div>
  );

  return (
    <main style={{ padding: '28px 30px', fontFamily: 'Pretendard, sans-serif', color: '#1a2b4a' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>🏡 커뮤니티 — 노하우 현황·모더레이션</h1>
      {tableMissing ? (
        <p style={{ marginTop: 12, color: '#C62828', fontSize: 14 }}>community_posts 테이블이 아직 없어요 — <code>sql/2026-06-04_community.sql</code>을 실행하세요.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '18px 0 8px' }}>
            {card('총 글', posts.length)}
            {card('공개', pub.length, '#1B7A3D')}
            {card('숨김', hidden.length, hidden.length ? '#C62828' : '#9CA3AF')}
            {card('오늘 글', todayN, '#C45A00')}
            {card('작성자', authors)}
            {card('좋아요', likes)}
            {card('해봤어요', trieds, '#1B7A3D')}
            {card('신고 누적', reports, reports ? '#C62828' : '#9CA3AF')}
          </div>
          <p style={{ fontSize: 12.5, color: '#9a8a7a', margin: '4px 0 16px' }}>신고 3건 누적 시 자동 숨김(블라인드). 부적절한 글은 수동 숨기기. 시드(코치 PICK)는 DB가 아니라 안 보입니다.</p>

          {posts.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: 14 }}>아직 올라온 노하우가 없어요.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1a2b4a', color: '#fff' }}>
                  <th style={th}>작성자</th><th style={th}>식재료</th><th style={{ ...th, width: '38%' }}>노하우</th><th style={th}>👍</th><th style={th}>🙌</th><th style={th}>🚩</th><th style={th}>상태</th><th style={th}>작성</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} style={{ background: p.status === 'hidden' ? '#FFF6F6' : '#fff', borderBottom: '1px solid #F0E8E0' }}>
                    <td style={td}>{p.author_nick || (p.age_band ? `${p.age_band}` : '익명')}</td>
                    <td style={td}>{(p.ingredients || []).join(', ')}</td>
                    <td style={{ ...td, color: '#3a4555' }}>{p.body}{p.method_type ? <span style={{ color: '#2B5CB8', fontWeight: 700 }}> ·{p.method_type}</span> : null}</td>
                    <td style={tdC}>{p.like_count || 0}</td>
                    <td style={tdC}>{p.tried_count || 0}</td>
                    <td style={{ ...tdC, color: p.report_count ? '#C62828' : '#9CA3AF', fontWeight: p.report_count ? 800 : 400 }}>{p.report_count || 0}</td>
                    <td style={tdC}>{p.status === 'hidden' ? <span style={{ color: '#C62828', fontWeight: 700 }}>숨김</span> : '공개'}</td>
                    <td style={{ ...td, color: '#9a8a7a', whiteSpace: 'nowrap' }}>{kst(p.created_at)}</td>
                    <td style={tdC}><AdminModerateBtn postId={p.id} status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}

const th: React.CSSProperties = { padding: '9px 8px', textAlign: 'left', fontWeight: 700, fontSize: 12 };
const td: React.CSSProperties = { padding: '8px', verticalAlign: 'top' };
const tdC: React.CSSProperties = { padding: '8px', textAlign: 'center', verticalAlign: 'top' };
