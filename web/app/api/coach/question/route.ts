/**
 * POST /api/coach/question — 오늘의 질문 생성 (식사 기록 상담 피드백 루프)
 *
 * 과거 식단·거부·이전 답변을 보고, 편식 방법론 점검에 필요한 질문 1개를 생성.
 * 답변은 코칭 데이터로 쌓이고, 다음 질문·편지 맥락에 활용된다.
 *
 * body: { childName, ageBand, recentIngredients[], refused[], pastQA[] }
 * resp: { question, topic, chips[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ALLOWED = ['https://www.mealfred.com', 'https://mealfred.com', 'https://app.mealfred.com', 'https://mealfred-app.vercel.app'];
function cors(req: NextRequest) {
  const o = req.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[2], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
const AGE_LABEL: Record<string, string> = { younger: '만 3세 미만', '3-4y': '만 3-4세', '5y': '만 5세', '6-7y': '만 6-7세' };

const TOPICS = `점검할 방법론 주제 (이 중 맥락에 맞는 1개):
- 강요: 오늘 "한 입만" 압박 안 하셨는지
- 분위기: 식사 분위기·아이 감정
- 식사환경: 영상 보며 먹는지, 정해진 자리인지
- 자율성: 스스로 먹게 두는지
- 노출: 거부한 식재료를 부담 없이 다시 올렸는지
- 모델링: 부모가 같이 맛있게 먹는 모습 보여줬는지
- 식감: 식감 단계 도전(죽→핑거푸드)
- 새시도: 새 식재료 권해봤는지`;

export async function OPTIONS(req: NextRequest) { return NextResponse.json(null, { headers: cors(req) }); }

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const b = await req.json();
    const childName = (b.childName || '아이').toString().slice(0, 20);
    const age = AGE_LABEL[b.ageBand] || '유아';
    const ings: string[] = (b.recentIngredients || []).slice(0, 30);
    const refused: string[] = (b.refused || []).slice(0, 10);
    const pastQA: { q: string; a: string }[] = (b.pastQA || []).slice(0, 5);

    const ctx = `아이: ${childName} (${age})
최근 먹은 식재료: ${ings.length ? ings.join(', ') : '기록 적음'}
거부한 음식: ${refused.length ? refused.join(', ') : '없음'}
${pastQA.length ? `지난 질문·답변:\n${pastQA.map((p) => `Q:${p.q} → A:${p.a || '무응답'}`).join('\n')}` : ''}`;

    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `당신은 편식 부모를 매일 케어하는 코치입니다. 식사 기록 화면에서 부모에게 던질 "오늘의 질문" 1개를 만드세요.
목적: 편식 방법론 실천을 점검하고, 답을 코칭 데이터로 모읍니다. 부담 없이 1탭으로 답할 수 있게.

${TOPICS}

[맥락]
${ctx}

규칙:
- 과거 맥락을 반영해 가장 도움 될 질문 1개. 지난 질문과 겹치지 않게.
- 질문은 짧고 따뜻하게(존댓말). 죄책감 유발 X.
- chips: 1탭 답변 보기 3~5개 (예: 영상 질문이면 "안 봤어요","조금","계속")

JSON만: {"question": "...", "topic": "노출", "chips": ["보기1","보기2","보기3"]}`,
      }],
    });

    const c = resp.content[0];
    if (c.type !== 'text') return NextResponse.json({ error: 'fail' }, { status: 500, headers });
    const m = c.text.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ error: 'parse' }, { status: 500, headers });
    const p = JSON.parse(m[0]);
    return NextResponse.json({ question: p.question || '', topic: p.topic || '', chips: p.chips || [] }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[coach/question] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers });
  }
}
