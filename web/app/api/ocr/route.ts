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

// Sonnet 비전 + 구조화 출력은 Haiku보다 오래 걸림 — Vercel 타임아웃 상향
export const maxDuration = 60;

// 구조화 출력 스키마 — 메뉴별 구성 식재료 분해를 모델이 반드시 채우게 강제
const MENU_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    is_menu: { type: 'boolean' },
    reason: { type: 'string' },
    text: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'string' },
          menu: { type: 'string' },
          ingredients: { type: 'array', items: { type: 'string' } },
        },
        required: ['day', 'menu', 'ingredients'],
        additionalProperties: false,
      },
    },
  },
  required: ['is_menu', 'reason', 'text', 'items'],
  additionalProperties: false,
};

const OCR_PROMPT = `이 이미지가 어린이집·유치원·학교 급식 식단표인지 판별하세요.

[식단표가 맞으면]
1. 모든 메뉴를 빠짐없이 읽으세요. OCR 오탈자는 한국 급식에서 실제 쓰이는 메뉴명으로 교정하세요 (예: "돈까스"→"돈가스", "제육뽁음"→"제육볶음", "옴라이스"→"오므라이스").
2. 각 메뉴를 만드는 데 들어가는 주요 식재료(원재료)로 분해하세요.
   - "돈가스" → ["돼지고기","밀가루","빵가루","계란","기름","양배추"]
   - "불고기" → ["소고기","양파","대파","마늘","간장"]
   - "미역국" → ["미역","소고기","마늘"]
   - 튀김옷·양념의 핵심 재료(밀가루·빵가루·기름·간장·고추장 등)도 포함하되, 물·소금·설탕 같은 기본 조미료는 생략하세요.
   - 식재료명은 원재료 기본형으로 ("소고기","돼지고기","계란","밀가루" 등).
3. text 필드에는 요일별로 줄바꿈한 전체 식단을 넣으세요 (예: "월: 잡곡밥, 미역국, 닭고기조림, 김치").
4. items에는 메뉴별로 {day(요일, 없으면 ""), menu(교정한 메뉴명), ingredients(분해한 식재료 배열)}을 넣으세요.

[식단표가 아니면]
is_menu=false, reason에 한 줄 사유, text="", items=[].`;

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(null, { headers: getCorsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const cors = getCorsHeaders(req);
  const startMs = Date.now();
  let logId: string | null = null;

  console.log('[ocr] POST 요청 수신', {
    origin: req.headers.get('origin'),
    contentType: req.headers.get('content-type'),
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  try {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    console.log('[ocr] 파일:', file ? { name: file.name, size: file.size, type: file.type } : 'null');

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
    console.log('[ocr] base64 변환 완료, 길이:', base64.length);

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

    console.log('[ocr] Storage 업로드:', uploadErr ? `실패 - ${uploadErr.message}` : '성공');
    if (!uploadErr) {
      const { data: urlData } = supabase.storage
        .from('eval-uploads')
        .getPublicUrl(storagePath);
      imageUrl = urlData?.publicUrl || null;
    } else {
      console.warn('[ocr] storage upload failed:', uploadErr.message);
    }

    console.log('[ocr] Claude Vision 호출 시작...');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: MENU_SCHEMA },
      },
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
              text: OCR_PROMPT,
            },
          ],
        },
      ],
    });

    console.log('[ocr] Claude 응답 수신:', { tokens: response.usage, stopReason: response.stop_reason });
    // thinking 블록이 앞설 수 있으므로 text 블록을 찾는다
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json(
        { error: '분석 실패' },
        { status: 500, headers: cors }
      );
    }

    // 구조화 출력이라 유효 JSON 보장 — 실패 시에만 정규식 폴백
    let parsed: { is_menu?: boolean; reason?: string; text?: string; items?: unknown[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: '응답 파싱 실패' },
          { status: 500, headers: cors }
        );
      }
      parsed = JSON.parse(jsonMatch[0]);
    }
    const durationMs = Date.now() - startMs;
    console.log('[ocr] 결과:', { is_menu: parsed.is_menu, durationMs, textLength: parsed.text?.length || 0 });

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
      model: 'claude-sonnet-4-6',
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0,
    }).select('id').single();

    logId = logRow?.id || null;

    return NextResponse.json(
      {
        is_menu: parsed.is_menu,
        text: parsed.text || null,
        items: parsed.items || [],
        reason: parsed.reason || null,
        log_id: logId,
      },
      { headers: cors }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[ocr] error:', message);

    try {
      await supabase.from('ocr_logs').insert({
        is_menu: false,
        reject_reason: `error: ${message}`,
        duration_ms: Date.now() - startMs,
      });
    } catch (_) {}

    const errCors = getCorsHeaders(req);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500, headers: errCors }
    );
  }
}
