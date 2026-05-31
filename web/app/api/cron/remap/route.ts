/**
 * GET /api/cron/remap — 미매핑 메뉴 보강(백필) 수동 트리거.
 *
 * coach 크론이 매일 자동 실행하므로 별도 스케줄(vercel.json)에는 등록하지 않는다(Hobby 크론 수 절약).
 * 이 라우트는 QA·수동 백필용. 인증은 coach와 동일(CRON_SECRET, 로컬은 미설정이라 무인증).
 *   ?days=N  대상 기간(기본 7, 최대 365)
 *   ?dry=1   시뮬레이션(UPDATE·learned 저장·LLM 호출 없이 대상·해소 추정만)
 *   ?max=N   LLM 최대 호출(기본 20)
 */
import { NextResponse } from 'next/server';
import { backfillUnmappedMenus } from '@/lib/remapMenus';
import { kstDateNDaysAgo } from '@/lib/date';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const qp = new URL(req.url).searchParams;
  const days = Math.min(365, Math.max(1, parseInt(qp.get('days') || '7', 10) || 7));
  const dry = qp.get('dry') === '1';
  const maxLlm = Math.min(100, Math.max(0, parseInt(qp.get('max') || '20', 10) || 20));

  try {
    const result = await backfillUnmappedMenus({ windowDays: days, maxLlmCalls: maxLlm, timeBudgetMs: 45_000, dryRun: dry, sinceFn: kstDateNDaysAgo });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
