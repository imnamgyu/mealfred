/**
 * POST /api/meal/parse — 메뉴명 → 식재료 자동 분해
 *
 * 엄마가 "야채볶음밥, 소세지볶음" 입력하면 식재료로 분해.
 * 1차: 룰 매핑 (흔한 메뉴, 무료·즉시)
 * 2차: 룰에 없으면 Claude Haiku로 추정 (~₩3/건)
 *
 * body: { menu: "야채볶음밥" }
 * resp: { ingredients: ["쌀","당근","양파","계란"], processed: false, source: "rule"|"llm" }
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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

// 흔한 메뉴 → 식재료 룰 매핑 (무료·즉시)
const MENU_MAP: Record<string, { ing: string[]; processed?: boolean }> = {
  '야채볶음밥': { ing: ['쌀','당근','양파','계란','대파'] },
  '볶음밥': { ing: ['쌀','계란','양파','당근','대파'] },
  '김치볶음밥': { ing: ['쌀','김치','계란','대파'] },
  '소세지볶음': { ing: ['소시지','양파','피망'], processed: true },
  '소시지볶음': { ing: ['소시지','양파','피망'], processed: true },
  '불고기': { ing: ['소고기','양파','대파','마늘'] },
  '제육볶음': { ing: ['돼지고기','양파','대파','마늘','고추'] },
  '된장찌개': { ing: ['된장','두부','양파','대파','호박'] },
  '김치찌개': { ing: ['김치','돼지고기','두부','대파'], processed: false },
  '미역국': { ing: ['미역','소고기','마늘'] },
  '소고기무국': { ing: ['소고기','무','대파','마늘'] },
  '계란찜': { ing: ['계란','대파'] },
  '계란말이': { ing: ['계란','당근','대파'] },
  '닭볶음탕': { ing: ['닭고기','감자','당근','양파','대파'] },
  '카레라이스': { ing: ['감자','당근','양파','돼지고기','쌀'] },
  '카레': { ing: ['감자','당근','양파'] },
  '짜장밥': { ing: ['돼지고기','양파','감자','호박','쌀'] },
  '잡채': { ing: ['당면','당근','양파','시금치','소고기'] },
  '비빔밥': { ing: ['쌀','당근','시금치','콩나물','계란','소고기'] },
  '두부조림': { ing: ['두부','양파','대파','마늘'] },
  '시금치나물': { ing: ['시금치','마늘'] },
  '콩나물무침': { ing: ['콩나물','마늘'] },
  '돈가스': { ing: ['돼지고기','계란','양배추'], processed: true },
  '스파게티': { ing: ['토마토','양파','마늘'], processed: false },
  '오므라이스': { ing: ['계란','양파','당근','쌀'] },
  '만두국': { ing: ['만두','대파','계란'], processed: true },
  '떡국': { ing: ['소고기','대파','계란'] },
  '김밥': { ing: ['쌀','당근','시금치','계란','오이'] },
  '주먹밥': { ing: ['쌀','계란','당근'] },
  // 흔한 반찬·국·단품 (LLM 안 거치게)
  '김': { ing: ['김'] }, '김자반': { ing: ['김'] }, '조미김': { ing: ['김'] },
  '멸치볶음': { ing: ['멸치'] }, '잔멸치볶음': { ing: ['멸치'] },
  '어묵볶음': { ing: ['어묵','양파'], processed: true }, '어묵국': { ing: ['어묵','무','대파'], processed: true },
  '콩나물국': { ing: ['콩나물','대파','마늘'] }, '북엇국': { ing: ['명태','계란','대파'] },
  '두부부침': { ing: ['두부'] }, '두부구이': { ing: ['두부'] },
  '갈치조림': { ing: ['갈치','무','양파'] }, '고등어조림': { ing: ['고등어','무','양파'] },
  '무생채': { ing: ['무'] }, '오이무침': { ing: ['오이'] }, '깍두기': { ing: ['무'] },
  '배추김치': { ing: ['김치'] }, '나물': { ing: ['시금치'] }, '근대나물': { ing: ['근대'] },
  '브로콜리무침': { ing: ['브로콜리'] }, '단호박찜': { ing: ['호박'] }, '단호박': { ing: ['호박'] },
  '옥수수': { ing: ['옥수수'] }, '감자조림': { ing: ['감자','양파'] }, '감자볶음': { ing: ['감자','양파'] },
  '시금치된장국': { ing: ['시금치','된장'] }, '시금치국': { ing: ['시금치'] },
  '생선구이': { ing: ['갈치'] }, '고등어구이': { ing: ['고등어'] }, '연어': { ing: ['연어'] }, '연어스테이크': { ing: ['연어'] },
  '구운계란': { ing: ['계란'] }, '삶은계란': { ing: ['계란'] }, '계란후라이': { ing: ['계란'] },
  '요거트': { ing: ['요거트'] }, '요구르트': { ing: ['요거트'] }, '치즈': { ing: ['치즈'] }, '우유': { ing: ['우유'] },
  '사과': { ing: ['사과'] }, '바나나': { ing: ['바나나'] }, '딸기': { ing: ['딸기'] }, '귤': { ing: ['귤'] },
  '블루베리': { ing: ['블루베리'] }, '키위': { ing: ['키위'] }, '토마토': { ing: ['토마토'] }, '방울토마토': { ing: ['토마토'] },
  '흰밥': { ing: ['쌀'] }, '쌀밥': { ing: ['쌀'] }, '잡곡밥': { ing: ['잡곡','쌀'] }, '현미밥': { ing: ['현미'] },
  '밥': { ing: ['쌀'] }, '진밥': { ing: ['쌀'] }, '죽': { ing: ['쌀'] }, '미음': { ing: ['쌀'] }, '누룽지': { ing: ['쌀'] },
  '식빵': { ing: ['빵'] }, '토스트': { ing: ['빵'] }, '국수': { ing: ['국수'] }, '라면': { ing: ['라면'], processed: true },
  '짜파게티': { ing: ['국수','짜장'], processed: true }, '짜장면': { ing: ['국수','양파','감자','돼지고기'] },
};

// 부분일치용 키 — 2글자 이상, 길이 내림차순 (긴 키 우선 = 더 구체적)
const PARTIAL_KEYS = Object.keys(MENU_MAP).filter((k) => k.length >= 2).sort((a, b) => b.length - a.length);
function ruleParse(menu: string): { ing: string[]; processed: boolean } | null {
  const m = menu.replace(/\s/g, '');
  // 1) 정확 일치 우선 (밥·김 같은 단품 안전)
  if (MENU_MAP[m]) return { ing: MENU_MAP[m].ing, processed: !!MENU_MAP[m].processed };
  // 2) 부분 일치 — 2글자 이상 키만, 긴 것부터 (1글자 키 오작동 방지)
  for (const key of PARTIAL_KEYS) {
    if (m.includes(key)) return { ing: MENU_MAP[key].ing, processed: !!MENU_MAP[key].processed };
  }
  return null;
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

    // 1차: 룰 매핑
    const ruled = ruleParse(menu.trim());
    if (ruled) {
      return NextResponse.json(
        { ingredients: ruled.ing, processed: ruled.processed, source: 'rule' },
        { headers }
      );
    }

    // 2차: LLM 추정
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `한국 가정식 메뉴 "${menu}"에 실제로 들어가는 핵심 식재료만 분해하세요.
- 양념(소금·간장·설탕)·물·육수·기름 제외
- 그 메뉴에 확실히 들어가는 재료만. 확실치 않으면 적게. 임의로 채소·과일 추가 절대 금지.
- 단순 곡물 메뉴(밥·죽·면)는 곡물만(쌀·국수 등). 채소 끼워넣지 말 것.
- 가공식품(소시지·햄·어묵·라면 등) 포함 시 processed: true
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
    return NextResponse.json(
      { ingredients: parsed.ingredients || [], processed: !!parsed.processed, source: 'llm' },
      { headers }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[meal/parse] error:', msg);
    return NextResponse.json({ error: msg, ingredients: [] }, { status: 500, headers });
  }
}
