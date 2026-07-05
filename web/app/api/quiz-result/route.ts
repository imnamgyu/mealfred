/**
 * /api/quiz-result — 편식 상식 점수(쿠키 테스트) 익명 결과 적재 + 집계.
 *  POST: mealfred.com 정적 페이지가 fire-and-forget 호출. 봇 제외·범위 검증 후 quiz_results insert.
 *        테이블 없으면(마이그레이션 전) 조용히 ok — 메인 흐름 무영향(app_visitors 패턴).
 *  GET:  ?tool=knowledge&qv=k1 → n·평균·점수분포·문항별 오답률(오답률 높은 순).
 *        게시글("부모 N%가 이 문제를 틀려요")·보고서 소재용. 전량은 fetchAllPages(1000행 절단 대응).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { validateQuizPayload, aggregateQuizStats, type QuizStatRow } from '@/lib/quizStats';

export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ALLOWED = ['https://www.mealfred.com', 'https://mealfred.com', 'https://app.mealfred.com', 'https://mealfred-app.vercel.app'];
function cors(req: NextRequest) {
  const o = req.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[0], 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
export async function OPTIONS(req: NextRequest) { return NextResponse.json(null, { headers: cors(req) }); }

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  if (/bot|crawler|spider|facebookexternalhit|kakaotalk-scrap|slackbot|twitterbot|whatsapp|headless|lighthouse/.test(ua)) {
    return NextResponse.json({ ok: true }, { headers });
  }
  const payload = validateQuizPayload(await req.json().catch(() => null));
  if (!payload) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400, headers });
  try {
    const { error } = await supabase.from('quiz_results').insert({
      tool: payload.tool, qv: payload.qv, score: payload.score, correct: payload.correct,
      answers: payload.answers, wrong: payload.wrong,
    });
    if (error) console.warn('[quiz-result] insert skip:', error.message);   // 테이블 없음 등 — 조용히 무시
  } catch (e) {
    console.warn('[quiz-result] insert skip:', e instanceof Error ? e.message : String(e));
  }
  return NextResponse.json({ ok: true }, { headers });
}

export async function GET(req: NextRequest) {
  const headers = { ...cors(req), 'Cache-Control': 'public, max-age=60, s-maxage=60', Vary: 'Origin' };
  try {
    const url = new URL(req.url);
    const tool = (url.searchParams.get('tool') || 'knowledge').slice(0, 20);
    const qv = (url.searchParams.get('qv') || 'k1').slice(0, 12);
    const rows = await fetchAllPages<QuizStatRow>((from, to) =>
      supabase.from('quiz_results').select('score,wrong', { count: 'exact' })
        .eq('tool', tool).eq('qv', qv).order('id').range(from, to));
    return NextResponse.json({ tool, qv, ...aggregateQuizStats(rows) }, { headers });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' },
      { status: 500, headers: { ...headers, 'Cache-Control': 'no-store' } });
  }
}
