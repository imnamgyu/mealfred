/**
 * GET /api/cron/community-drip — '밀프레드 코치' 큐레이션 노하우 자동 게시(콜드스타트·신선도).
 * 매일 N개(기본 3)를 아직 안 올린 콘텐츠 풀(lib/community-content.json)에서 골라 공식 글로 insert.
 * 멱등: official_key(콘텐츠 id) unique → 이미 올린 건 자동 스킵. 가짜 엄마 아님(is_official·author '밀프레드 코치'·코치 PICK 배지).
 * 공식 글은 보상(주간 톱10/월간) 제외 — 사람 글만 보상.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import CONTENT from '@/lib/community-content.json';

type Item = { id: string; ingredient: string; body: string; method_type: string; traits: string[]; time_min: number; difficulty: string };
const POOL = (CONTENT as { pool: Item[] }).pool || [];

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const qp = new URL(req.url).searchParams;
  const n = Math.min(20, Math.max(1, parseInt(qp.get('n') || '3', 10)));   // ?n= 초기 백필용

  if (!POOL.length) return NextResponse.json({ ok: true, posted: 0, note: '콘텐츠 풀 비어있음' });

  const admin = createSupabaseAdmin();
  // 이미 올린 official_key 조회 → 안 올린 것만 후보
  const { data: existing, error } = await admin.from('community_posts').select('official_key').eq('is_official', true);
  if (error) return NextResponse.json({ ok: false, error: error.message });
  const done = new Set((existing || []).map((r) => r.official_key));
  const todo = POOL.filter((p) => !done.has(p.id));
  if (!todo.length) return NextResponse.json({ ok: true, posted: 0, note: '모두 게시됨' });

  // 결정론적 회전(날짜 기반) — 매일 다른 N개. 풀 순서대로 앞에서 N개.
  const batch = todo.slice(0, n);
  let posted = 0;
  for (const it of batch) {
    const { error: e } = await admin.from('community_posts').insert({
      parent_id: null, child_id: null, author_nick: '밀프레드 코치', is_official: true, official_key: it.id,
      ingredients: [it.ingredient], body: it.body, method_type: it.method_type, traits: it.traits || [],
      difficulty: it.difficulty || null, time_min: it.time_min || null, status: 'public',
    });
    if (!e) posted++;
  }
  return NextResponse.json({ ok: true, posted, remaining: todo.length - posted, poolSize: POOL.length });
}
