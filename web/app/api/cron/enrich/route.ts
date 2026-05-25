/**
 * M3 매일 +50종 enrich cron
 *
 * 스케줄: web/vercel.json crons "0 19 * * *" (UTC 19시 = KST 04시)
 * 인증: Vercel Cron은 자동으로 헤더 첨부 (또는 CRON_SECRET 검증)
 *
 * 흐름:
 *   1) enrich_queue에서 status='pending' 50개 picked
 *   2) Claude Haiku로 카테고리·식품군·SOS 메타 생성
 *   3) ingredients 테이블에 upsert
 *   4) cron_runs 로그
 *
 * 비용: ~₩4 × 50 = ₩200/일 = 월 ₩6,000
 */
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Hobby plan 한도

async function classifyWithHaiku(name: string, anthropicKey: string): Promise<{
  category: string; food_group: string; emoji: string;
  estimated_nutri?: Record<string, number>; reason?: string;
}> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `너는 한국 영유아 식재료 분류 어시스턴트야. 식재료명을 받아 JSON으로 변환한다.

스키마:
{
  "category": "곡류"|"면류"|"뿌리채소"|"잎채소"|"열매채소"|"기타채소"|"십자화과"|"버섯"|"해조류"|"콩제품"|"고기"|"생선"|"해산물"|"계란"|"유제품"|"과일"|"견과"|"향신_허브",
  "food_group": "grain"|"legume"|"dairy"|"meat"|"egg"|"vitaminA"|"other"|"fruit",
  "emoji": "🥕" or "" (정확한 매핑 없으면 빈 문자열),
  "reason": "왜 이 카테고리인지 한 줄"
}

규칙:
- 정확한 이모지 없으면 빈 문자열 (절대 비슷한 거 추측 X)
- 가공식품·발효식품(김치·치즈 등)도 적절한 category 부여
- 추정·창작 금지. 모호하면 'other' food_group`,
      messages: [{ role: 'user', content: `식재료명: ${name}` }],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON 파싱 실패');
  return JSON.parse(match[0]);
}

export async function GET(req: Request) {
  // Vercel Cron 검증 (CRON_SECRET 환경변수 권장)
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });
  }

  const supabase = await createSupabaseServer();
  const runStart = Date.now();
  let processed = 0, errors = 0;

  // cron_runs log start
  const { data: runRow } = await supabase.from('cron_runs').insert({
    job_name: 'enrich',
    status: 'running',
  }).select('id').single();

  try {
    // 50개 picked
    const { data: queue, error: qErr } = await supabase
      .from('enrich_queue')
      .select('*')
      .eq('status', 'pending')
      .order('scheduled_for', { ascending: true })
      .limit(50);
    if (qErr) throw qErr;

    for (const q of queue || []) {
      try {
        await supabase.from('enrich_queue').update({ status: 'processing' }).eq('id', q.id);
        const enriched = await classifyWithHaiku(q.name, process.env.ANTHROPIC_API_KEY!);
        const { data: ing } = await supabase.from('ingredients').upsert({
          slug: q.name, name: q.name,
          category: enriched.category,
          food_group: enriched.food_group,
          emoji: enriched.emoji || '',
          v4_reason: enriched.reason || null,
          source: 'enrich · Haiku',
          status: 'ai_enriched',
          enriched_at: new Date().toISOString(),
        }, { onConflict: 'slug' }).select('id').single();
        await supabase.from('enrich_queue').update({
          status: 'done', processed_at: new Date().toISOString(),
          enriched_ingredient_id: ing?.id,
        }).eq('id', q.id);
        processed++;
      } catch (e: any) {
        await supabase.from('enrich_queue').update({
          status: 'failed', attempt_count: (q.attempt_count || 0) + 1,
          last_error: String(e).slice(0, 500),
        }).eq('id', q.id);
        errors++;
      }
    }

    await supabase.from('cron_runs').update({
      status: 'success', finished_at: new Date().toISOString(),
      processed_count: processed, error_count: errors,
      cost_krw: processed * 4,
    }).eq('id', runRow?.id);

    return NextResponse.json({ ok: true, processed, errors, duration_ms: Date.now() - runStart });
  } catch (e: any) {
    await supabase.from('cron_runs').update({
      status: 'failure', finished_at: new Date().toISOString(),
      meta: { error: String(e).slice(0, 1000) },
    }).eq('id', runRow?.id);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
