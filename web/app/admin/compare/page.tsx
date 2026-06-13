/**
 * /admin/compare — A/B 편지 승자 집계 위젯(EPIC G-09).
 *
 * compare 코호트(아린 등) 자녀별로 compare_votes(변형 A/B × 👍/👎/🔁)를 judgeWinner로 요약하고,
 *   B 발행 일수(coach_letters.context.altLetter)와 일자별 평가 타임라인을 보여줘 컷오버 근거를 만든다.
 * 모든 조회 graceful — 테이블/컬럼 미적용이어도 빈 패널·크래시 없음.
 *
 * 접근: @mealfred.com 관리자만(service_role 읽기).
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { judgeWinner, buildCompareSummary, confidenceOf, type Vote, type Winner } from '@/lib/compareVote';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type CV = { child_id: string; letter_date: string; variant: 'A' | 'B'; rating: 'up' | 'down' | 'repeat' };

const VERDICT: Record<Winner, { label: string; fg: string; bg: string }> = {
  B: { label: 'B(새 설계) 우세', fg: '#1565C0', bg: '#E8F1FB' },
  A: { label: 'A(기존 v2) 우세', fg: '#92400E', bg: '#FDF3E0' },
  tie: { label: '무승부', fg: '#5B6B53', bg: '#EFF4EA' },
  insufficient: { label: '데이터 부족', fg: '#9CA3AF', bg: '#F3F4F6' },
};
const CONF_LABEL = { low: '낮음', mid: '보통', high: '높음' } as const;

export default async function AdminCompare() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 480, margin: '60px auto', padding: 24, fontFamily: 'Pretendard' }}><p style={{ color: '#6B7280' }}>🔒 관리자 전용. <Link href="/admin" style={{ color: '#FF6B1A' }}>← 콘솔</Link></p></main>;
  }

  const db = createSupabaseAdmin();

  // compare_votes — 테이블 미생성 시 graceful(error만, data=null → 빈 배열).
  let votes: CV[] = [];
  try {
    const { data } = await db.from('compare_votes').select('child_id,letter_date,variant,rating');
    votes = (data || []) as CV[];
  } catch { /* 테이블 미생성 — 빈 집계 */ }

  // altLetter(=B 발행) 있는 편지 — 자녀별 B 발행 일수.
  const { data: letterRows } = await db.from('coach_letters').select('child_id,letter_date,context');
  const bDaysByChild: Record<string, Set<string>> = {};
  ((letterRows || []) as Array<{ child_id: string; letter_date: string; context: Record<string, unknown> | null }>).forEach((l) => {
    const alt = (l.context as { altLetter?: { letter?: unknown } } | null)?.altLetter;
    if (alt && (alt as { letter?: unknown }).letter) (bDaysByChild[l.child_id] ||= new Set()).add(l.letter_date);
  });

  // 관심 자녀 = B를 발행했거나 투표가 있는 자녀(compare 코호트 실측).
  const ids = [...new Set([...Object.keys(bDaysByChild), ...votes.map((v) => v.child_id)])];
  const nameMap: Record<string, string> = {};
  if (ids.length) {
    const { data: kids } = await db.from('children').select('id,nickname').in('id', ids);
    (kids || []).forEach((k: { id: string; nickname: string | null }) => { nameMap[k.id] = k.nickname || k.id.slice(0, 8); });
  }

  // 자녀별 집계.
  const byChild = ids.map((cid) => {
    const vs: Vote[] = votes.filter((v) => v.child_id === cid).map((v) => ({ variant: v.variant, rating: v.rating }));
    const r = judgeWinner(vs);
    const timeline = votes.filter((v) => v.child_id === cid)
      .reduce<Record<string, { A?: string; B?: string }>>((acc, v) => { (acc[v.letter_date] ||= {})[v.variant] = v.rating; return acc; }, {});
    const dates = Object.keys(timeline).sort((a, b) => b.localeCompare(a));
    return { cid, name: nameMap[cid] || cid.slice(0, 8), r, summary: buildCompareSummary(vs), bDays: (bDaysByChild[cid] || new Set()).size, timeline, dates };
  }).sort((a, b) => b.r.n - a.r.n);

  const ICON: Record<string, string> = { up: '👍', down: '👎', repeat: '🔁' };

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a2b4a' }}>⚖️ A/B 비교</h1>
        <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>A(기존 v2)와 B(새 설계) 편지의 👍/👎/🔁 평가를 모아 승자를 판정해요. 🔁(또 비슷해요)는 별점보다 무겁게 봐요(반복=핵심 결함).</p>
      </header>

      {byChild.length === 0 && (
        <div style={{ padding: 20, background: 'white', border: '1px solid #ECECEC', borderRadius: 12, color: '#9CA3AF', fontSize: 13 }}>
          아직 비교 데이터가 없어요. compare 코호트(예: 아린)에 B 편지가 발행되고 A/B 평가가 쌓이면 여기에 승자가 나와요.
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {byChild.map((c) => {
          const v = VERDICT[c.r.winner];
          const conf = confidenceOf(c.r.n);
          return (
            <div key={c.cid} style={{ padding: 16, background: 'white', border: '1px solid #ECECEC', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <Link href={`/admin/${c.cid}`} style={{ fontSize: 15, fontWeight: 800, color: '#1a2b4a', textDecoration: 'none' }}>{c.name} ›</Link>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: v.fg, background: v.bg, borderRadius: 100, padding: '3px 10px' }}>{v.label}</span>
                  <span style={{ fontSize: 10.5, color: '#9CA3AF' }}>신뢰도 {CONF_LABEL[conf]} · 표본 {c.r.n}</span>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 12.5, color: '#374151' }}>{c.summary}</div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: '#6B7280' }}>
                점수 A {c.r.aScore} · B {c.r.bScore} &nbsp;|&nbsp; 🔁 신고율 A {Math.round(c.r.aRepeat * 100)}% · B {Math.round(c.r.bRepeat * 100)}% &nbsp;|&nbsp; B 발행 {c.bDays}일
              </div>
              {c.dates.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 11, color: '#9CA3AF', fontWeight: 700 }}>일자별 평가 {c.dates.length}일 ▾</summary>
                  <div style={{ marginTop: 6 }}>
                    {c.dates.map((d) => (
                      <div key={d} style={{ fontSize: 11.5, color: '#374151', padding: '3px 0', borderTop: '1px dashed #E5E7EB', display: 'flex', gap: 12 }}>
                        <b style={{ minWidth: 78 }}>{d}</b>
                        <span>A {c.timeline[d].A ? ICON[c.timeline[d].A!] : '—'}</span>
                        <span>B {c.timeline[d].B ? ICON[c.timeline[d].B!] : '—'}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
