/**
 * /api/cron/tip-ranking — 팁(블로그) 개인 맞춤 랭킹 새벽 계산 (Phase 2).
 *
 * 코칭 크론(02:00 KST) 직후 실행 → coach_letters.context(부족 식품군·영양소·시나리오·거부)와
 * children(만성질환·연령), blog_reads(읽은 글)를 모아 부모별로 글을 점수화·정렬해 user_tip_ranking에 저장.
 * /api/blog/feed가 이걸 읽어 팁 최상단을 '그 사람에게 맞는 글'로(최신순 아님).
 * 인증: Vercel Cron 헤더 또는 CRON_SECRET(coach와 동일 패턴).
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { rankTips, type TipSignals, type RankablePost } from '@/lib/tipRank';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const db = createSupabaseAdmin();

    // 1) 발행 글
    const { data: postRows } = await db.from('blog_posts')
      .select('slug,series_no,title,excerpt,category,topics')
      .eq('status', 'public');
    const posts = (postRows || []) as RankablePost[];
    if (!posts.length) return NextResponse.json({ ok: true, posts: 0, users: 0 });

    // 2) 자녀(부모 매핑·만성·연령)
    const { data: kids } = await db.from('children').select('id,parent_id,age_band,chronic_conditions');
    const children = kids || [];
    const childToParent: Record<string, string> = {};
    children.forEach((c) => { if (c.parent_id) childToParent[c.id] = c.parent_id; });

    // 3) 자녀별 최신 코칭 컨텍스트(부족 식품군·영양소·시나리오·거부)
    const { data: letters } = await db.from('coach_letters')
      .select('child_id,letter_date,context')
      .order('letter_date', { ascending: false });
    const latestCtx: Record<string, Record<string, unknown>> = {};
    (letters || []).forEach((l) => { if (!latestCtx[l.child_id] && l.context) latestCtx[l.child_id] = l.context as Record<string, unknown>; });

    // 4) 읽은 글(부모별)
    const { data: reads } = await db.from('blog_reads').select('parent_id,slug');
    const readByParent: Record<string, Set<string>> = {};
    (reads || []).forEach((r) => { (readByParent[r.parent_id] ||= new Set()).add(r.slug); });

    // 5) 부모별 신호 집계(자녀 union)
    type Agg = { missing: Set<string>; reds: Set<string>; chronic: string[]; refused: boolean; scenario: string | null; eaten: number; age: string | null };
    const byParent: Record<string, Agg> = {};
    const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
    for (const c of children) {
      const pid = c.parent_id; if (!pid) continue;
      const a = (byParent[pid] ||= { missing: new Set(), reds: new Set(), chronic: [], refused: false, scenario: null, eaten: 0, age: null });
      if (c.chronic_conditions) a.chronic.push(String(c.chronic_conditions));
      if (c.age_band && !a.age) a.age = c.age_band;
      const ctx = latestCtx[c.id];
      if (ctx) {
        [...arr(ctx.homeMissing), ...arr(ctx.missing)].forEach((g) => a.missing.add(g));
        [...arr(ctx.homeReds), ...arr(ctx.reds)].forEach((n) => a.reds.add(n));
        if (arr(ctx.homeRefused).length || arr(ctx.daycareRefused).length) a.refused = true;
        if (!a.scenario && typeof ctx.scenarioId === 'string') a.scenario = ctx.scenarioId;
        const ec = typeof ctx.eatenCount === 'number' ? ctx.eatenCount : 0;
        if (ec > 0) a.eaten = a.eaten ? Math.min(a.eaten, ec) : ec;   // 가장 편식 심한 자녀 기준
      }
    }

    const daySeed = Math.floor(Date.now() / 86_400_000);
    const ups: { parent_id: string; slug_order: string[]; reasons: Record<string, string>; computed_at: string }[] = [];
    for (const [pid, a] of Object.entries(byParent)) {
      const signals: TipSignals = {
        missingGroups: [...a.missing], reds: [...a.reds], chronicText: a.chronic.join(' '),
        hasRefused: a.refused, scenarioId: a.scenario, eatenCount: a.eaten, ageBand: a.age,
      };
      const ranked = rankTips(posts, signals, { daySeed, readSlugs: readByParent[pid] });
      const reasons: Record<string, string> = {};
      ranked.forEach((r) => { if (r.reason) reasons[r.slug] = r.reason; });
      ups.push({ parent_id: pid, slug_order: ranked.map((r) => r.slug), reasons, computed_at: new Date().toISOString() });
    }

    if (ups.length) await db.from('user_tip_ranking').upsert(ups, { onConflict: 'parent_id' });
    return NextResponse.json({ ok: true, posts: posts.length, users: ups.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
