/**
 * GET /api/eval/rank?institution_id=…&month=YYYY-MM — 기관 영양 점수 전국·지역 순위.
 *
 * 이사님 2026-06-19 daycare-eval '우리 기관 상위 몇 등'. institution_scores 단일 스캔(메타 비정규화).
 *   전국 = 같은 type·month 내 점수 내림차순 / 지역 = + 같은 sigungu. 동점은 공동순위(gt 기준).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALLOWED_ORIGINS = [
  'https://www.mealfred.com', 'https://mealfred.com',
  'https://app.mealfred.com', 'https://mealfred-app.vercel.app',
];
function cors(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
export async function OPTIONS(req: NextRequest) { return NextResponse.json(null, { headers: cors(req) }); }

const TYPE_LABEL: Record<string, string> = { daycare: '어린이집', kindergarten: '유치원', school: '학교' };

export async function GET(req: NextRequest) {
  const headers = cors(req);
  try {
    const url = new URL(req.url);
    const institutionId = url.searchParams.get('institution_id') || '';
    const month = (url.searchParams.get('month') || '').slice(0, 7);
    if (!institutionId || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ ranked: false, error: 'institution_id·month(YYYY-MM) 필요' }, { status: 400, headers });
    }

    const { data: me } = await supabase.from('institution_scores')
      .select('score,type,sido,sigungu,summary,red_groups,day_count')
      .eq('institution_id', institutionId).eq('month', month).maybeSingle();
    if (!me) {
      return NextResponse.json({ ranked: false, reason: '아직 이 기관의 이번 달 점수가 없어요.' }, { headers });
    }

    // 전국(같은 type·month)
    const natTotalQ = await supabase.from('institution_scores').select('id', { count: 'exact', head: true })
      .eq('type', me.type).eq('month', month);
    const natAboveQ = await supabase.from('institution_scores').select('id', { count: 'exact', head: true })
      .eq('type', me.type).eq('month', month).gt('score', me.score);
    const nationalTotal = natTotalQ.count || 0;
    const nationalRank = (natAboveQ.count || 0) + 1;

    // 지역(같은 sigungu·type·month)
    let regionRank: number | null = null, regionTotal: number | null = null;
    if (me.sigungu) {
      const rt = await supabase.from('institution_scores').select('id', { count: 'exact', head: true })
        .eq('type', me.type).eq('month', month).eq('sigungu', me.sigungu);
      const ra = await supabase.from('institution_scores').select('id', { count: 'exact', head: true })
        .eq('type', me.type).eq('month', month).eq('sigungu', me.sigungu).gt('score', me.score);
      regionTotal = rt.count || 0;
      regionRank = (ra.count || 0) + 1;
    }

    const topPercent = nationalTotal ? Math.max(1, Math.round((nationalRank / nationalTotal) * 100)) : null;

    return NextResponse.json({
      ranked: true,
      score: me.score,
      summary: me.summary || null,
      redGroups: me.red_groups || [],
      typeLabel: TYPE_LABEL[me.type] || '기관',
      sido: me.sido || null,
      sigungu: me.sigungu || null,
      nationalRank, nationalTotal,
      regionRank, regionTotal,
      topPercent,
      dayCount: me.day_count || 0,
      lowConfidence: (me.day_count || 0) < 5,   // 표본(채점일) 적으면 낮은 신뢰 표시용
    }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[eval/rank] error:', msg);
    return NextResponse.json({ ranked: false, error: msg }, { status: 500, headers });
  }
}
