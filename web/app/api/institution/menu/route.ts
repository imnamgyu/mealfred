/**
 * POST /api/institution/menu — 업로드한 식단표를 기관+월에 귀속 + 영양 점수 채점.
 *
 * 식단표↔기관 매핑(이사님 2026-06-19): daycare-eval 업로드 시 호출.
 *   body: { institution_id, month:'YYYY-MM', items:[{date,slot,menu}], raw_ocr_text?, created_by?, source? }
 *   → institution_menus(1벌 upsert) + institution_menu_items(교체) + institution_scores(점수+DeepSeek 총평)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scoreInstitutionMonth, summarizeInstitutionMenu, buildMenuItemRows, computeStandoutDims, computeSevenAxes, type OcrMenuItem } from '@/lib/institutionScore';
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
  const headers = cors(req);
  try {
    const body = await req.json();
    const institutionId: string = body.institution_id || '';
    const month: string = String(body.month || '').slice(0, 7);
    const items: OcrMenuItem[] = Array.isArray(body.items) ? body.items : [];
    if (!institutionId || !/^\d{4}-\d{2}$/.test(month) || !items.length) {
      return NextResponse.json({ error: 'institution_id·month(YYYY-MM)·items 필요' }, { status: 400, headers });
    }

    const { data: inst } = await supabase.from('institutions')
      .select('id,name,type,sido,sigungu').eq('id', institutionId).maybeSingle();
    if (!inst) return NextResponse.json({ error: '기관을 찾을 수 없습니다' }, { status: 404, headers });

    // ⭐ 중복분석 5회 캡(이사님 2026-06-22): 사람들이 사진을 자기멋대로 올려 잘못된 분석으로 스코어 오염·비용 폭주하는 걸 방지.
    //   (inst,month)당 5회까지만 재채점 저장, 초과 시 저장본 결과만 돌려줌(덮어쓰기 차단).
    const { data: existingMenu } = await supabase.from('institution_menus')
      .select('id, analysis_count').eq('institution_id', institutionId).eq('month', month).maybeSingle();
    if (existingMenu && (existingMenu.analysis_count || 0) >= 5) {
      const { data: capped } = await supabase.from('institution_scores')
        .select('score, day_count, summary').eq('institution_id', institutionId).eq('month', month).maybeSingle();
      return NextResponse.json({ ok: true, capped: true, score: capped?.score ?? null, summary: capped?.summary ?? null, dayCount: capped?.day_count ?? null,
        message: '이 기관·이번 달은 이미 충분히 분석됐어요(최대 5회) — 저장된 결과로 보여드려요.' }, { headers });
    }
    const nextCount = (existingMenu?.analysis_count || 0) + 1;

    // ① 식단 upsert (institution+month = 1벌, 재업로드 시 갱신 · 분석횟수 누적)
    const menuUpsert: Record<string, unknown> = {
      institution_id: institutionId, month,
      source: body.source || 'eval_upload',
      raw_ocr_text: typeof body.raw_ocr_text === 'string' ? body.raw_ocr_text.slice(0, 20000) : null,
      created_by: body.created_by || null,
      analysis_count: nextCount,
      updated_at: new Date().toISOString(),
    };
    // ⭐ 부모 업로드도 원본 이미지 연결(어드민 상세용) — 있을 때만 set(재업로드로 기존 이미지 안 지워지게)
    if (Array.isArray(body.image_urls) && body.image_urls.length) menuUpsert.image_urls = body.image_urls.slice(0, 12);
    const { data: menuRow, error: mErr } = await supabase.from('institution_menus')
      .upsert(menuUpsert, { onConflict: 'institution_id,month' })
      .select('id').single();
    if (mErr || !menuRow) return NextResponse.json({ error: mErr?.message || 'menu upsert 실패' }, { status: 500, headers });

    // ② items 교체(이번 달 1벌)
    await supabase.from('institution_menu_items').delete().eq('institution_menu_id', menuRow.id);
    const rows = buildMenuItemRows(items, month, menuRow.id);
    if (rows.length) await supabase.from('institution_menu_items').insert(rows);

    // ③ 결정론 점수 + DeepSeek 총평 → institution_scores upsert
    const sc = scoreInstitutionMonth(items);
    const dims = computeStandoutDims(items, month);   // ⭐ 강점지표(코호트 비교는 rank에서)
    const axes = computeSevenAxes(items, month);       // ⭐ 7축 점수(어드민 리스트용)
    const summary = await summarizeInstitutionMenu({ institutionName: inst.name });
    const { error: sErr } = await supabase.from('institution_scores').upsert({
      institution_id: institutionId, month, type: inst.type, sido: inst.sido, sigungu: inst.sigungu,
      score: sc.score, diversity_base: sc.diversityBase, gate_cap: sc.gateCap, processed: sc.processed, repeat_pen: sc.repeat,
      red_groups: sc.redGroups, summary, day_count: sc.dayCount, item_count: sc.itemCount, standout_dims: dims, axes, computed_at: new Date().toISOString(),
    }, { onConflict: 'institution_id,month' });
    if (sErr) console.error('[institution/menu] score upsert:', sErr.message);

    return NextResponse.json({ ok: true, score: sc.score, summary, dayCount: sc.dayCount }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[institution/menu] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers });
  }
}
