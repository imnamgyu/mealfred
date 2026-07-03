/**
 * /admin/institutions — 평가 기록된 기관 리스트뷰(검색·등수정렬).
 * institution_scores(기관·월별 점수)를 전량 페이지 순회로 읽어(Supabase 1000행 절단 대응·fetchAllPages)
 * 코호트(유형·전체 기간 누적) 등수·상위%·대표강점을 계산하고, ?month= 선택 월의 행만 클라에 전달한다.
 * 월 드롭다운엔 데이터가 없어도 현재 KST 월이 항상 뜬다(월 바뀌면 최신 월 즉시 선택 가능·이사님 2026-07-03).
 * 접근: @mealfred.com 관리자만(서버 게이트, grant 패턴 동일).
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { type SevenAxes } from '@/lib/institutionScore';
import { fetchAllPages, chunk } from '@/lib/fetchAllPages';
import {
  kstMonth, buildMonthOptions, resolveSelectedMonth, buildTypePools, rankInPool, standoutInPool,
} from '@/lib/institutionListView';
import Link from 'next/link';
import InstitutionList from './InstitutionList';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = { daycare: '어린이집', kindergarten: '유치원', school: '학교', elementary: '초등학교' };

// 이 리스트뷰는 유치원·어린이집만(초등학교 제외·이사님 2026-07-03) — DB 셀렉트 단계에서 거른다.
//   초등학교(elementary) 행이 15,000+로 압도적이라 섞이면 리스트가 학교로 도배됨. 코호트·등수도 이 두 유형 안에서만.
const VISIBLE_TYPES = ['daycare', 'kindergarten'];

type ScoreRow = {
  institution_id: string; month: string; score: number; type: string;
  sigungu: string | null; day_count: number | null;
  standout_dims: Record<string, number> | null;
};

const r1 = (v?: number) => (v == null || isNaN(Number(v))) ? '—' : String(Math.round(Number(v) * 10) / 10);
const pc = (v?: number) => (v == null || isNaN(Number(v))) ? '—' : Math.round(Number(v) * 100) + '%';

export default async function InstitutionsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return (
      <main style={{ maxWidth: 480, margin: '60px auto', padding: 24, fontFamily: 'Pretendard' }}>
        <p style={{ color: '#6B7280' }}>🔒 관리자 전용. <Link href="/admin" style={{ color: '#FF6B1A' }}>← 콘솔</Link></p>
      </main>
    );
  }
  const { month: monthParam } = await searchParams;

  const db = createSupabaseAdmin();
  // 전량 페이지 순회(Supabase는 .limit(5000)도 1000행으로 절단·2026-07-03 실측) —
  // .order 2개(institution_id,month=유니크 키)로 페이지 간 중복/누락 방지.
  const scores = (await fetchAllPages((from, to) =>
    db.from('institution_scores')
      .select('institution_id,month,score,type,sigungu,day_count,standout_dims', { count: 'exact' })
      .in('type', VISIBLE_TYPES)
      .order('institution_id').order('month').range(from, to))) as unknown as ScoreRow[];

  const currentMonth = kstMonth(new Date());
  const dataMonths = new Set(scores.map((s) => s.month));
  const months = buildMonthOptions(dataMonths, currentMonth);
  const selected = resolveSelectedMonth(monthParam, months, dataMonths, currentMonth);
  const visible = selected === 'all' ? scores : scores.filter((s) => s.month === selected);

  // 코호트 풀은 전량으로 구축(등수·상위%·대표강점 기준), 계산·전송은 선택 월 행만.
  const pools = buildTypePools(scores);

  // 7축(axes)은 화면에 보이는 월만 — 전량 JSON 전송 절감. 컬럼 없으면(마이그레이션 전) 에러나도 리스트는 살아있게(resilient).
  const axesMap: Record<string, SevenAxes> = {};
  try {
    const axRows = (await fetchAllPages((from, to) => {
      let q = db.from('institution_scores').select('institution_id,month,axes', { count: 'exact' }).in('type', VISIBLE_TYPES);
      if (selected !== 'all') q = q.eq('month', selected);
      return q.order('institution_id').order('month').range(from, to);
    })) as unknown as { institution_id: string; month: string; axes: SevenAxes | null }[];
    for (const r of axRows) if (r.axes) axesMap[`${r.institution_id}|${r.month}`] = r.axes;
  } catch { /* axes 컬럼 미존재 → 7축만 생략 */ }

  const ids = [...new Set(visible.map((s) => s.institution_id))];
  const nameMap: Record<string, string> = {};
  await Promise.all(chunk(ids, 200).map(async (part) => {
    const { data } = await db.from('institutions').select('id,name').in('id', part);
    for (const i of (data || []) as { id: string; name: string }[]) nameMap[i.id] = i.name;
  }));

  const rows = visible.map((s) => {
    const { rank, total } = rankInPool(pools, s.type, s.score);
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
      topPercent: total > 1 ? Math.max(1, Math.round((rank / total) * 100)) : null,   // 단독(코호트 1개)이면 등수 무의미 → null('상위 100%' 표시 차단·이사님 2026-06-23)
      standout: standoutInPool(pools, s.type, s.standout_dims),
      fish: r1(d.fishFrequency), legume: r1(d.legumeFrequency), veg: Math.round(d.vegVariety || 0), lowProc: pc(d.lowProcessed),
      axes: axesMap[`${s.institution_id}|${s.month}`] || null,
    };
  });

  const instCount = new Set(scores.map((s) => s.institution_id)).size;
  return <InstitutionList rows={rows} months={months} selected={selected} instCount={instCount} rowCount={scores.length} />;
}
