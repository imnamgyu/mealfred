/**
 * POST /api/institution/menu — 업로드한 식단표를 기관+월에 귀속 + 영양 점수 채점.
 *
 * 식단표↔기관 매핑(이사님 2026-06-19): daycare-eval 업로드 시 호출.
 *   body: { institution_id, month:'YYYY-MM', items:[{date,slot,menu}], raw_ocr_text?, created_by?, source? }
 *   → institution_menus(1벌 upsert) + institution_menu_items(교체) + institution_scores(점수+DeepSeek 총평)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scoreInstitutionMonth, summarizeInstitutionMenu, buildMenuItemRows, type OcrMenuItem } from '@/lib/institutionScore';

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
export async function OPTIONS(req: NextRequest) { return NextResponse.json(null, { headers: cors(req) }); }

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

    // ① 식단 upsert (institution+month = 1벌, 재업로드 시 갱신)
    const { data: menuRow, error: mErr } = await supabase.from('institution_menus')
      .upsert({
        institution_id: institutionId, month,
        source: body.source || 'eval_upload',
        raw_ocr_text: typeof body.raw_ocr_text === 'string' ? body.raw_ocr_text.slice(0, 20000) : null,
        created_by: body.created_by || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'institution_id,month' })
      .select('id').single();
    if (mErr || !menuRow) return NextResponse.json({ error: mErr?.message || 'menu upsert 실패' }, { status: 500, headers });

    // ② items 교체(이번 달 1벌)
    await supabase.from('institution_menu_items').delete().eq('institution_menu_id', menuRow.id);
    const rows = buildMenuItemRows(items, month, menuRow.id);
    if (rows.length) await supabase.from('institution_menu_items').insert(rows);

    // ③ 결정론 점수 + DeepSeek 총평 → institution_scores upsert
    const sc = scoreInstitutionMonth(items);
    const summary = await summarizeInstitutionMenu({
      institutionName: inst.name, score: sc.score, redGroups: sc.redGroups, processed: sc.processed, repeat: sc.repeat,
    });
    const { error: sErr } = await supabase.from('institution_scores').upsert({
      institution_id: institutionId, month, type: inst.type, sido: inst.sido, sigungu: inst.sigungu,
      score: sc.score, diversity_base: sc.diversityBase, gate_cap: sc.gateCap, processed: sc.processed, repeat_pen: sc.repeat,
      red_groups: sc.redGroups, summary, day_count: sc.dayCount, item_count: sc.itemCount, computed_at: new Date().toISOString(),
    }, { onConflict: 'institution_id,month' });
    if (sErr) console.error('[institution/menu] score upsert:', sErr.message);

    return NextResponse.json({ ok: true, score: sc.score, summary, dayCount: sc.dayCount }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[institution/menu] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers });
  }
}
