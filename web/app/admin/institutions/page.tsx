/**
 * /admin/institutions — 평가 기록된 기관 리스트뷰(검색·등수정렬).
 * institution_scores(기관·월별 점수) + 기관명 → 코호트(유형·월) 등수·상위% + 대표강점 계산해 클라에 전달.
 * 접근: @mealfred.com 관리자만(서버 게이트, grant 패턴 동일).
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { STANDOUT_META, type SevenAxes } from '@/lib/institutionScore';
import Link from 'next/link';
import InstitutionList from './InstitutionList';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = { daycare: '어린이집', kindergarten: '유치원', school: '학교' };

type ScoreRow = {
  institution_id: string; month: string; score: number; type: string;
  sido: string | null; sigungu: string | null; day_count: number | null;
  standout_dims: Record<string, number> | null; summary: string | null;
};

const r1 = (v?: number) => (v == null || isNaN(Number(v))) ? '—' : String(Math.round(Number(v) * 10) / 10);
const pc = (v?: number) => (v == null || isNaN(Number(v))) ? '—' : Math.round(Number(v) * 100) + '%';

export default async function InstitutionsPage() {
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
  const { data: scoreRows } = await db.from('institution_scores')
    .select('institution_id,month,score,type,sido,sigungu,day_count,standout_dims,summary')
    .order('score', { ascending: false })
    .limit(5000);
  const scores = (scoreRows || []) as ScoreRow[];

  // 7축(axes) — axes 컬럼 없으면 에러나도 리스트는 살아있게(resilient)
  const axesMap: Record<string, SevenAxes> = {};
  const axRes = await db.from('institution_scores').select('institution_id,month,axes').limit(5000);
  for (const r of ((axRes.data || []) as { institution_id: string; month: string; axes: SevenAxes | null }[])) if (r.axes) axesMap[`${r.institution_id}|${r.month}`] = r.axes;

  const ids = [...new Set(scores.map((s) => s.institution_id))];
  const instRes = ids.length ? await db.from('institutions').select('id,name').in('id', ids) : { data: [] };
  const nameMap = Object.fromEntries(((instRes.data || []) as { id: string; name: string }[]).map((i) => [i.id, i.name]));

  // 코호트(유형·월) 등수, 유형 풀(대표강점 percentile)
  const cohortMap = new Map<string, ScoreRow[]>();
  const byType = new Map<string, ScoreRow[]>();
  for (const s of scores) {
    const ck = `${s.type}|${s.month}`;
    (cohortMap.get(ck) ?? cohortMap.set(ck, []).get(ck)!).push(s);
    (byType.get(s.type) ?? byType.set(s.type, []).get(s.type)!).push(s);
  }

  function standoutOf(s: ScoreRow): string {
    const pool = byType.get(s.type) || [];
    if (pool.length < 8) return '—';
    let best: { label: string; pct: number; priority: number } | null = null;
    for (const m of STANDOUT_META) {
      const myVal = Number((s.standout_dims || {})[m.key] ?? 0);
      if (myVal <= 0) continue;
      const vals = pool.map((p) => Number((p.standout_dims || {})[m.key] ?? 0));
      const pct = Math.round((vals.filter((v) => v <= myVal).length / vals.length) * 100);
      if (pct >= 60 && (!best || pct > best.pct || (pct === best.pct && m.priority < best.priority))) best = { label: m.label, pct, priority: m.priority };
    }
    return best ? `${best.label}·${best.pct}%` : '—';
  }

  const rows = scores.map((s) => {
    const cohort = cohortMap.get(`${s.type}|${s.month}`) || [];
    const rank = cohort.filter((x) => x.score > s.score).length + 1;
    const total = cohort.length;
    const d = (s.standout_dims || {}) as Record<string, number>;
    return {
      institutionId: s.institution_id,
      name: nameMap[s.institution_id] || '(미상)',
      sigungu: s.sigungu || '',
      typeLabel: TYPE_LABEL[s.type] || s.type,
      month: s.month,
      score: s.score,
      dayCount: s.day_count || 0,
      rank, total,
      topPercent: total ? Math.max(1, Math.round((rank / total) * 100)) : null,
      standout: standoutOf(s),
      fish: r1(d.fishFrequency), legume: r1(d.legumeFrequency), veg: Math.round(d.vegVariety || 0), lowProc: pc(d.lowProcessed),
      axes: axesMap[`${s.institution_id}|${s.month}`] || null,
    };
  });

  const instCount = ids.length;
  const monthCount = scores.length;
  return <InstitutionList rows={rows} instCount={instCount} monthCount={monthCount} />;
}
