/**
 * /api/cron/coach-selfcheck — 코칭 엔진 야간 자가진단(자가발전 Phase1·coaching-self-improvement.html 1층 상시화).
 *
 * 전 자녀의 최근 편지를 스스로 점검: ①반복점수(letterSimilarity) ②oneliner 중복 ③식단 거울 누락률
 *   ④부모 1탭 피드백 집계(🔁또비슷·👎별로). 임계 위반 자녀를 cron_runs.meta.alerts에 기록 →
 *   '6/5 편지 겹침'을 사람이 제보하던 걸 시스템이 매일 스스로 탐지(문서 §1 한계 해소).
 *
 * 결정론·LLM 0콜. 어드민 child 페이지의 on-load 자가진단과 같은 로직(상시 자동화 버전).
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { letterSimilarity } from '@/lib/coach';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const dAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: runRow } = await sb.from('cron_runs').insert({ job_name: 'coach-selfcheck', status: 'running' }).select('id').single();
  const alerts: string[] = [];
  let checked = 0;
  try {
    type L = { child_id: string; letter_date: string; letter: string | null; oneliner: string | null; context: Record<string, unknown> | null };
    const { data: lets } = await sb.from('coach_letters')
      .select('child_id,letter_date,letter,oneliner,context')
      .gte('letter_date', dAgo(10)).order('letter_date', { ascending: false });
    const byChild: Record<string, L[]> = {};
    ((lets || []) as L[]).forEach((l) => { (byChild[l.child_id] ||= []).push(l); });

    // 부모 1탭 피드백 집계(테이블 없으면 graceful)
    const fbByChild: Record<string, { up: number; down: number; repeat: number }> = {};
    try {
      const { data: fbs } = await sb.from('letter_feedback').select('child_id,rating').gte('letter_date', dAgo(10));
      ((fbs || []) as Array<{ child_id: string; rating: 'up' | 'down' | 'repeat' }>).forEach((f) => {
        const o = (fbByChild[f.child_id] ||= { up: 0, down: 0, repeat: 0 });
        if (f.rating in o) o[f.rating]++;
      });
    } catch { /* 테이블 미생성 — 피드백 집계 생략 */ }

    // 이름(알람 가독성)
    const ids = Object.keys(byChild);
    const nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: kids } = await sb.from('children').select('id,nickname').in('id', ids);
      (kids || []).forEach((k: { id: string; nickname: string | null }) => { nameMap[k.id] = k.nickname || k.id.slice(0, 8); });
    }

    for (const [cid, ls] of Object.entries(byChild)) {
      checked++;
      const recent = ls.filter((l) => l.letter).slice(0, 7);
      let maxSim = 0;
      for (let i = 0; i < recent.length; i++) for (let j = i + 1; j < recent.length; j++) {
        const s = letterSimilarity(recent[i].letter || '', recent[j].letter || '');
        if (s > maxSim) maxSim = s;
      }
      const onel = recent.map((l) => l.oneliner).filter(Boolean) as string[];
      const onelDup = onel.length - new Set(onel).size;
      const mirrorRate = recent.length ? recent.filter((l) => (l.context as { mirror?: unknown } | null)?.mirror).length / recent.length : 1;
      const fb = fbByChild[cid] || { up: 0, down: 0, repeat: 0 };
      const flags: string[] = [];
      if (maxSim >= 0.45) flags.push(`반복 ${Math.round(maxSim * 100)}%`);
      if (onelDup > 0) flags.push(`oneliner중복 ${onelDup}`);
      if (recent.length >= 3 && mirrorRate < 0.8) flags.push(`식단거울누락 ${Math.round((1 - mirrorRate) * 100)}%`);
      if (fb.repeat > 0) flags.push(`🔁또비슷 ${fb.repeat}`);
      if (fb.down > 0) flags.push(`👎별로 ${fb.down}`);
      // ⭐ EPIC G-11 — compare 코호트 자녀만 'B가 A를 이기는지' 요약 1줄(투표 0이면 노이즈 0).
      if (flags.length) alerts.push(`${nameMap[cid] || cid.slice(0, 8)}: ${flags.join(' · ')}`);
    }

    await sb.from('cron_runs').update({
      status: alerts.length ? 'partial' : 'success', finished_at: new Date().toISOString(),
      processed_count: checked, error_count: alerts.length,
      meta: { checked, alertCount: alerts.length, alerts: alerts.slice(0, 50) },
    }).eq('id', runRow?.id);
    return NextResponse.json({ ok: true, checked, alertCount: alerts.length, alerts });
  } catch (e) {
    await sb.from('cron_runs').update({ status: 'failure', finished_at: new Date().toISOString(), meta: { error: String(e) } }).eq('id', runRow?.id);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
