/**
 * POST /api/funnel — 익명 방문자(mf_vid) 1회 기록. 마케팅 펀넬 맨 윗단(방문 → 가입).
 *
 * 홈 진입 시 클라가 fire-and-forget로 호출. 봇/스크래퍼 제외. app_visitors에 고유 upsert.
 * 테이블(app_visitors)이 없으면(마이그레이션 전) 조용히 무시 — 방문 추적은 보조라 메인 흐름 무영향.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  if (/bot|crawler|spider|facebookexternalhit|kakaotalk-scrap|slackbot|twitterbot|whatsapp|headless|lighthouse/.test(ua)) return res;

  const jar = await cookies();
  let vid = jar.get('mf_vid')?.value;
  if (!vid) {
    vid = crypto.randomUUID();
    res.cookies.set('mf_vid', vid, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', path: '/' });
  }
  try {
    const db = createSupabaseAdmin();
    // 고유 방문자 1행 — 재방문은 last_seen만 갱신(first_seen은 INSERT default로 고정)
    const { error } = await db.from('app_visitors').upsert(
      { visitor_id: vid, last_seen: new Date().toISOString() },
      { onConflict: 'visitor_id' }
    );
    if (error) console.warn('[funnel] visit upsert', error.message);   // 테이블 없음 등 — 무시
  } catch (e) {
    console.warn('[funnel] visit skip', e instanceof Error ? e.message : String(e));
  }
  return res;
}
