import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CLOVA_OCR_URL = process.env.CLOVA_OCR_URL || '';
const CLOVA_OCR_SECRET = process.env.CLOVA_OCR_SECRET || '';

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

// CLOVA 전사 + Claude 분해 — 시간 여유
export const maxDuration = 60;

// 구조화 출력 스키마 — 메뉴별 식재료 분해를 모델이 반드시 채우게 강제
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
          date: { type: 'string' },
          day: { type: 'string' },
          slot: { type: 'string' },
          menu: { type: 'string' },
          ingredients: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
        },
        required: ['date', 'day', 'slot', 'menu', 'ingredients', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['is_menu', 'reason', 'text', 'items'],
  additionalProperties: false,
};

const DECOMPOSE_PROMPT = `다음은 어린이집·유치원·학교 급식 식단표를 OCR로 읽은 텍스트입니다. 표를 행×열로 옮긴 것이라 탭/줄바꿈으로 칸이 구분될 수 있고, 보통 열은 날짜/요일, 행은 끼니(오전간식·점심·오후간식)입니다.

규칙:
1. 실제 메뉴만 items로 만드세요. **OCR이 비슷한 글자로 오인식한 건 가장 그럴듯한 표준 급식 메뉴명으로 적극 교정**하세요 — 예: "양승이떡갈비"→"양송이떡갈비", "제육뽁음"→"제육볶음", "돈까스"→"돈가스", "오뎅"→"어묵", "계란말이"→그대로. 한두 글자 어색하게 깨진 건 거의 오인식이니 자연스러운 메뉴명으로 고치세요. 단, 도저히 추정 불가하면 버리세요(없는 메뉴 환각 금지).
2. 메뉴명 뒤 알레르겐 숫자코드(①②③⑤⑥⑨⑩⑮ 등)는 무시하고 순수 메뉴명만.
3. 메뉴가 아니면 제외: 칼로리/단백질 숫자("444/13"), 원산지("쇠고기:국내산 한우"), 좌측 "식단 안내" 안내문, 공휴일 표기(개천절·한글날·추석 등).
4. "쇠고기"는 "소고기"로 통일하세요.
5. 각 메뉴를 주요 식재료(원재료)로 분해: "돈가스"→["돼지고기","밀가루","빵가루","계란","기름","양배추"], "불고기"→["소고기","양파","대파","마늘","간장"]. 튀김옷·양념 핵심재료는 포함, 물·소금·설탕은 생략. 식재료명은 기본형.
6. 같은 메뉴를 여러 날에 복제하지 마세요.
7. note: 그 메뉴가 아이에게 주는 핵심 포인트를 **메뉴마다 다르게** 짧게(공백 포함 6~16자). 좋은 점은 영양·효익으로(예: "철분·엽산, 빈혈예방", "칼슘·단백질"). 소시지·햄·너겟·과자·사탕·탄산·주스·아이스크림·라면 등 **진짜 초가공**이면 "초가공·당류 주의". 어묵·맛살·만두·피자처럼 일반 가공이면 "가공식품"(주의 아님). **카레·돈가스·볶음·구이·튀김 등 집에서도 만드는 요리는 가공/초가공으로 보지 말고** 영양 위주로. 흰밥·물·차는 "탄수, 에너지"처럼 간단히.

8. slot: 그 메뉴가 속한 끼니를 표의 행(또는 위치)으로 판단해 "오전간식"/"점심"/"오후간식" 중 하나로. 보통 점심이 메인이고 간식은 1~2개. 도저히 모르면 "점심".

items 원소: {date(날짜 숫자 1~31, 모르면 ""), day(요일 월화수목금토일, 모르면 ""), slot(오전간식/점심/오후간식), menu(교정한 메뉴명), ingredients(분해 배열), note(위 7번 한 줄 평가)}.
text: 정리한 전체 식단(날짜/요일별 줄바꿈).
식단표가 아니면 is_menu=false, reason 한 줄, text="", items=[].`;

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(null, { headers: getCorsHeaders(req) });
}

// ── CLOVA General OCR ──
interface ClovaWord { inferText?: string }
interface ClovaCellLine { cellWords?: ClovaWord[] }
interface ClovaCell { rowIndex?: number; columnIndex?: number; cellTextLines?: ClovaCellLine[] }
interface ClovaTable { cells?: ClovaCell[] }
interface ClovaField { inferText?: string; lineBreak?: boolean }
interface ClovaImage { inferResult?: string; tables?: ClovaTable[]; fields?: ClovaField[] }
interface ClovaResp { images?: ClovaImage[] }

