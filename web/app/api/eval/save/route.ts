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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(null, { headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const body = await req.json();

    const { data, error } = await supabase.from('eval_results').insert({
      age_band: body.age_band,
      input_mode: body.input_mode,
      total_score: body.total_score,
      grade: body.grade,
      axis_scores: body.axis_scores,
      matched_count: body.matched_count,
      total_menus: body.total_menus,
      matched_ingredients: body.matched_ingredients,
      missing_essential: body.missing_essential,
    }).select('id').single();

    if (error) {
      console.error('[eval/save] DB error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500, headers });
    }

    console.log('[eval/save] 저장 완료:', { id: data.id, grade: body.grade, score: body.total_score });
    return NextResponse.json({ id: data.id }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[eval/save] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers });
  }
}
