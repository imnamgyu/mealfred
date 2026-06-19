/**
 * GET /api/institution/search?q=…&type=daycare|kindergarten — 기관 검색(자동완성).
 *
 * 정적 daycare-eval.html이 기관을 '검색→선택'하도록 공개 읽기 엔드포인트.
 * institutions.name_norm(공백제거) ilike 매칭 — InstitutionSelect.tsx와 동형.
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

export async function GET(req: NextRequest) {
  const headers = cors(req);
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const type = url.searchParams.get('type') || '';   // 선택: 'daycare' | 'kindergarten' | 'school'
    if (q.replace(/\s/g, '').length < 2) {
      return NextResponse.json({ results: [] }, { headers });
    }
    const norm = q.replace(/\s/g, '');
    let query = supabase.from('institutions')
      .select('id,name,type,sido,sigungu,dong,inst_type')
      .ilike('name_norm', `%${norm}%`)
      .limit(12);
    if (type === 'daycare' || type === 'kindergarten' || type === 'school') query = query.eq('type', type);
    const { data, error } = await query;
    if (error) return NextResponse.json({ results: [], error: error.message }, { status: 500, headers });
    return NextResponse.json({ results: data || [] }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ results: [], error: msg }, { status: 500, headers });
  }
}
