/**
 * /admin — 코칭 QA 콘솔: 계정(자녀) 목록.
 *
 * 서비스 핵심이 "코칭"이라, 각 계정에서 부모 입력 → 우리 코칭 → 우리 판단을
 * 카카오톡 채팅방처럼 시계열로 사람이 직접 검수하기 위한 화면.
 *
 * 접근: 관리자(uid/email 화이트리스트)만. service_role로 전 계정 PII를 읽으므로 하드 게이트.
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import AdminLogin from '@/components/AdminLogin';
import Link from 'next/link';
import { kstToday } from '@/lib/date';

export const dynamic = 'force-dynamic';

const AGE_LABEL: Record<string, string> = {
  younger: '만3세-', '3-4y': '만3–4', '5y': '만5', '6-7y': '만6–7',
};

export default async function AdminHome() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();

  if (!isAdmin(user)) {
    return (
      <main style={{ maxWidth: 420, margin: '60px auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a2b4a' }}>🔒 코칭 QA 콘솔</h1>
        <p style={{ marginTop: 8, color: '#6B7280', fontSize: 14 }}><b>@mealfred.com</b> 계정(구글 워크스페이스)으로만 접근할 수 있어요.</p>
        <AdminLogin />
        {user && (
          <div style={{ marginTop: 16, padding: 14, background: '#F8F8F5', borderRadius: 10, fontSize: 12, color: '#9CA3AF', wordBreak: 'break-all' }}>
            현재: <code>{user.email || '(이메일 없음)'}</code> — 도메인 계정이 아니에요. mealfred.com 계정으로 다시 로그인하세요.
          </div>
        )}
      </main>
    );
  }

  const db = createSupabaseAdmin();
  const { data: children, error: childErr } = await db.from('children')
    .select('id,nickname,age_band,sex,daycare,parent_id,created_at')
    .order('id', { ascending: true });
  if (childErr) console.error('[admin] children query:', childErr.message);

  // 활동 집계 — 자녀별 식단 수·최근 기록일 (작은 유저베이스 가정, 단순 집계)
  const ids = (children || []).map((c) => c.id);
  const { data: meals } = ids.length
    ? await db.from('meal_logs').select('child_id,log_date').in('child_id', ids).lte('log_date', kstToday())   // 미래(미리입력) 제외 — 끼니수·최근기록일 정확
    : { data: [] as { child_id: string; log_date: string }[] };
  const { data: letters } = ids.length
    ? await db.from('coach_letters').select('child_id,letter_date').in('child_id', ids)
    : { data: [] as { child_id: string; letter_date: string }[] };

  const mealCount: Record<string, number> = {};
  const lastDate: Record<string, string> = {};
  (meals || []).forEach((m) => {
    mealCount[m.child_id] = (mealCount[m.child_id] || 0) + 1;
    if (!lastDate[m.child_id] || m.log_date > lastDate[m.child_id]) lastDate[m.child_id] = m.log_date;
  });
  const letterCount: Record<string, number> = {};
  (letters || []).forEach((l) => { letterCount[l.child_id] = (letterCount[l.child_id] || 0) + 1; });

  // 대시보드 — 가입자(자녀)·식단표 평가 이용 (오늘/어제/누적, KST 기준)
  const { data: evalRows } = await db.from('eval_results').select('created_at');
  const kstDateOnly = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);   // 수동 +9 대신 timeZone으로 정확
  const today = kstDateOnly(new Date()), yest = kstDateOnly(new Date(Date.now() - 86400e3));
  const dayKST = (ts: string) => kstDateOnly(new Date(ts));
  const countBy = (arr: { created_at: string | null }[]) => {
    let total = 0, t = 0, y = 0;
    (arr || []).forEach((r) => { if (!r.created_at) return; total++; const d = dayKST(r.created_at); if (d === today) t++; else if (d === yest) y++; });
    return { total, today: t, yest: y };
  };
  const signup = countBy((children || []) as { created_at: string | null }[]);
  const evalStat = countBy((evalRows || []) as { created_at: string | null }[]);

  const rows = (children || []).slice().sort((a, b) => (lastDate[b.id] || '').localeCompare(lastDate[a.id] || ''));

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a2b4a' }}>📊 대시보드</h1>
        <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>계정 {rows.length}명 · 아이를 누르면 대화 쓰레드로 검수</p>
      </header>

      {/* 대시보드 — 가입자·식단표 평가 이용 (어제 대비 누적·오늘) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: '가입자 (자녀)', s: signup, c: '#1a2b4a' },
          { label: '식단표 평가 이용', s: evalStat, c: '#C45A00' },
        ].map((x) => (
          <div key={x.label} style={{ padding: 14, background: 'white', border: '1px solid #ECECEC', borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 700 }}>{x.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: x.c, marginTop: 2 }}>{x.s.total}<span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}> 누적</span></div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>오늘 <b style={{ color: '#16A085' }}>+{x.s.today}</b> · 어제 +{x.s.yest}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((c) => (
          <Link key={c.id} href={`/admin/${c.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, background: 'white', border: '1px solid #ECECEC', borderRadius: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1a2b4a' }}>
                  {c.nickname} <span style={{ fontSize: 11, color: '#C45A00', fontWeight: 700 }}>{AGE_LABEL[c.age_band] || c.age_band}{c.sex === 'M' ? '·남' : c.sex === 'F' ? '·여' : ''}{c.daycare ? '·기관' : ''}</span>
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                  식단 {mealCount[c.id] || 0} · 코칭 {letterCount[c.id] || 0} · 최근 {lastDate[c.id] || '기록없음'}
                </div>
              </div>
              <span style={{ fontSize: 18, color: '#D1D5DB' }}>›</span>
            </div>
          </Link>
        ))}
        {rows.length === 0 && <p style={{ color: '#9CA3AF', fontSize: 13 }}>아직 등록된 자녀가 없어요.</p>}
      </div>
    </main>
  );
}