async function clovaOcr(base64: string, format: string, tableDetection: boolean): Promise<ClovaResp> {
  const body: Record<string, unknown> = {
    version: 'V2',
    requestId: randomUUID(),
    timestamp: Date.now(),
    lang: 'ko',
    images: [{ format, name: 'menu', data: base64 }],
  };
  if (tableDetection) body.enableTableDetection = true;
  const resp = await fetch(CLOVA_OCR_URL, {
    method: 'POST',
    headers: { 'X-OCR-SECRET': CLOVA_OCR_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`CLOVA ${resp.status} ${t.slice(0, 200)}`);
  }
  return resp.json() as Promise<ClovaResp>;
}

// CLOVA 결과 → 텍스트 (표 셀 우선, 없으면 필드 줄바꿈)
function reconstructText(clova: ClovaResp): string {
  const image = clova?.images?.[0];
  if (!image) return '';
  let out = '';
  for (const tbl of image.tables || []) {
    const rows: Record<number, { col: number; txt: string }[]> = {};
    for (const c of tbl.cells || []) {
      const r = typeof c.rowIndex === 'number' ? c.rowIndex : 0;
      const col = typeof c.columnIndex === 'number' ? c.columnIndex : 0;
      const txt = (c.cellTextLines || [])
        .map((ln) => (ln.cellWords || []).map((w) => w.inferText || '').join(' '))
        .join(' ').trim();
      (rows[r] = rows[r] || []).push({ col, txt });
    }
    for (const r of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
      out += rows[r].sort((a, b) => a.col - b.col).map((x) => x.txt).join('\t') + '\n';
    }
  }
  if (!out.trim()) {
    for (const f of image.fields || []) out += (f.inferText || '') + (f.lineBreak ? '\n' : ' ');
  }
  return out.trim();
}

export async function POST(req: NextRequest) {
  const cors = getCorsHeaders(req);
  const startMs = Date.now();
  let logId: string | null = null;

  if (!CLOVA_OCR_URL || !CLOVA_OCR_SECRET) {
    console.error('[ocr] CLOVA env 누락');
    return NextResponse.json({ error: 'OCR 설정 누락 (CLOVA_OCR_URL/SECRET)' }, { status: 500, headers: cors });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) {
      return NextResponse.json({ error: '이미지가 없습니다' }, { status: 400, headers: cors });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기가 10MB를 초과합니다' }, { status: 400, headers: cors });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const ext = (file.type.split('/')[1] || 'jpeg').toLowerCase();
    const format = ext === 'jpeg' ? 'jpg' : (['jpg', 'png', 'tiff', 'pdf'].includes(ext) ? ext : 'jpg');

    // 1) 원본 사진 Storage 저장
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `eval-photos/${ts}_${file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_')}`;
    let imageUrl: string | null = null;
    const { error: uploadErr } = await supabase.storage
      .from('eval-uploads')
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('eval-uploads').getPublicUrl(storagePath);
      imageUrl = urlData?.publicUrl || null;
    }

    // 2) CLOVA OCR 전사
    let ocrText = '';
    try {
      let clova: ClovaResp;
      try {
        clova = await clovaOcr(base64, format, true);     // 표 셀 인식 우선
      } catch (e1) {
        const m1 = e1 instanceof Error ? e1.message : '';
        if (m1.includes('Table detection disabled') || m1.includes('0028')) {
          console.warn('[ocr] 표 추출 비활성 도메인 → 일반 OCR 폴백');
          clova = await clovaOcr(base64, format, false);  // 일반 OCR 폴백
        } else { throw e1; }
      }
      ocrText = reconstructText(clova);
      console.log('[ocr] CLOVA 전사 길이:', ocrText.length);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'CLOVA 오류';
      console.error('[ocr] CLOVA error:', msg);
      return NextResponse.json({ error: '글자 인식 실패: ' + msg }, { status: 502, headers: cors });
    }
    if (!ocrText) {
      return NextResponse.json({ is_menu: false, reason: '사진에서 글자를 읽지 못했어요. 더 선명한 사진으로 시도해주세요.' }, { headers: cors });
    }

    // 3) Claude(Haiku)로 메뉴→식재료 분해 (텍스트 입력, 저렴)
    const decomp = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8000,
      output_config: { format: { type: 'json_schema', schema: MENU_SCHEMA } },
      messages: [
        { role: 'user', content: [{ type: 'text', text: `${DECOMPOSE_PROMPT}\n\n[OCR 추출 텍스트]\n${ocrText}` }] },
      ],
    });
    const textBlock = decomp.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: '분해 실패' }, { status: 500, headers: cors });
    }
    let parsed: { is_menu?: boolean; reason?: string; text?: string; items?: unknown[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      const m = textBlock.text.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ error: '응답 파싱 실패' }, { status: 500, headers: cors });
      parsed = JSON.parse(m[0]);
    }

    const durationMs = Date.now() - startMs;
    const { data: logRow } = await supabase.from('ocr_logs').insert({
      image_url: imageUrl,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      is_menu: parsed.is_menu,
      ocr_text: parsed.text || ocrText,
      reject_reason: parsed.reason || null,
      duration_ms: durationMs,
      model: 'clova-ocr+claude-haiku-4-5',
      input_tokens: decomp.usage?.input_tokens || 0,
      output_tokens: decomp.usage?.output_tokens || 0,
    }).select('id').single();
    logId = logRow?.id || null;

    return NextResponse.json(
      {
        is_menu: parsed.is_menu,
        text: parsed.text || ocrText,
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
      await supabase.from('ocr_logs').insert({ is_menu: false, reject_reason: `error: ${message}`, duration_ms: Date.now() - startMs });
    } catch (_) {}
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500, headers: getCorsHeaders(req) });
  }
}
