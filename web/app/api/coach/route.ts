/**
 * POST /api/coach — AI 편식 코치 (조언 편지 + 3일 진단 한줄)
 *
 * 최근 식사 기록(정성 메모·거부·반응·신호등)을 받아
 * 35개 국제 방법론(SOS·푸드브릿지·HabEat·Satter·Cooke) 기반으로
 * 부모를 안심시키는 편지 + 진단 한줄을 생성한다.
 *
 * body: { ageBand, childName, recentNotes[], refused[], reds[], eatenCount, reactions{} }
 * resp: { letter, oneliner }
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED = ['https://www.mealfred.com', 'https://mealfred.com', 'https://app.mealfred.com', 'https://mealfred-app.vercel.app'];
function cors(req: NextRequest) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[2],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

const AGE_LABEL: Record<string, string> = { younger: '만 3세 미만', '3-4y': '만 3-4세', '5y': '만 5세', '6-7y': '만 6-7세' };

const METHODOLOGY = `편식 해결 핵심 방법론 (반드시 이 원칙에 맞춰 조언):
1. 강요 금지 — 억지로 먹이면 거부가 강해진다. "한 입만" 압박 X.
2. 역할 분담(Satter) — 부모는 무엇·언제·어디서, 아이는 먹을지·얼마나.
3. 즐거운 분위기 — 칭찬·놀이·탐색. 식탁은 전쟁터가 아니다.
4. 반복 노출 — 한 식재료를 8~15번(편식 심하면 더, 최대 30번) 만나야 받아들인다. 거부는 실패 아님.
5. 감각 사다리(SOS) — 보기→만지기→냄새→핥기→씹기→삼키기. 입에 넣기 전부터 친해진다.
6. 조리 사다리 — 거부 식재료는 죽·국(부드러움)부터 → 볶음·구이(단단함)로.
7. 푸드브릿지 — 좋아하는 음식에서 색·온도·질감·맛 비슷한 것으로 다리 놓기. 새 음식은 익숙한 것 옆에.
8. 부모 모델링 — 부모가 맛있게 먹는 모습을 보여준다. 같이 식탁에.
9. 식사 구조화 — 정해진 시간·자리·20분 이내. 영상 보며 먹기 X(새 맛 학습 방해).
10. 골든타임 — 만 2~6세(초등 입학 전)가 결정적 시기. 지금이 가장 쉬울 때.`;

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(null, { headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const b = await req.json();
    const childName = (b.childName || '아이').toString().slice(0, 20);
    const age = AGE_LABEL[b.ageBand] || '유아';
    const notes: string[] = (b.recentNotes || []).slice(0, 10);
    const refused: string[] = (b.refused || []).slice(0, 10);
    const reds: string[] = (b.reds || []).slice(0, 8);
    const eatenCount = b.eatenCount ?? 0;

    const context = `아이: ${childName} (${age})
먹어본 식재료: ${eatenCount}가지 (목표 30가지 → 초등 전 130가지)
부족 영양소: ${reds.length ? reds.join(', ') : '없음'}
최근 거부한 음식: ${refused.length ? refused.join(', ') : '없음'}
부모가 남긴 메모(정성 기록): ${notes.length ? notes.map((n) => `"${n}"`).join(' / ') : '없음'}`;

    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `당신은 편식으로 매 끼니 스트레스받는 부모를 돕는 따뜻한 편식 코치입니다.
부모는 죄책감·불안·무력감을 느낍니다. 점수로 다그치지 말고, 먼저 안심시키고, 구체적 다음 행동 하나를 주세요.

${METHODOLOGY}

[이번 주 상황]
${context}

아래 2가지를 JSON으로 작성하세요:
1. "letter": 부모에게 보내는 짧은 편지 (3~4문장). 부모의 노력을 인정하고, 거부는 정상임을 안심시키고(반복 노출 원리 언급), 오늘 시도할 구체적 행동 1개를 방법론에 맞춰 제안. 따뜻한 반말 X, 정중한 존댓말. 점수·등급 언급 금지.
2. "oneliner": 최근 식단 진단 한 줄 (1문장). 잘하는 점 + 가장 신경 쓸 점 1개를 방법론 근거로. 격려 톤.

반드시 JSON만: {"letter": "...", "oneliner": "..."}`,
      }],
    });

    const c = resp.content[0];
    if (c.type !== 'text') return NextResponse.json({ error: 'fail' }, { status: 500, headers });
    const m = c.text.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ error: 'parse' }, { status: 500, headers });
    const parsed = JSON.parse(m[0]);
    return NextResponse.json({ letter: parsed.letter || '', oneliner: parsed.oneliner || '' }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[coach] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers });
  }
}
