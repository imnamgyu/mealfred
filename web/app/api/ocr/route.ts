import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.mealfred.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json(null, { headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) {
      return NextResponse.json(
        { error: '이미지가 없습니다' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: '파일 크기가 10MB를 초과합니다' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');

    const ext = file.type.split('/')[1] || 'jpeg';
    const mediaType = (['jpeg', 'png', 'gif', 'webp'].includes(ext)
      ? `image/${ext}`
      : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: `이 이미지가 어린이집/유치원/학교 식단표인지 판별하세요.

식단표가 맞다면:
- 모든 메뉴를 빠짐없이 텍스트로 추출하세요
- 형식: 요일별로 줄바꿈, 각 메뉴는 쉼표로 구분
- 예: "월: 잡곡밥, 미역국, 닭고기조림, 시금치나물, 김치"
- 간식도 있으면 포함
- JSON으로 응답: {"is_menu": true, "text": "추출된 식단 전체"}

식단표가 아니라면:
- JSON으로 응답: {"is_menu": false, "reason": "식단표가 아닌 이유 한 줄"}

반드시 JSON만 응답하세요. 다른 텍스트 없이.`,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return NextResponse.json(
        { error: '분석 실패' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: '응답 파싱 실패' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json(
      {
        is_menu: parsed.is_menu,
        text: parsed.text || null,
        reason: parsed.reason || null,
      },
      { headers: CORS_HEADERS }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[ocr] error:', message);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
