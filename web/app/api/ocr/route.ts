import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { mapMenuLocal } from '@/lib/menuMap';   // 결정론 메뉴→식재료(농진청 표준명) — items에 부착해 평가/표시가 식재료 0종 안 나게

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
    institution_name: { type: 'string' },
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
  required: ['is_menu', 'institution_name', 'reason', 'text', 'items'],
  additionalProperties: false,
};

const DECOMPOSE_PROMPT = `첨부한 **이미지**는 어린이집·유치원·학교 급식 식단표(달력)이고, 아래 [OCR 추출 텍스트]는 그 이미지를 네이버 OCR로 읽은 것입니다. 표의 열은 날짜/요일(월화수목금), 행은 끼니(오전간식·점심·오후간식)입니다.

**역할 분담(매우 중요):**
- **메뉴명 글자**는 [OCR 추출 텍스트]를 신뢰하세요(이미지보다 글자가 정확함).
- **각 메뉴가 어느 날짜(요일 열)에 속하는지는 반드시 이미지의 표 칸 위치로 판단**하세요. OCR 텍스트는 빈 칸이 무너져 날짜가 한 칸씩 밀릴 수 있으니, 날짜만큼은 이미지를 보고 정합니다.
- **이미지가 회전돼 있으면(글자가 옆으로 눕거나 표가 가로로 누웠으면) 먼저 머릿속으로 똑바로 세운 뒤 해석**하세요. 제목/요일 헤더(월화수목금)가 위에 가로로 오는 방향이 정방향입니다.

**날짜 매핑 규칙(이 식단표에서 가장 자주 틀리는 부분):**
A. 각 메뉴를 이미지에서 그 메뉴가 실제로 놓인 **요일 열** 맨 위의 날짜 숫자에 매핑하세요.
B. **급식이 없는 날(공휴일·잔반없는 날·선거일 등 — 메뉴 대신 그림/안내문만 있거나 칸이 비어있는 날)은 그 날짜를 건너뛰세요. 그 빈 칸을 무시하고 오른쪽 칸 메뉴들을 한 칸씩 왼쪽(앞 날짜)으로 당기면 절대 안 됩니다.** 빈 날짜엔 메뉴를 넣지 말고, 오른쪽 칸 메뉴는 오른쪽 날짜에 그대로 두세요.
C. 각 item의 day(요일)가 그 date(날짜)의 표 헤더 요일과 일치하는지 교차 검증하세요. 어긋나면 이미지를 다시 보고 바로잡으세요.

기타 규칙:
1. 실제 메뉴만 items로 만드세요. **OCR이 비슷한 글자로 오인식한 건 가장 그럴듯한 표준 급식 메뉴명으로 적극 교정**하세요 — 예: "양승이떡갈비"→"양송이떡갈비", "제육뽁음"→"제육볶음", "돈까스"→"돈가스", "오뎅"→"어묵". 한두 글자 어색하게 깨진 건 거의 오인식이니 자연스러운 메뉴명으로 고치세요. 단, 도저히 추정 불가하면 버리세요(없는 메뉴 환각 금지).
2. 메뉴명 뒤 알레르겐 숫자코드(①②③⑤⑥⑨⑩⑮ 등, "(5.6.9)" 같은 괄호 숫자 포함)는 무시하고 순수 메뉴명만.
3. 메뉴가 아니면 제외: 칼로리/단백질 숫자("444/13"), 원산지("쇠고기:국내산 한우"), 좌측 "식단 안내" 안내문, 공휴일·행사 표기(개천절·한글날·추석·지방선거·호국보훈 등).
4. "쇠고기"는 "소고기"로 통일하세요.
5. 같은 메뉴를 여러 날에 복제하지 마세요.
6. **메뉴 하나당 item 하나로 만드세요(여러 메뉴를 콤마로 한 item에 합치지 마세요).** "밥&양념장"처럼 원래 한 줄로 묶인 건 그대로 한 item.
7. slot: 그 메뉴가 속한 끼니를 표의 행(또는 위치)으로 판단해 "오전간식"/"점심"/"오후간식" 중 하나로. 보통 점심이 메인이고 간식은 1~2개. 도저히 모르면 "점심".
8. **식단표에 만 1-2세(영아)와 만 3-5세(유아) 메뉴가 따로(두 행/두 칸) 있으면, 만 3-5세(유아) 메뉴만 추출**하세요. 영아용 변형(진밥·죽·다진·잘게 썬 것)은 무시하고 유아 기준 메뉴로 통일. (앱은 만 3-7세 기준 평가라 한 종류만 필요)

**중요: 식재료 분해나 메뉴 평가는 하지 마세요. 시스템이 메뉴명으로 자동 처리합니다. 당신은 메뉴명을 정확히 추출·교정하고 올바른 날짜에 매핑하면 됩니다.** (이렇게 출력을 짧게 유지해야 한 달치 식단표도 안 잘립니다.)

institution_name: 식단표 상단·제목·머리글(보통 좌측 상단 로고/제목 영역)에 적힌 **기관 이름**을 그대로 적으세요 — "○○어린이집"·"○○유치원"·"○○초등학교" 형태. 제목 영역 글자를 이미지로 정확히 보고, [OCR 추출 텍스트]의 기관명과 대조해 한두 글자 오인식은 교정하세요. 식단표 안에 기관명이 전혀 없으면 "".
items 원소: {date(날짜 숫자 1~31, 모르면 ""), day(요일 월화수목금토일, 모르면 ""), slot(오전간식/점심/오후간식), menu(교정한 메뉴명 하나)}.
text: 정리한 전체 식단(날짜/요일별 줄바꿈).
식단표가 아니면 is_menu=false, institution_name(있으면 기관명), reason 한 줄, text="", items=[].`;

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

    // 3) Claude(Sonnet)로 메뉴 추출+날짜 매핑.
    //    CLOVA 텍스트는 글자가 정확하지만 표 인식이 꺼진 도메인에선 빈 칸(공휴일·잔반없는날)이 무너져
    //    날짜가 한 칸씩 밀린다(목/금 메뉴가 수/목으로 당겨짐). 그래서 원본 이미지를 함께 넣어
    //    '메뉴 글자=텍스트, 날짜 매핑=이미지 격자'로 분리 처리 → 빈 칸을 건너뛰고 날짜를 정확히 맞춘다.
    //    날짜 격자 정렬은 비전이 약한 Haiku로는 밀집 표에서 흔들려 Sonnet 사용(월 1회 업로드라 비용 무시 가능).
    const VISION_MEDIA: Record<string, 'image/jpeg' | 'image/png'> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
    const mediaType = VISION_MEDIA[format];   // jpg/png만 비전 첨부, 그 외(pdf/tiff)는 텍스트만
    const content: Anthropic.MessageParam['content'] = [];
    if (mediaType) content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
    content.push({ type: 'text', text: `${DECOMPOSE_PROMPT}\n\n[OCR 추출 텍스트]\n${ocrText}` });
    const decomp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,   // 한 달치 식단표는 초과해 잘릴 수 있어 아래 stop_reason로 안내
      output_config: { format: { type: 'json_schema', schema: MENU_SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    const textBlock = decomp.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: '분해 실패' }, { status: 500, headers: cors });
    }
    // 출력이 토큰 한도로 잘렸으면 JSON 불완전 → 파싱 말고 '한 주씩' 안내(500 방지). 한 달치 식단표가 주원인.
    if (decomp.stop_reason === 'max_tokens') {
      await supabase.from('ocr_logs').insert({ is_menu: false, reject_reason: 'truncated: max_tokens', duration_ms: Date.now() - startMs, model: 'clova-ocr+claude-sonnet-4-6', input_tokens: decomp.usage?.input_tokens || 0, output_tokens: decomp.usage?.output_tokens || 0 });
      return NextResponse.json({ is_menu: false, reason: '식단표가 커서 한 번에 다 읽지 못했어요 — 한 주(또는 2주)씩 잘라서 올려주시면 정확히 읽어드려요.' }, { headers: cors });
    }
    let parsed: { is_menu?: boolean; institution_name?: string; reason?: string; text?: string; items?: unknown[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      const m = textBlock.text.match(/\{[\s\S]*\}/);
      try {
        if (!m) throw new Error('no json');
        parsed = JSON.parse(m[0]);
      } catch {
        // 잘림 외 깨진 JSON도 500 대신 안내
        await supabase.from('ocr_logs').insert({ is_menu: false, reject_reason: 'parse_fail', duration_ms: Date.now() - startMs, model: 'clova-ocr+claude-sonnet-4-6' });
        return NextResponse.json({ is_menu: false, reason: '식단표를 읽었지만 정리에 실패했어요 — 한 주씩 잘라서, 또는 더 선명한 사진으로 다시 시도해주세요.' }, { headers: cors });
      }
    }

    // 한 칸의 여러 메뉴를 콤마로 한 item에 합치는 경우가 있어(모델 성향) 메뉴별 item으로 분리.
    //  care 저장부가 it.menu 하나를 menus[]에 넣고 매퍼에 통째로 던지므로, 합쳐지면 식재료 분해가 깨진다.
    //  한국어 급식 메뉴명엔 콤마가 거의 없어 콤마 분리는 안전. "두부구이&양념장"의 &·· 는 한 메뉴 내 결합이라 유지.
    type OcrItem = { date?: string; day?: string; slot?: string; menu?: string };
    if (Array.isArray(parsed.items)) {
      const split: OcrItem[] = [];
      for (const raw of parsed.items as OcrItem[]) {
        if (!raw || typeof raw.menu !== 'string') continue;
        const parts = raw.menu.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
        for (const menu of (parts.length ? parts : [raw.menu])) {
          split.push({ date: raw.date, day: raw.day, slot: raw.slot, menu });
        }
      }
      parsed.items = split;
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
      model: 'clova-ocr+claude-sonnet-4-6',
      input_tokens: decomp.usage?.input_tokens || 0,
      output_tokens: decomp.usage?.output_tokens || 0,
    }).select('id').single();
    logId = logRow?.id || null;

    return NextResponse.json(
      {
        is_menu: parsed.is_menu,
        institution_name: parsed.institution_name || null,
        image_url: imageUrl,
        text: parsed.text || ocrText,
        items: ((parsed.items || []) as { date?: string; day?: string; slot?: string; menu?: string }[])
          .map((it) => ({ ...it, ingredients: mapMenuLocal(String(it.menu || ''))?.ingredients || [] })),
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
