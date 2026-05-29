/**
 * POST /api/coach/question — 오늘의 질문 생성 (식사 기록 상담 피드백 루프)
 *
 * 실제 로그한 음식을 짚어 데이터로 못 푸는 정성(완식·혼합·반응·환경)만 묻는 질문 1개.
 * 답변은 코칭 데이터로 쌓여 다음 질문·편지 맥락에 활용된다.
 * 생성 규칙·프롬프트는 lib/coach.ts에 공유(DRY).
 *
 * body: QuestionInput (childName, ageBand, recentMeals[]{food,place,ateWell,slot,daysAgo},
 *       recentIngredients[], refused[], daycareRefused[], pastQA[])
 * resp: { question, topic, chips[] }
 *
 * 스펙: 편식극복키트/06_운영/카톡코칭/코칭엔진_스펙_v1.md
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateQuestion } from '@/lib/coach';

const ALLOWED = ['https://www.mealfred.com', 'https://mealfred.com', 'https://app.mealfred.com', 'https://mealfred-app.vercel.app'];
function cors(req: NextRequest) {
  const o = req.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[2], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}

export async function OPTIONS(req: NextRequest) { return NextResponse.json(null, { headers: cors(req) }); }

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const b = await req.json();
    const { question, topic, chips } = await generateQuestion({
      childName: b.childName,
      ageBand: b.ageBand,
      recentMeals: b.recentMeals,
      recentIngredients: b.recentIngredients,
      refused: b.refused,
      homeRefused: b.homeRefused,
      daycareRefused: b.daycareRefused,
      pastQA: b.pastQA,
    });
    return NextResponse.json({ question, topic, chips }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[coach/question] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers });
  }
}
