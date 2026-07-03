/**
 * GET /api/institution/stats — 기관 식단 수집 현황(라이브). daycare-eval-engine 문서가 fetch해 동기화.
 * institution_scores(공개 read) 단일 집계: 기관 수·시군구·월 범위·유형별·점수 분포 + 메뉴아이템·OCR 누적.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@/lib/fetchAllPages';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ALLOWED = ['https://www.mealfred.com', 'https://mealfred.com', 'https://app.mealfred.com', 'https://mealfred-app.vercel.app'];
function cors(req: NextRequest) {
  const o = req.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[0], 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
export async function OPTIONS(req: NextRequest) { return NextResponse.json(null, { headers: cors(req) }); }

async function headCount(table: string): Promise<number> {
  const r = await supabase.from(table).select('id', { count: 'exact', head: true });
  return r.count || 0;
}

export async function GET(req: NextRequest) {
  const headers = { ...cors(req), 'Cache-Control': 'public, max-age=120, s-maxage=120', Vary: 'Origin' };
  try {
    // 전량 페이지 순회 — 무제한 select도 Supabase가 1000행으로 절단(2026-07-03 실측), 통계가 상위 1000행만 집계되던 버그 수정.
    const rows = await fetchAllPages<{ institution_id: string; sigungu: string | null; sido: string | null; type: string; month: string; score: number }>((from, to) =>
      supabase.from('institution_scores').select('institution_id,sigungu,sido,type,month,score', { count: 'exact' })
        .order('institution_id').order('month').range(from, to));
    const insts = new Set(rows.map((r) => r.institution_id));
    const sigungu = new Set(rows.map((r) => r.sigungu).filter(Boolean));
    const sido = new Set(rows.map((r) => r.sido).filter(Boolean));
    const months = rows.map((r) => r.month).filter(Boolean).sort();
    const scores = rows.map((r) => r.score).filter((s) => s != null).sort((a, b) => a - b);
    const sigunguByCount: Record<string, Set<string>> = {};
    for (const r of rows) { if (r.sigungu) (sigunguByCount[r.sigungu] ||= new Set()).add(r.institution_id); }
    const typeAgg = (t: string) => {
      const rs = rows.filter((r) => r.type === t);
      return { institutions: new Set(rs.map((r) => r.institution_id)).size, months: rs.length };
    };
    const dist = [0, 0, 0, 0]; // <70, 70-84, 85-91, 92+
    for (const s of scores) dist[s >= 92 ? 3 : s >= 85 ? 2 : s >= 70 ? 1 : 0]++;
    const med = scores.length ? scores[Math.floor(scores.length / 2)] : null;
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    return NextResponse.json({
      institutions: insts.size,
      institutionMonths: rows.length,
      sigunguCount: sigungu.size,
      sidoCount: sido.size,
      monthSpan: months.length ? [months[0], months[months.length - 1]] : null,
      score: scores.length ? { min: scores[0], median: med, max: scores[scores.length - 1], avg } : null,
      scoreDist: { under70: dist[0], g70_84: dist[1], g85_91: dist[2], g92plus: dist[3] },
      byType: { daycare: typeAgg('daycare'), kindergarten: typeAgg('kindergarten') },
      sigunguList: Object.entries(sigunguByCount).map(([k, v]) => ({ sigungu: k, institutions: v.size })).sort((a, b) => b.institutions - a.institutions),
      menuItems: await headCount('institution_menu_items'),
      ocrLogs: await headCount('ocr_logs'),
      updatedAt: new Date().toISOString(),
    }, { headers });
  } catch (e: unknown) {
    // 오류는 캐시 금지 — 성공용 max-age=120을 그대로 쓰면 일시 장애가 2분간 캐시돼 복구 후에도 오류가 보임.
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' },
      { status: 500, headers: { ...headers, 'Cache-Control': 'no-store' } });
  }
}
