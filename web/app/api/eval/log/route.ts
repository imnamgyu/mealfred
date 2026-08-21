/**
 * 서비스 종료(2026-08-21): 어린이집·유치원 식단표 평가(영양 점수·전국 비교) 서비스를 종료했습니다.
 * 이 엔드포인트는 410 Gone만 반환합니다. 종료 전 구현은 git 이력(2026-08-20 이전) 참조.
 */
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const ALLOWED_ORIGINS = ['https://www.mealfred.com', 'https://mealfred.com', 'https://app.mealfred.com', 'https://mealfred-app.vercel.app'];
function cors(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
const gone = (req: NextRequest) => NextResponse.json(
  { ok: false, discontinued: true, reason: '어린이집·유치원 식단표 평가 서비스는 2026-08-21부로 종료되었습니다.' },
  { status: 410, headers: cors(req) },
);
export async function OPTIONS(req: NextRequest) { return NextResponse.json(null, { headers: cors(req) }); }
export async function GET(req: NextRequest) { return gone(req); }
export async function POST(req: NextRequest) { return gone(req); }
