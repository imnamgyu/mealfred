/**
 * POST /api/institution/menu — 업로드한 식단표를 기관+월에 귀속 + 영양 점수 채점.
 *
 * 식단표↔기관 매핑(이사님 2026-06-19): daycare-eval 업로드 시 호출.
 *   body: { institution_id, month:'YYYY-MM', items:[{date,slot,menu}], raw_ocr_text?, created_by?, source? }
 *   → institution_menus(1벌 upsert) + institution_menu_items(교체) + institution_scores(점수+DeepSeek 총평)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scoreInstitutionMonth, summarizeInstitutionMenu, buildMenuItemRows, computeStandoutDims, computeSevenAxes, sevenAxisScore, type OcrMenuItem } from '@/lib/institutionScore';
import { mapMenuLocal } from '@/lib/menuMap';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALLOWED_ORIGINS = [
  'https://www.mealfred.com', 'https://mealfred.com',
  'https://app.mealfred.com', 'https://mealfred-app.vercel.app',
];
function cors(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
export async function OPTIONS(req: NextRequest) { return NextResponse.json(null, { headers: cors(req) }); }

// ⭐ 멱등 캐시 조회(이사님 2026-06-22): 이미 입력된 기관+월이면 저장 식단을 돌려줘 OCR 없이 즉시 결과.
const SLOT_KO: Record<string, string> = { am_snack: '오전간식', lunch: '점심', pm_snack: '오후간식' };
export async function GET(req: NextRequest) {
  const headers = cors(req);
  try {
    const url = new URL(req.url);
    const institutionId = url.searchParams.get('institution_id') || '';
    const month = (url.searchParams.get('month') || '').slice(0, 7);
    if (!institutionId || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ exists: false, error: 'institution_id·month 필요' }, { status: 400, headers });
    }
    const { data: menu } = await supabase.from('institution_menus').select('id').eq('institution_id', institutionId).eq('month', month).maybeSingle();
    if (!menu) return NextResponse.json({ exists: false }, { headers });
    const { data: rows } = await supabase.from('institution_menu_items').select('menu_date,slot,menus,ingredients').eq('institution_menu_id', menu.id);
    const items: { date: string | null; slot: string; menu: string; ingredients: string[] }[] = [];
    for (const r of (rows || []) as { menu_date: string | null; slot: string; menus: string[] | null; ingredients: string[] | null }[]) {
      // ⭐ 메뉴별 개별 재매핑(이사님 2026-06-22) — 끼니 그룹 식재료 union이 메뉴마다 붙어 보이던 표시버그 수정(예: 오이스틱→요거트). 점수는 무관(하루 합집합 기준).
      for (const m of r.menus || []) items.push({ date: r.menu_date, slot: SLOT_KO[r.slot] || r.slot, menu: m, ingredients: mapMenuLocal(m)?.ingredients || [] });
    }
    return NextResponse.json({ exists: items.length > 0, month, items }, { headers });
  } catch (e: unknown) {
    return NextResponse.json({ exists: false, error: e instanceof Error ? e.message : 'unknown' }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  // 서비스 종료(2026-08-21): 이용자 업로드 식단의 기관 귀속·채점(식단표 평가 서비스 전용) 중단 → 410.
  //   종료 전 구현(기관 귀속 upsert + sevenAxisScore 채점)은 git 이력(2026-08-20 이전) 참조.
  return NextResponse.json(
    { ok: false, discontinued: true, reason: '어린이집·유치원 식단표 평가 서비스는 2026-08-21부로 종료되었습니다.' },
    { status: 410, headers: cors(req) },
  );
}
