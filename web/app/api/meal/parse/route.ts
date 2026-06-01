/**
 * POST /api/meal/parse — 메뉴명 → 식재료 자동 분해
 *
 * 0차: 레시피 사전(menu-dict) 정확 일치
 * 1차: 룰 매핑 (흔한 메뉴, 무료·즉시)
 * 2차: substring 스캔 (메뉴에 식재료명 포함)
 * 3차: Claude Haiku 추정 (마지막 수단, 표준 어휘로 검증)
 * 표준 식재료명·스캔·검증 로직은 lib/menuMap.ts에 일원화.
 *
 * body: { menu: "야채볶음밥" }
 * resp: { ingredients: ["쌀","당근","양파","계란"], processed, source: "dict"|"rule"|"scan"|"llm" }
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { mapMenuLocal, canon, CANON_VOCAB } from '@/lib/menuMap';
import { lookupLearned, saveLearned, normalizeMenuKey } from '@/lib/learnedMenus';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_ORIGINS = [
  'https://www.mealfred.com', 'https://mealfred.com',
  'https://app.mealfred.com', 'https://mealfred-app.vercel.app',
];
function cors(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[2],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(null, { headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const { menu } = await req.json();
    if (!menu || typeof menu !== 'string') {
      return NextResponse.json({ error: '메뉴명이 없습니다' }, { status: 400, headers });
    }
    const m = menu.trim();

    // 0차: 전역 학습 사전(이전 LLM 분해 결과) — 미지 메뉴를 LLM 없이 무료 히트
    const learned = await lookupLearned([m]);
    const hit = learned[normalizeMenuKey(m)];
    if (hit) {
      return NextResponse.json(
        { ingredients: hit.ingredients, processed: hit.processed, source: 'learned' },
        { headers }
      );
    }

    // 1~3차: 결정론적 매핑 (사전 → 룰 → 스캔)
    const local = mapMenuLocal(m);
    if (local) {
      await saveLearned(m, local.ingredients, local.processed, local.source);   // 해소 결과 사전화(다음 입력 가속)
      return NextResponse.json(
        { ingredients: local.ingredients, processed: local.processed, source: local.source },
        { headers }
      );
    }

    // 3차: LLM 추정 (마지막 수단)
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `한국 가정식 메뉴 "${menu}"에 실제로 들어가는 핵심 식재료만 분해하세요.
- 양념(소금·간장·설탕)·물·육수·기름 제외
- ⚠️ 확실히 들어가는 재료만. **확실치 않으면 빈 배열 []**. 메뉴 이름만으로 재료를 추측하지 마세요.
- ⚠️ 과자·한과·스낵·빵·디저트·사탕·젤리·처음 보는 가공식품은 주재료(쌀·밀·견과 등)를 확실히 알 때만 적고, 모르면 빈 배열. **'상투과자' 같은 한과에 고기·계란을 넣는 식의 환각 금지.**
- ⚠️ 고기·계란·생선 등 단백질은 그 메뉴에 확실히 들어갈 때만. 모르면서 임의로 추가 절대 금지(채소·과일도 동일).
- 단순 곡물 메뉴(밥·죽·면)는 곡물만(쌀·국수 등). 채소 끼워넣지 말 것.
- 가공식품(소시지·햄·어묵·라면 등) 포함 시 processed: true
- 식재료명은 표준 단일명으로(예: 닭안심→닭고기, 단호박→호박, 백미→쌀)
- JSON만: {"ingredients": ["재료1"], "processed": false}`,
      }],
    });

    const content = resp.content[0];
    if (content.type !== 'text') {
      return NextResponse.json({ ingredients: [], source: 'llm_fail' }, { headers });
    }
    const match = content.text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ ingredients: [], source: 'llm_fail' }, { headers });
    }
    const parsed = JSON.parse(match[0]);
    // LLM 환각 제거 — 표준 어휘로 정규화 후 어휘에 있는 것만 통과
    const raw: string[] = parsed.ingredients || [];
    const filtered = [...new Set(
      raw.map(canon).filter((nm): nm is string => !!nm && CANON_VOCAB.has(nm))
    )];
    if (filtered.length) await saveLearned(m, filtered, !!parsed.processed, 'llm');   // 다음엔 0차 무료 히트
    return NextResponse.json(
      { ingredients: filtered, processed: !!parsed.processed, source: 'llm' },
      { headers }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[meal/parse] error:', msg);
    return NextResponse.json({ error: msg, ingredients: [] }, { status: 500, headers });
  }
}
