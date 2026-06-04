/**
 * GET /api/cron/community-rewards — 커뮤니티 보상 지급(주간 톱10 · 월간 대상).
 * Vercel은 daily cron이라 매일 돌되: KST 월요일에만 '지난 7일 베스트글 톱10', KST 1일에만 '지난달 대상'.
 * 점수 = 좋아요×2 + 해봤어요×3. 0점(반응 없음) 글은 제외(스파스 초기 과지급 방지 = 사실상 월~8만 고정에 수렴).
 * 지급: award_community_points RPC(멱등). 보상모델(이사님): 1위 5k / 2~3위 3k / 4~10위 1k · 월간 대상 +20k.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { kstToday, kstDateNDaysAgo } from '@/lib/date';

const WEEKLY = [5000, 3000, 3000, 1000, 1000, 1000, 1000, 1000, 1000, 1000];   // rank 1~10
const MONTHLY_TOP = 20000;

type Row = { id: string; parent_id: string; ingredients: string[]; like_count: number; tried_count: number; created_at: string };
const score = (r: Row) => (r.like_count || 0) * 2 + (r.tried_count || 0) * 3;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const qp = new URL(req.url).searchParams;
  const force = qp.get('force');   // 'weekly' | 'monthly' — QA 강제 실행

  const admin = createSupabaseAdmin();
  const today = kstToday();                       // 'YYYY-MM-DD' (KST)
  const dow = new Date(today + 'T00:00:00Z').getUTCDay();   // 0=일 1=월 … (날짜의 요일)
  const dom = Number(today.slice(8, 10));         // 일(day of month)
  const out: Record<string, unknown> = { today, dow, dom };

  // ── 주간 톱10 (KST 월요일) — 지난 7일 ──
  if (dow === 1 || force === 'weekly') {
    const weekStart = kstDateNDaysAgo(7);   // 7일 전 ~ 어제까지(오늘 0시 기준 직전 7일)
    const { data, error } = await admin.from('community_posts')
      .select('id,parent_id,ingredients,like_count,tried_count,created_at')
      .eq('status', 'public')
      .gte('created_at', weekStart + 'T00:00:00+09:00')
      .lt('created_at', today + 'T00:00:00+09:00');
    if (error) return NextResponse.json({ ok: false, stage: 'weekly', error: error.message });
    const ranked = (data as Row[] || []).filter((r) => score(r) > 0).sort((a, b) => score(b) - score(a)).slice(0, 10);
    let paid = 0, total = 0;
    for (let i = 0; i < ranked.length; i++) {
      const amt = WEEKLY[i]; const r = ranked[i];
      const key = `community_weekly|${weekStart}|${r.id}`;
      const { data: got } = await admin.rpc('award_community_points', {
        p_parent: r.parent_id, p_amount: amt, p_kind: 'community_weekly_top',
        p_key: key, p_meta: { week: weekStart, rank: i + 1, post_id: r.id, score: score(r) },
      });
      if ((got ?? 0) > 0) { paid++; total += got; }
    }
    out.weekly = { weekStart, candidates: ranked.length, paidCount: paid, paidPoints: total };
  }

  // ── 월간 대상 (KST 1일) — 지난달 #1 ──
  if (dom === 1 || force === 'monthly') {
    // 지난달 범위 [지난달-01, 이번달-01)
    const thisMonthStart = today.slice(0, 7) + '-01';
    const d = new Date(thisMonthStart + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1);
    const lastMonthStart = d.toISOString().slice(0, 10);
    const lastMonthKey = lastMonthStart.slice(0, 7);
    const { data, error } = await admin.from('community_posts')
      .select('id,parent_id,ingredients,like_count,tried_count,created_at')
      .eq('status', 'public')
      .gte('created_at', lastMonthStart + 'T00:00:00+09:00')
      .lt('created_at', thisMonthStart + 'T00:00:00+09:00');
    if (error) return NextResponse.json({ ok: false, stage: 'monthly', error: error.message });
    const top = (data as Row[] || []).filter((r) => score(r) > 0).sort((a, b) => score(b) - score(a))[0];
    if (top) {
      const { data: got } = await admin.rpc('award_community_points', {
        p_parent: top.parent_id, p_amount: MONTHLY_TOP, p_kind: 'community_monthly_top',
        p_key: `community_monthly|${lastMonthKey}`, p_meta: { month: lastMonthKey, post_id: top.id, score: score(top) },
      });
      out.monthly = { month: lastMonthKey, post_id: top.id, paid: got ?? 0 };
    } else {
      out.monthly = { month: lastMonthKey, paid: 0, note: '대상 없음(반응 글 없음)' };
    }
  }

  return NextResponse.json({ ok: true, ...out });
}
