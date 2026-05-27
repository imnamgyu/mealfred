import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getCorsHeaders(req?: NextRequest) {
  const origin = req?.headers.get('origin') || '';
  const allowed = ['https://www.mealfred.com', 'https://mealfred.com', 'https://app.mealfred.com', 'https://mealfred-app.vercel.app'];
  const matchedOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': matchedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
const CORS_HEADERS = getCorsHeaders();

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(null, { headers: getCorsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const cors = getCorsHeaders(req);
  const startMs = Date.now();
  let logId: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) {
      return NextResponse.json(
        { error: '이미지가 없습니다' },
        { status: 400, headers: cors }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: '파일 크기가 10MB를 초과합니다' },
        { status: 400, headers: cors }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');

    const ext = file.type.split('/')[1] || 'jpeg';
    const mediaType = (['jpeg', 'png', 'gif', 'webp'].includes(ext)
      ? `image/${ext}`
      : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    // Supabase Storage에 사진 저장
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `eval-photos/${ts}_${file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_')}`;
    let imageUrl: string | null = null;

    const { error: uploadErr } = await supabase.storage
      .from('eval-uploads')
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (!uploadErr) {
      const { data: urlData } = supabase.storage
        .from('eval-uploads')
        .getPublicUrl(storagePath);
      imageUrl = urlData?.publicUrl || null;
    } else {
      console.warn('[ocr] storage upload failed:', uploadErr.message);
    }

    // OCR 호출
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
        { status: 500, headers: cors }
      );
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: '응답 파싱 실패' },
        { status: 500, headers: cors }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const durationMs = Date.now() - startMs;

    // DB 로그 저장
    const { data: logRow } = await supabase.from('ocr_logs').insert({
      image_url: imageUrl,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      is_menu: parsed.is_menu,
      ocr_text: parsed.text || null,
      reject_reason: parsed.reason || null,
      duration_ms: durationMs,
      model: 'claude-haiku-4-5-20251001',
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0,
    }).select('id').single();

    logId = logRow?.id || null;

    return NextResponse.json(
      {
        is_menu: parsed.is_menu,
        text: parsed.text || null,
        reason: parsed.reason || null,
        log_id: logId,
      },
      { headers: cors }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[ocr] error:', message);

    await supabase.from('ocr_logs').insert({
      is_menu: false,
      reject_reason: `error: ${message}`,
      duration_ms: Date.now() - startMs,
    }).catch(() => {});

    const errCors = getCorsHeaders(req);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500, headers: errCors }
    );
  }
}
