/**
 * /admin/[childId] — 코칭 QA 쓰레드 (카카오톡 채팅방 스타일).
 *
 * 한 계정의 시계열을 위→아래(과거→현재)로:
 *   - 부모/아이 입력(식단·거부·메모·질문 답변) = 왼쪽 말풍선
 *   - 우리 코칭(편지·오늘의 질문) = 오른쪽 말풍선
 *   - "우리 판단" = 코칭 밑에 접히는 회색 박스(context jsonb: reds·식품군·시계열·집기관 등)
 *
 * 접근: 관리자만(service_role 읽기).
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Meal = { log_date: string; menus: string[] | null; ingredients: string[] | null; refused: string | null; note: string | null; texture: string | null; place: string | null; meal_time: number | null; created_at?: string };
type Letter = { letter_date: string; letter: string; oneliner: string | null; context: Record<string, unknown> | null; source_hash?: string };
type Question = { q_date: string; question: string; topic: string | null; chips: string[] | null; answer: string | null; answered_at: string | null; context: Record<string, unknown> | null };

type Ev =
  | { date: string; kind: 'meal'; data: Meal }
  | { date: string; kind: 'letter'; data: Letter }
  | { date: string; kind: 'question'; data: Question };

const PLACE = (p: string | null) => p === 'home' ? '🏠 집' : p === 'daycare' ? '🏫 기관' : '';
const HR = (h: number | null) => h == null ? '' : h <= 12 ? `${h}시` : `오후 ${h - 12}시`;

function Bubble({ side, tone, children }: { side: 'l' | 'r'; tone?: 'gray' | 'yellow' | 'orange'; children: React.ReactNode }) {
  const bg = tone === 'orange' ? '#FFF1E6' : tone === 'gray' ? '#F3F4F6' : '#FEF3C7';
  const bd = tone === 'orange' ? '#FFD9B8' : tone === 'gray' ? '#E5E7EB' : '#FDE68A';
  return (
    <div style={{ display: 'flex', justifyContent: side === 'r' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div style={{ maxWidth: '78%', background: bg, border: `1px solid ${bd}`, borderRadius: 14, padding: '10px 13px', fontSize: 13.5, lineHeight: 1.55, color: '#1a2b4a', whiteSpace: 'pre-wrap' }}>
        {children}
      </div>
    </div>
  );
}

function Ctx({ ctx }: { ctx: Record<string, unknown> | null }) {
  if (!ctx) return null;
  const pretty = JSON.stringify(ctx, null, 2);
  // 핵심 필드 요약 라인
  const reds = (ctx.reds as string[] | undefined)?.join(', ');
  const missing = (ctx.missing as string[] | undefined)?.join(', ');
  const homeRef = (ctx.homeRefused as string[] | undefined)?.join(', ');
  const dayRef = (ctx.daycareRefused as string[] | undefined)?.join(', ');
  return (
    <details style={{ margin: '2px 0 12px auto', maxWidth: '78%' }}>
      <summary style={{ cursor: 'pointer', fontSize: 11, color: '#9CA3AF', fontWeight: 700, textAlign: 'right' }}>🔎 우리 판단(근거) 보기</summary>
      <div style={{ marginTop: 6, background: '#FAFAFA', border: '1px dashed #E5E7EB', borderRadius: 10, padding: 10, fontSize: 11, color: '#6B7280' }}>
        {reds && <div>🔴 결핍: <b style={{ color: '#C62828' }}>{reds}</b></div>}
        {missing && <div>📉 부족: {missing}</div>}
        {homeRef && <div>🏠 집 거부: {homeRef}</div>}
        {dayRef && <div>🏫 기관 거부: {dayRef}</div>}
        {ctx.source != null && <div>⚙ 경로: {String(ctx.source)}{ctx.model ? ` · ${String(ctx.model)}` : ''}</div>}
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 10, color: '#B0B0B0' }}>raw json</summary>
          <pre style={{ marginTop: 4, fontSize: 10, lineHeight: 1.4, overflowX: 'auto', color: '#9CA3AF' }}>{pretty}</pre>
        </details>
      </div>
    </details>
  );
}

export default async function AdminThread({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 480, margin: '60px auto', padding: 24, fontFamily: 'Pretendard' }}><p style={{ color: '#6B7280' }}>🔒 관리자 전용. <Link href="/admin" style={{ color: '#FF6B1A' }}>← 콘솔</Link></p></main>;
  }

  const db = createSupabaseAdmin();
  const { data: child } = await db.from('children').select('nickname,age_band,sex,daycare').eq('id', childId).maybeSingle();
  const [{ data: meals }, { data: letters }, { data: questions }] = await Promise.all([
    db.from('meal_logs').select('log_date,menus,ingredients,refused,note,texture,place,meal_time,created_at').eq('child_id', childId),
    db.from('coach_letters').select('letter_date,letter,oneliner,context,source_hash').eq('child_id', childId),
    db.from('daily_questions').select('q_date,question,topic,chips,answer,answered_at,context').eq('child_id', childId),
  ]);

  const evs: Ev[] = [
    ...(meals || []).map((m): Ev => ({ date: m.log_date, kind: 'meal', data: m as Meal })),
    ...(letters || []).map((l): Ev => ({ date: l.letter_date, kind: 'letter', data: l as Letter })),
    ...(questions || []).map((q): Ev => ({ date: q.q_date, kind: 'question', data: q as Question })),
  ];
  // 날짜 오름차순(과거 위 → 최신 아래). 같은 날: 식단 → 질문 → 편지
  const ord = { meal: 0, question: 1, letter: 2 } as const;
  evs.sort((a, b) => a.date === b.date ? ord[a.kind] - ord[b.kind] : a.date.localeCompare(b.date));

  let lastDate = '';

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#B2C7DA', fontFamily: 'Pretendard, sans-serif' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #E5E7EB', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/admin" style={{ fontSize: 18, color: '#6B7280', textDecoration: 'none' }}>←</Link>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1a2b4a' }}>{child?.nickname || '(이름없음)'}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{child?.age_band}{child?.sex === 'M' ? '·남아' : child?.sex === 'F' ? '·여아' : ''}{child?.daycare ? ' · 기관 다님' : ''}</div>
        </div>
      </header>

      <div style={{ padding: '14px 14px 60px' }}>
        {evs.length === 0 && <p style={{ textAlign: 'center', color: '#5a6b7a', fontSize: 13, marginTop: 40 }}>아직 기록이 없어요.</p>}
        {evs.map((ev, i) => {
          const showDate = ev.date !== lastDate;
          lastDate = ev.date;
          return (
            <div key={i}>
              {showDate && (
                <div style={{ textAlign: 'center', margin: '14px 0 10px' }}>
                  <span style={{ background: 'rgba(0,0,0,0.18)', color: 'white', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 100 }}>{ev.date}</span>
                </div>
              )}
              {ev.kind === 'meal' && (
                <Bubble side="l" tone="yellow">
                  <div style={{ fontSize: 11, color: '#92400E', fontWeight: 700, marginBottom: 3 }}>👩 부모 입력 {ev.data.place ? `· ${PLACE(ev.data.place)}` : ''}{ev.data.meal_time ? ` · ${HR(ev.data.meal_time)}` : ''}</div>
                  {ev.data.menus?.length ? <div><b>🍽 {ev.data.menus.join(', ')}</b></div> : null}
                  {ev.data.ingredients?.length ? <div style={{ fontSize: 12, color: '#6B7280' }}>→ {ev.data.ingredients.join('·')}</div> : null}
                  {ev.data.refused ? <div style={{ color: '#C62828', fontSize: 12, marginTop: 2 }}>🙅 거부: {ev.data.refused}</div> : null}
                  {ev.data.texture ? <div style={{ fontSize: 12, color: '#6B7280' }}>식감: {ev.data.texture}</div> : null}
                  {ev.data.note ? <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>📝 {ev.data.note}</div> : null}
                </Bubble>
              )}
              {ev.kind === 'question' && (<>
                <Bubble side="r" tone="orange">
                  <div style={{ fontSize: 11, color: '#C45A00', fontWeight: 700, marginBottom: 3 }}>🤖 오늘의 질문{ev.data.topic ? ` · ${ev.data.topic}` : ''}</div>
                  {ev.data.question}
                  {ev.data.chips?.length ? <div style={{ marginTop: 4, fontSize: 11, color: '#9a8a7a' }}>[{ev.data.chips.join('] [')}]</div> : null}
                </Bubble>
                <Ctx ctx={ev.data.context} />
                {ev.data.answer && <Bubble side="l" tone="yellow"><div style={{ fontSize: 11, color: '#92400E', fontWeight: 700, marginBottom: 2 }}>👩 답변</div>{ev.data.answer}</Bubble>}
              </>)}
              {ev.kind === 'letter' && (<>
                <Bubble side="r" tone="orange">
                  <div style={{ fontSize: 11, color: '#C45A00', fontWeight: 700, marginBottom: 3 }}>💌 코치 편지</div>
                  {ev.data.oneliner ? <div style={{ fontWeight: 800, marginBottom: 4 }}>{ev.data.oneliner}</div> : null}
                  {ev.data.letter}
                </Bubble>
                <Ctx ctx={ev.data.context} />
              </>)}
            </div>
          );
        })}
      </div>
    </main>
  );
}
