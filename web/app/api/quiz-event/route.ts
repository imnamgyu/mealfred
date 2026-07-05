/**
 * POST /api/quiz-event — 쿠키 테스트 결과 화면의 전환 클릭 적재(app_cta·share).
 * mealfred.com 정적 페이지가 fire-and-forget 호출. 테이블 없으면 조용히 ok(degrade-safe).
 * 집계는 /admin/quiz(참여 대비 전환율).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateQuizEvent } from '@/lib/quizStats';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ALLOWED = ['https://www.mealfred.com', 'https://mealfred.com', 'https://app.mealfred.com', 'https://mealfred-app.vercel.app'];
function cors(req: NextRequest) {
  const o = req.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
export async function OPTIONS(req: NextRequest) { return NextResponse.json(null, { headers: cors(req) }); }

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  if (/bot|crawler|spider|facebookexternalhit|kakaotalk-scrap|slackbot|twitterbot|whatsapp|headless|lighthouse/.test(ua)) {
    return NextResponse.json({ ok: true }, { headers });
  }
  const ev = validateQuizEvent(await req.json().catch(() => null));
  if (!ev) return NextResponse.json({ ok: false, error: 'invalid event' }, { status: 400, headers });
  try {
    const { error } = await supabase.from('quiz_events').insert(ev);
    if (error) console.warn('[quiz-event] insert skip:', error.message);
  } catch (e) {
    console.warn('[quiz-event] insert skip:', e instanceof Error ? e.message : String(e));
  }
  return NextResponse.json({ ok: true }, { headers });
}
