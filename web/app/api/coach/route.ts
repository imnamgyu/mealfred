/**
 * POST /api/coach — AI 편식 코치 (조언 편지 + 진단 한줄)
 *
 * 최근 식사 기록(정량 분석값·거부·집/기관·시계열·정성 메모)을 받아
 * 편식극복키트 01_참고자료 근거로 안심 편지 + 진단 한줄을 생성한다.
 * 생성 규칙·프롬프트는 lib/coach.ts에 공유(DRY) — 라우트·새벽 크론이 동일 로직 사용.
 *
 * body: LetterInput (childName, ageBand, reds[], covered[], missing[], notes[]/recentNotes[],
 *       refused[], homeRefused[], daycareRefused[], timeseries[], eatenCount, pastLetters[])
 * resp: { letter, oneliner }
 *
 * 스펙: 편식극복키트/06_운영/카톡코칭/코칭엔진_스펙_v1.md
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateLetter } from '@/lib/coach';

const ALLOWED = ['https://www.mealfred.com', 'https://mealfred.com', 'https://app.mealfred.com', 'https://mealfred-app.vercel.app'];
function cors(req: NextRequest) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[2],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(null, { headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const b = await req.json();
    const { letter, oneliner } = await generateLetter({
      childName: b.childName,
      ageBand: b.ageBand,
      eatenCount: b.eatenCount,
      reds: b.reds,
      covered: b.covered,
      missing: b.missing,
      notes: b.notes || b.recentNotes,   // recentNotes = 기존 클라 필드명 호환
      refused: b.refused,
      homeRefused: b.homeRefused,
      daycareRefused: b.daycareRefused,
      timeseries: b.timeseries,
      pastLetters: b.pastLetters,
    });
    return NextResponse.json({ letter, oneliner }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[coach] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers });
  }
}
