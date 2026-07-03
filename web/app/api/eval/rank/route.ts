/**
 * GET /api/eval/rank?institution_id=…&month=YYYY-MM — 기관 영양 순위(컨셉: 모두 우수·종이 한 장).
 *
 * 이사님 2026-06-22 재설계: 점수는 거의 전원 90+(변별력 낮음=기관 다 훌륭) → '공동 N위' + 종이 한 장.
 *   변별 압박은 '대표 강점 한 줄'(코호트 percentile 1위 차원)이 흡수. 약점은 절대 미노출.
 *   화면 점수는 고대역(거의 만점)으로, '매우 우수 · 모두 안심 등급' 라벨 전면.
 *   standout_dims 컬럼이 아직 없어도(마이그레이션 전) 순위·등급은 정상 — 강점만 생략(graceful).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { STANDOUT_META, type StandoutDims } from '@/lib/institutionScore';
import { fetchAllPages } from '@/lib/fetchAllPages';

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

const TYPE_LABEL: Record<string, string> = { daycare: '어린이집', kindergarten: '유치원', school: '학교', elementary: '초등학교' };

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
      .select('score,type,sido,sigungu,summary,day_count')
      .eq('institution_id', institutionId).eq('month', month).maybeSingle();
    if (!me) return NextResponse.json({ ranked: false, reason: '아직 이 기관의 이번 달 점수가 없어요.' }, { headers });

    // 코호트 = 같은 유형·전체 기간 누적(월 격리 제거·이사님 2026-06-24): 월별 표본이 작아 '상위 X%'가 거의 안 뜨던 문제 해소.
    //   풀 = 같은 유형의 '모든 월' 점수 행(기관-월 단위로 누적). me.score(선택한 달 점수)를 이 누적 분포에 대고 순위 산출.
    //   ⚠️ .limit(100000)은 무력 — Supabase가 요청당 1000행으로 응답 절단(2026-07-03 실측) → 전량은 fetchAllPages로.
    const cohort = await fetchAllPages<{ score: number; sigungu: string | null }>((from, to) =>
      supabase.from('institution_scores').select('score,sigungu', { count: 'exact' })
        .eq('type', me.type).order('institution_id').order('month').range(from, to));
    const nationalTotal = cohort.length;
    const nationalRank = cohort.filter((c) => c.score > me.score).length + 1;
    const nationalTie = cohort.filter((c) => c.score === me.score).length > 1;

    let regionRank: number | null = null, regionTotal: number | null = null, regionTie = false;
    if (me.sigungu) {
      const reg = cohort.filter((c) => c.sigungu === me.sigungu);
      regionTotal = reg.length;
      regionRank = reg.filter((c) => c.score > me.score).length + 1;
      regionTie = reg.filter((c) => c.score === me.score).length > 1;
    }

    const lowConf = (me.day_count || 0) < 5;

    // ── 대표 강점(standout_dims 컬럼 있을 때만, percentile≥60 1개만) ──
    let standout: { key: string; label: string; phrase: string; percentile: number } | null = null;
    try {
      const meDim = await supabase.from('institution_scores')
        .select('standout_dims').eq('institution_id', institutionId).eq('month', month).maybeSingle();
      const myDims = (meDim.data?.standout_dims || null) as Partial<StandoutDims> | null;
      if (myDims && Object.keys(myDims).length) {
        // 풀도 1000행 절단 대상(월별 1400+행) → 전량 페이지 순회.
        type DimRow = { standout_dims: Partial<StandoutDims> | null };
        let pool = await fetchAllPages<DimRow>((from, to) =>
          supabase.from('institution_scores').select('standout_dims', { count: 'exact' })
            .eq('type', me.type).eq('month', month).order('institution_id').range(from, to));
        if (pool.length < 8) {
          pool = await fetchAllPages<DimRow>((from, to) =>
            supabase.from('institution_scores').select('standout_dims', { count: 'exact' })
              .eq('type', me.type).order('institution_id').order('month').range(from, to));
        }
        if (pool.length >= 8) {
          const cand = STANDOUT_META.map((m) => {
            const myVal = Number(myDims[m.key] ?? 0);
            const vals = pool.map((p) => Number((p.standout_dims || {})[m.key] ?? 0));
            const pct = vals.length ? Math.round((vals.filter((v) => v <= myVal).length / vals.length) * 100) : 0;
            return { ...m, pct, myVal };
          }).filter((c) => c.myVal > 0 && c.pct >= 60)
            .sort((a, b) => b.pct - a.pct || a.priority - b.priority);
          if (cand.length) standout = { key: cand[0].key, label: cand[0].label, phrase: lowConf ? cand[0].low : cand[0].phrase, percentile: cand[0].pct };
        }
      }
    } catch { /* standout_dims 컬럼 미존재(마이그레이션 전) → 강점 생략 */ }

    const topPercent = nationalTotal ? Math.max(1, Math.round((nationalRank / nationalTotal) * 100)) : null;
    // ⭐ 이사님 2026-06-22: 점수 인위적 상향(고대역 커브)·gradeBand 제거 → 객관 점수만. 화면엔 상위 X%만 노출(절대값·등급 미노출).

    return NextResponse.json({
      ranked: true,
      score: me.score,
      typeLabel: TYPE_LABEL[me.type] || '기관',
      sido: me.sido || null, sigungu: me.sigungu || null,
      nationalRank, nationalTotal, nationalTie,
      regionRank, regionTotal, regionTie,
      topPercent, standout,
      summary: me.summary || null,
      dayCount: me.day_count || 0, lowConfidence: lowConf,
    }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[eval/rank] error:', msg);
    return NextResponse.json({ ranked: false, error: msg }, { status: 500, headers });
  }
}
