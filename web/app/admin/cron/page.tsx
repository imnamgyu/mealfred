/**
 * /admin/cron — 새벽 코칭 크론 일일 보고서.
 *
 * cron_runs(매일 1+회 실행)의 정량 지표·이슈를 최신순으로. 코칭이 매일 제대로 돌았는지,
 * 결핍/기록공백/등원 분포가 어떻게 움직이는지 사람이 추적.
 *
 * 접근: @mealfred.com 관리자만.
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Meta = {
  letters?: number; questions?: number; reused?: number; active?: number; skippedTime?: number; lowData?: number;
  evalChildren?: number; avgEaten?: number; redChildren?: number; gapChildren?: number; daycareChildren?: number;
  topReds?: string[]; issues?: string[]; durationMs?: number; error?: string;
};
type Run = { id: string; status: string; started_at: string | null; finished_at: string | null; processed_count: number | null; error_count: number | null; meta: Meta | null };

const STATUS: Record<string, { bg: string; fg: string; t: string }> = {
  success: { bg: '#E8F5E9', fg: '#1B5E20', t: '성공' },
  partial: { bg: '#FFF4D6', fg: '#C45A00', t: '부분' },
  failure: { bg: '#FFEBEE', fg: '#C62828', t: '실패' },
  running: { bg: '#E3F2FD', fg: '#1565C0', t: '실행중' },
};

function fmt(ts: string | null) { return ts ? ts.replace('T', ' ').slice(0, 16) : '—'; }
function dur(ms?: number) { return ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`; }

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div style={{ background: '#FAFAF7', borderRadius: 8, padding: '7px 10px', minWidth: 64, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: tone || '#1a2b4a' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700 }}>{label}</div>
    </div>
  );
}

export default async function CronReport() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 480, margin: '60px auto', padding: 24, fontFamily: 'Pretendard' }}><p style={{ color: '#6B7280' }}>🔒 관리자 전용. <Link href="/admin" style={{ color: '#FF6B1A' }}>← 콘솔</Link></p></main>;
  }

  const db = createSupabaseAdmin();
  const { data } = await db.from('cron_runs')
    .select('id,status,started_at,finished_at,processed_count,error_count,meta')
    .eq('job_name', 'coach').order('started_at', { ascending: false }).limit(30);
  const runs = (data || []) as Run[];

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <header style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a2b4a' }}>🌙 코칭 크론 일일 보고서</h1>
          <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>새벽 2시(KST) 자동 생성 · 최근 {runs.length}회</p>
        </div>
        <Link href="/admin" style={{ fontSize: 13, color: '#FF6B1A', fontWeight: 700, textDecoration: 'none' }}>← 계정 목록</Link>
      </header>

      <div style={{ display: 'grid', gap: 12 }}>
        {runs.map((r) => {
          const m = r.meta || {};
          const s = STATUS[r.status] || { bg: '#F3F4F6', fg: '#6B7280', t: r.status };
          return (
            <div key={r.id} style={{ background: 'white', border: '1px solid #ECECEC', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1a2b4a' }}>{fmt(r.started_at)}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: s.fg, background: s.bg, borderRadius: 100, padding: '2px 10px' }}>{s.t}</span>
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>⏱ {dur(m.durationMs)}</div>
              </div>

              {/* 실행 지표 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <Stat label="대상" value={m.active ?? '—'} />
                <Stat label="처리" value={r.processed_count ?? '—'} />
                <Stat label="편지" value={m.letters ?? '—'} />
                <Stat label="질문" value={m.questions ?? '—'} />
                <Stat label="재사용" value={m.reused ?? '—'} />
                <Stat label="오류" value={r.error_count ?? 0} tone={(r.error_count || 0) > 0 ? '#C62828' : undefined} />
                {!!m.skippedTime && <Stat label="시간초과" value={m.skippedTime} tone="#C45A00" />}
                {!!m.lowData && <Stat label="기록부족" value={m.lowData} tone="#9CA3AF" />}
              </div>

              {/* 코칭 품질 지표 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Stat label="평균 식재료" value={m.avgEaten ?? '—'} />
                <Stat label="결핍 아동" value={m.redChildren ?? '—'} tone={(m.redChildren || 0) > 0 ? '#C62828' : undefined} />
                <Stat label="기록공백 아동" value={m.gapChildren ?? '—'} tone={(m.gapChildren || 0) > 0 ? '#C45A00' : undefined} />
                <Stat label="등원 아동" value={m.daycareChildren ?? '—'} />
              </div>

              {m.topReds && m.topReds.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: '#C62828' }}>🔴 결핍 빈도 Top: <b>{m.topReds.join(', ')}</b></div>
              )}

              {((m.issues && m.issues.length > 0) || m.error) && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 11.5, color: '#C62828', fontWeight: 700 }}>⚠ 이슈 {m.error ? 1 : m.issues?.length}건</summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11.5, color: '#6B7280', lineHeight: 1.6 }}>
                    {m.error && <li style={{ color: '#C62828' }}>{m.error}</li>}
                    {(m.issues || []).map((iss, i) => <li key={i}>{iss}</li>)}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
        {runs.length === 0 && <p style={{ color: '#9CA3AF', fontSize: 13 }}>아직 크론 실행 기록이 없어요. (새벽 2시 첫 실행 후 표시)</p>}
      </div>
    </main>
  );
}
