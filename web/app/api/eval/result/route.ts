import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALLOWED_ORIGINS = [
  'https://www.mealfred.com',
  'https://mealfred.com',
  'https://app.mealfred.com',
  'https://mealfred-app.vercel.app',
];

function cors(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(null, { headers: cors(req) });
}

// 결과 스냅샷은 분석 시점에 1회 기록된 뒤 불변(재분석=새 id) → 부모가 공유링크를 열 때마다
// 서버리스+DB를 다시 타지 않도록 Vercel CDN에 캐싱. CORS Origin별로 캐시가 갈리도록 Vary:Origin.
//   브라우저 max-age=60(연속 새로고침 즉시) · CDN s-maxage=1일 · SWR 1일(만료 후 한 번만 재검증).
const CACHE_HIT = 'public, max-age=60, s-maxage=86400, stale-while-revalidate=86400';
const CACHE_NONE = 'no-store';   // 에러/만료/없음은 캐시 금지(갓 생성된 id가 404로 박제되는 것 방지)

// 공유 결과 조회 — 분석 시 저장한 스냅샷을 읽어서 반환 (LLM 미사용). 3일 후 만료.
export async function GET(req: NextRequest) {
  const headers = cors(req);
  const errHeaders = { ...headers, 'Cache-Control': CACHE_NONE };
  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id 누락' }, { status: 400, headers: errHeaders });
  }
  // UUID가 아니면(URL 조작 등) DB 캐스트 에러 노출 없이 깔끔한 404
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: errHeaders });
  }
  try {
    const { data, error } = await supabase
      .from('eval_results')
      .select('result_json, expires_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: errHeaders });
    }
    if (!data || !data.result_json) {
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: errHeaders });
    }
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ expired: true }, { status: 410, headers: errHeaders });
    }
    // 불변 스냅샷 → CDN 캐싱(Origin별로 분리)
    return NextResponse.json(
      { result_json: data.result_json },
      { headers: { ...headers, 'Cache-Control': CACHE_HIT, Vary: 'Origin' } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500, headers: errHeaders });
  }
}
