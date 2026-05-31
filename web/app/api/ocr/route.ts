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

// CLOVA 전사 + Claude 분해 — 월간 식단표는 30~44초 걸려 60초가 빠듯 → 한도 상향(플랜 최대치로 캡됨).
export const maxDuration = 300;

// 구조화 출력 스키마 — 메뉴명만 추출(식재료 분해 제거로 한 달치도 출력이 짧아 안 잘림).
// 식재료는 care가 클라 전역 매퍼(흔한 메뉴 즉시)로 채우고, 미매핑은 야간 백필 크론이 LLM으로 보강.
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
        },
        required: ['date', 'day', 'slot', 'menu'],
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
5. 같은 메뉴를 여러 날에 복제하지 마세요.
6. slot: 그 메뉴가 속한 끼니를 표의 행(또는 위치)으로 판단해 "오전간식"/"점심"/"오후간식" 중 하나로. 보통 점심이 메인이고 간식은 1~2개. 도저히 모르면 "점심".

**중요: 식재료 분해나 메뉴 평가는 하지 마세요. 시스템이 메뉴명으로 자동 처리합니다. 당신은 메뉴명만 정확히 추출·교정하면 됩니다.** (이렇게 출력을 짧게 유지해야 한 달치 식단표도 안 잘립니다.)

items 원소: {date(날짜 숫자 1~31, 모르면 ""), day(요일 월화수목금토일, 모르면 ""), slot(오전간식/점심/오후간식), menu(교정한 메뉴명)}.
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
      max_tokens: 8192,   // Haiku 출력 한도. 한 달치 식단표는 초과해 잘릴 수 있어 아래 stop_reason로 안내
      output_config: { format: { type: 'json_schema', schema: MENU_SCHEMA } },
      messages: [
        { role: 'user', content: [{ type: 'text', text: `${DECOMPOSE_PROMPT}\n\n[OCR 추출 텍스트]\n${ocrText}` }] },
      ],
    });
    const textBlock = decomp.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: '분해 실패' }, { status: 500, headers: cors });
    }
    // 출력이 토큰 한도로 잘렸으면 JSON 불완전 → 파싱 말고 '한 주씩' 안내(500 방지). 한 달치 식단표가 주원인.
    if (decomp.stop_reason === 'max_tokens') {
      await supabase.from('ocr_logs').insert({ is_menu: false, reject_reason: 'truncated: max_tokens', duration_ms: Date.now() - startMs, model: 'clova-ocr+claude-haiku-4-5', input_tokens: decomp.usage?.input_tokens || 0, output_tokens: decomp.usage?.output_tokens || 0 });
      return NextResponse.json({ is_menu: false, reason: '식단표가 커서 한 번에 다 읽지 못했어요 — 한 주(또는 2주)씩 잘라서 올려주시면 정확히 읽어드려요.' }, { headers: cors });
    }
    let parsed: { is_menu?: boolean; reason?: string; text?: string; items?: unknown[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      const m = textBlock.text.match(/\{[\s\S]*\}/);
      try {
        if (!m) throw new Error('no json');
        parsed = JSON.parse(m[0]);
      } catch {
        // 잘림 외 깨진 JSON도 500 대신 안내
        await supabase.from('ocr_logs').insert({ is_menu: false, reject_reason: 'parse_fail', duration_ms: Date.now() - startMs, model: 'clova-ocr+claude-haiku-4-5' });
        return NextResponse.json({ is_menu: false, reason: '식단표를 읽었지만 정리에 실패했어요 — 한 주씩 잘라서, 또는 더 선명한 사진으로 다시 시도해주세요.' }, { headers: cors });
      }
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
