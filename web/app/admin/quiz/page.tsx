/**
 * /admin/quiz — 아이 편식 상식 점수(쿠키 테스트) 대시보드.
 * 참여(누적·오늘)·평균·점수분포 + 전환(앱 CTA·공유 클릭, 참여 대비 %) + 문항별 오답률(게시글 소재).
 * 데이터: quiz_results(응답)·quiz_events(전환 클릭) — 둘 다 없으면 안내 배너로 degrade.
 * 접근: @mealfred.com 관리자만.
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { aggregateQuizStats, QUIZ_LABELS, type QuizStatRow } from '@/lib/quizStats';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const navy = '#1a2b4a';

type ResRow = QuizStatRow & { qv: string; created_at: string };
type EvRow = { event: string; created_at: string };

export default async function QuizAdminPage() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return (
      <main style={{ maxWidth: 480, margin: '60px auto', padding: 24, fontFamily: 'Pretendard' }}>
        <p style={{ color: '#6B7280' }}>🔒 관리자 전용. <Link href="/admin" style={{ color: '#FF6B1A' }}>← 콘솔</Link></p>
      </main>
    );
  }

  const db = createSupabaseAdmin();
  const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const kstMidnightUtc = `${todayKst}T00:00:00+09:00`;

  // 응답 전량(1000행 절단 대응) — 테이블 없으면 빈 배열 degrade
  let results: ResRow[] = [];
  let resErr = false;
  try {
    results = (await fetchAllPages((from, to) =>
      db.from('quiz_results').select('qv,score,wrong,created_at', { count: 'exact' })
        .eq('tool', 'knowledge').order('id').range(from, to))) as unknown as ResRow[];
  } catch { resErr = true; }

  let events: EvRow[] = [];
  let evErr = false;
  try {
    events = (await fetchAllPages((from, to) =>
      db.from('quiz_events').select('event,created_at', { count: 'exact' })
        .eq('tool', 'knowledge').order('id').range(from, to))) as unknown as EvRow[];
  } catch { evErr = true; }

  const n = results.length;
  const nToday = results.filter((r) => r.created_at >= kstMidnightUtc).length;
  const cta = events.filter((e) => e.event === 'app_cta');
  const share = events.filter((e) => e.event === 'share');
  const evalCta = events.filter((e) => e.event === 'eval_cta');
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  // qv별 집계(최신 qv 먼저) — 문항이 바뀌면 오답률이 섞이지 않게 세트 단위로 표시
  const byQv = new Map<string, ResRow[]>();
  for (const r of results) (byQv.get(r.qv) ?? byQv.set(r.qv, []).get(r.qv)!).push(r);
  const qvs = [...byQv.keys()].sort().reverse();

  const kpi = [
    { label: '참여(응답 완료)', v: n.toLocaleString(), sub: `오늘 +${nToday}`, c: navy },
    { label: '평균 점수', v: n ? `${aggregateQuizStats(results).avgScore}점` : '—', sub: '전체 세트 합산', c: '#C45A00' },
    { label: '앱으로 이어감', v: cta.length.toLocaleString(), sub: `참여 대비 ${pct(cta.length, n)}% · 오늘 +${cta.filter((e) => e.created_at >= kstMidnightUtc).length}`, c: '#16A085' },
    { label: '공유(링크 복사)', v: share.length.toLocaleString(), sub: `참여 대비 ${pct(share.length, n)}% · 오늘 +${share.filter((e) => e.created_at >= kstMidnightUtc).length}`, c: '#7c3aed' },
    { label: '식단표 평가로', v: evalCta.length.toLocaleString(), sub: `참여 대비 ${pct(evalCta.length, n)}% · 오늘 +${evalCta.filter((e) => e.created_at >= kstMidnightUtc).length}`, c: '#1565C0' },
  ];

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#FF6B1A', fontWeight: 700, textDecoration: 'none' }}>← 콘솔</Link>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: navy, marginTop: 10 }}>💯 편식 상식 점수 — 퀴즈 대시보드</h1>
      <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>
        참여·전환·문항별 오답률 (KST). 오답률은 게시글 소재("부모 N%가 틀려요")로 그대로 인용 가능 — 문항 세트(qv)별로 분리 집계.
      </p>

      {(resErr || evErr) && (
        <div style={{ margin: '14px 0', padding: '12px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, fontSize: 12.5, color: '#9A3412', lineHeight: 1.6 }}>
          ⚠️ {resErr ? <><code>quiz_results</code>(sql/2026-07-05) </> : null}{evErr ? <><code>quiz_events</code>(sql/2026-07-06) </> : null}
          테이블이 아직 없어요 — 해당 SQL을 Supabase SQL Editor에서 1회 실행하면 채워집니다.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, margin: '16px 0' }}>
        {kpi.map((x) => (
          <div key={x.label} style={{ padding: 14, background: 'white', border: '1px solid #ECECEC', borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 700 }}>{x.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: x.c, marginTop: 2 }}>{x.v}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>{x.sub}</div>
          </div>
        ))}
      </div>

      {qvs.map((qv) => {
        const rows = byQv.get(qv)!;
        const s = aggregateQuizStats(rows);
        const labels = QUIZ_LABELS[qv];
        return (
          <section key={qv} style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: navy, margin: '18px 0 4px' }}>
              문항 세트 <span style={{ color: '#C45A00' }}>{qv}</span> · 응답 {s.n.toLocaleString()}건 · 평균 {s.avgScore}점
            </h2>
            <div style={{ fontSize: 11.5, color: '#9CA3AF', marginBottom: 8 }}>
              점수 분포 — {Object.entries(s.scoreDist).map(([k, v]) => `${k}점 ${v}`).join(' · ')}
            </div>
            <div style={{ background: 'white', border: '1px solid #ECECEC', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#FAFAF8', color: '#6B7280', fontSize: 11, fontWeight: 800 }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>문항 (오답률 높은 순)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', width: 70 }}>오답 수</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', width: 190 }}>오답률</th>
                  </tr>
                </thead>
                <tbody>
                  {s.wrongRate.map((w) => (
                    <tr key={w.q} style={{ borderBottom: '1px solid #F3F3F1' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#374151' }}>
                        Q{w.q}. {labels?.[w.q - 1] || ''}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6B7280', fontWeight: 700 }}>{w.wrongCount}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 10, background: '#F4F4F5', borderRadius: 100, overflow: 'hidden' }}>
                            <div style={{ width: `${w.pct}%`, height: '100%', background: w.pct >= 60 ? '#EF4444' : w.pct >= 30 ? '#F59E0B' : '#10B981', borderRadius: 100 }} />
                          </div>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: w.pct >= 60 ? '#C62828' : w.pct >= 30 ? '#B45309' : '#1B5E20', minWidth: 38, textAlign: 'right' }}>{w.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {!qvs.length && !resErr && <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 16 }}>아직 응답이 없어요 — 퀴즈가 공유되면 여기부터 채워집니다.</p>}

      <p style={{ marginTop: 10, fontSize: 11.5, color: '#9CA3AF', lineHeight: 1.7 }}>
        · <b>앱으로 이어감</b> = 결과 화면의 app.mealfred.com 링크 클릭. <b>공유</b> = 링크 복사 버튼. <b>식단표 평가로</b> = daycare-eval 연계 버튼 클릭.<br />
        · 문항 라벨은 <code>lib/quizStats.ts QUIZ_LABELS</code> — 문항 세트(qv) 올릴 때 함께 갱신.
      </p>
    </main>
  );
}
