/**
 * /admin/curriculum — v3 커리큘럼 진도 보드 (WBS H-09 · read-only)
 *
 * 자녀 × 12유닛 매트릭스: status 색·step·마지막 신호. "달성하면 안 가르치고, 무너지면 재감지"가
 * 한눈에 보이는 화면 — 재발(relapsed)은 붉게, 유지/졸업(maintenance·mastered)은 초록으로.
 * 주간 goals(닻)는 행 하단에 ⭐focus/standby로. 데이터=curriculum_progress·weekly_plans(서버 전용 — RLS 정책 없음).
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import Link from 'next/link';
import { UNIT_IDS, UNITS, type UnitId } from '@/lib/curriculumUnits';

export const dynamic = 'force-dynamic';

type ProgRow = { child_id: string; unit_id: UnitId; status: string; step: number; last_signal_at: string | null; relapse_count: number; stop_reason: string | null };
type Goal = { unit_id: UnitId; status: string; priority: number };

const ST_COLOR: Record<string, { bg: string; fg: string; label: string }> = {
  not_started: { bg: '#F3F4F6', fg: '#9CA3AF', label: '—' },
  active: { bg: '#FFF4E5', fg: '#C45A00', label: '진행' },
  progressing: { bg: '#FDF3E0', fg: '#92400E', label: '진전' },
  maintenance: { bg: '#EAF6F0', fg: '#1B5E20', label: '유지주' },
  mastered: { bg: '#D9F0E2', fg: '#14532D', label: '체득' },
  pivoted: { bg: '#EFEFEF', fg: '#6B7280', label: '쉼' },
  relapsed: { bg: '#FDEBEB', fg: '#B91C1C', label: '재발' },
};

export default async function CurriculumBoard() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 420, margin: '60px auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a2b4a' }}>🔒 관리자 전용</h1>
      <p style={{ marginTop: 8, color: '#6B7280', fontSize: 14 }}>mealfred.com 계정으로 <Link href="/admin" style={{ color: '#C45A00' }}>로그인</Link>하세요.</p>
    </main>;
  }
  const admin = createSupabaseAdmin();
  const [{ data: prog }, { data: kids }, { data: anchors }] = await Promise.all([
    admin.from('curriculum_progress').select('child_id,unit_id,status,step,last_signal_at,relapse_count,stop_reason'),
    admin.from('children').select('id,nickname'),
    admin.from('weekly_plans').select('child_id,week_key,goals,budget').order('week_key', { ascending: false }),
  ]);
  const nameOf: Record<string, string> = {};
  (kids || []).forEach((k: { id: string; nickname: string }) => { nameOf[k.id] = k.nickname; });
  const byChild: Record<string, Partial<Record<UnitId, ProgRow>>> = {};
  ((prog || []) as ProgRow[]).forEach((r) => { (byChild[r.child_id] ||= {})[r.unit_id] = r; });
  const goalsOf: Record<string, Goal[]> = {};
  ((anchors || []) as Array<{ child_id: string; goals: Goal[] | null }>).forEach((a) => {
    if (!goalsOf[a.child_id] && Array.isArray(a.goals)) goalsOf[a.child_id] = a.goals;   // 정렬상 첫 = 최신 주
  });
  const childIds = [...new Set([...Object.keys(byChild), ...Object.keys(goalsOf)])];

  return (
    <main style={{ padding: 24, fontFamily: 'Pretendard, sans-serif', maxWidth: 1280 }}>
      <h1 style={{ fontSize: 19, fontWeight: 800, color: '#1a2b4a' }}>📚 커리큘럼 진도 보드 <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>v3 · 자녀×12유닛 · read-only</span></h1>
      <p style={{ fontSize: 12.5, color: '#6B7280', margin: '6px 0 16px' }}>
        체득(초록)은 코칭 중단·관찰만, <b style={{ color: '#B91C1C' }}>재발(빨강)</b>은 재감지 즉시 재개 — &ldquo;달성하면 그만 가르치고 무너지면 다시&rdquo;의 현황판. ⭐=이번 주 focus, ☆=standby.
      </p>
      {childIds.length === 0 ? (
        <p style={{ color: '#9CA3AF', fontSize: 14 }}>아직 진도 데이터가 없어요(컷오버 전이거나 v3 카나리아 미가동).</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11.5, minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: '#fff', border: '1px solid #ECECEC', padding: '6px 10px', textAlign: 'left' }}>자녀</th>
                {UNIT_IDS.map((u) => (
                  <th key={u} style={{ border: '1px solid #ECECEC', padding: '6px 6px', background: '#FAFAFA', fontWeight: 700, color: '#4B5563', whiteSpace: 'nowrap' }}>{UNITS[u].label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {childIds.map((cid) => {
                const goals = goalsOf[cid] || [];
                const gMark = (u: UnitId) => {
                  const g = goals.find((x) => x.unit_id === u);
                  return g ? (g.status === 'focus' ? ' ⭐' : g.status === 'standby' ? ' ☆' : '') : '';
                };
                return (
                  <tr key={cid}>
                    <td style={{ position: 'sticky', left: 0, background: '#fff', border: '1px solid #ECECEC', padding: '6px 10px', fontWeight: 800 }}>
                      <Link href={`/admin/${cid}`} style={{ color: '#C45A00', textDecoration: 'none' }}>{nameOf[cid] || cid.slice(0, 8)}</Link>
                    </td>
                    {UNIT_IDS.map((u) => {
                      const r = byChild[cid]?.[u];
                      const st = ST_COLOR[r?.status || 'not_started'] || ST_COLOR.not_started;
                      return (
                        <td key={u} style={{ border: '1px solid #ECECEC', padding: '5px 6px', background: st.bg, color: st.fg, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center' }}>
                          {r ? `${st.label} ${r.step}단${r.relapse_count ? ` ↺${r.relapse_count}` : ''}` : st.label}{gMark(u)}
                          {r?.last_signal_at ? <div style={{ fontSize: 9.5, fontWeight: 600, color: '#9CA3AF' }}>신호 {r.last_signal_at.slice(5)}</div> : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
