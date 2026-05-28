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

// 공유 결과 조회 — 분석 시 저장한 스냅샷을 읽어서 반환 (LLM 미사용). 3일 후 만료.
export async function GET(req: NextRequest) {
  const headers = cors(req);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id 누락' }, { status: 400, headers });
  }
  // UUID가 아니면(URL 조작 등) DB 캐스트 에러 노출 없이 깔끔한 404
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers });
  }
  try {
    const { data, error } = await supabase
      .from('eval_results')
      .select('result_json, expires_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers });
    }
    if (!data || !data.result_json) {
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers });
    }
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ expired: true }, { status: 410, headers });
    }
    return NextResponse.json({ result_json: data.result_json }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500, headers });
  }
}
