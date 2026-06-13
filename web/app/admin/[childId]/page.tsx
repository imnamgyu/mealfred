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
import { kstToday } from '@/lib/date';
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
  // P10 집/기관 분리 — 전체는 기관 급식 포함이라 OK여도 집 끼니만 보면 부족할 수 있음(칭찬·코칭은 집 기준)
  const homeMissing = (ctx.homeMissing as string[] | undefined)?.join(', ');
  const homeReds = (ctx.homeReds as string[] | undefined)?.join(', ');
  const homeDays = ctx.homeDays as number | undefined;
  return (
    <details style={{ margin: '2px 0 12px auto', maxWidth: '78%' }}>
      <summary style={{ cursor: 'pointer', fontSize: 11, color: '#9CA3AF', fontWeight: 700, textAlign: 'right' }}>🔎 우리 판단(근거) 보기</summary>
      <div style={{ marginTop: 6, background: '#FAFAFA', border: '1px dashed #E5E7EB', borderRadius: 10, padding: 10, fontSize: 11, color: '#6B7280' }}>
        {reds && <div>🔴 결핍: <b style={{ color: '#C62828' }}>{reds}</b></div>}
        {missing && <div>📉 부족: {missing}</div>}
        {homeRef && <div>🏠 집 거부: {homeRef}</div>}
        {dayRef && <div>🏫 기관 거부: {dayRef}</div>}
        {ctx.attendsDaycare === true && (homeMissing || homeReds || homeDays != null) && (
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px dotted #E5E7EB' }}>
            🏠 <b>집 끼니만(P10 칭찬·코칭 기준)</b>{homeDays != null ? ` · ${homeDays}일` : ''}
            {homeMissing && <div style={{ paddingLeft: 14 }}>📉 집 부족 식품군: <b style={{ color: '#C45A00' }}>{homeMissing}</b></div>}
            {homeReds && <div style={{ paddingLeft: 14 }}>🔴 집 결핍: <b style={{ color: '#C62828' }}>{homeReds}</b></div>}
          </div>
        )}
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
  // ⭐ 미래 노출 차단(이사님 2026-06-13) — 식단표 OCR이 미래 날짜 끼니를 미리 넣어도(차단 전 데이터 포함)
  //   스레드는 '오늘까지'만 보여준다. 편지·질문도 동일(QA date 시뮬 잔재 방어).
  const todayKst = kstToday();
  const [{ data: meals }, { data: letters }, { data: questions }] = await Promise.all([
    db.from('meal_logs').select('log_date,menus,ingredients,refused,note,texture,place,meal_time,created_at').eq('child_id', childId).lte('log_date', todayKst),
    db.from('coach_letters').select('letter_date,letter,oneliner,context,source_hash').eq('child_id', childId).lte('letter_date', todayKst),
    db.from('daily_questions').select('q_date,question,topic,chips,answer,answered_at,context').eq('child_id', childId).lte('q_date', todayKst),
  ]);
  type PS = { period_type: string; period_key: string; metrics: { variety?: number; refusalPct?: number; enjoyPct?: number | null; avgDur?: number | null; entries?: number } };
  // period_summaries 테이블 미생성이면 error만 나고 data=null → 빈 배열(안전)
  const { data: psData } = await db.from('period_summaries').select('period_type,period_key,metrics,updated_at').eq('child_id', childId).order('period_key', { ascending: false }).limit(200);
  const periods = (psData || []) as PS[];
  // 큰 기간 → 작은 기간 순으로 그룹(타입별 필터 후 period_key desc 유지)
  const psGroups: [string, PS[]][] = ([['연', 'year'], ['반기', 'half'], ['분기', 'quarter'], ['월', 'month'], ['주', 'week']] as const)
    .map(([lab, t]) => [lab, periods.filter((p) => p.period_type === t)] as [string, PS[]]);

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

      {/* 병원 차트형 기간 요약(의무기록) — 주·월·분기·반기·연 */}
      {psGroups.some(([, arr]) => arr.length > 0) && (
        <details style={{ background: 'white', borderBottom: '1px solid #E5E7EB', padding: '10px 16px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#1a2b4a' }}>📋 기간 요약(의무기록) — {psGroups.filter(([, arr]) => arr.length > 0).map(([lab, arr]) => `${lab} ${arr.length}`).join(' · ')}</summary>
          {psGroups.map(([lab, arr]) => arr.length > 0 && (
            <div key={lab as string} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#C45A00', margin: '4px 0' }}>{lab as string} 단위</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11.5, width: '100%', minWidth: 380 }}>
                  <thead><tr style={{ color: '#9CA3AF', textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: '3px 6px' }}>기간</th><th style={{ padding: '3px 6px' }}>잘먹는</th><th style={{ padding: '3px 6px' }}>거부%</th><th style={{ padding: '3px 6px' }}>완식%</th><th style={{ padding: '3px 6px' }}>식사분</th><th style={{ padding: '3px 6px' }}>끼니</th>
                  </tr></thead>
                  <tbody>
                    {(arr as PS[]).map((p) => (
                      <tr key={p.period_key} style={{ borderTop: '1px solid #F0F0F0', textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 700, color: '#1a2b4a' }}>{p.period_key}</td>
                        <td style={{ padding: '3px 6px', color: '#16A085', fontWeight: 700 }}>{p.metrics.variety ?? '-'}</td>
                        <td style={{ padding: '3px 6px', color: '#C62828' }}>{p.metrics.refusalPct ?? '-'}</td>
                        <td style={{ padding: '3px 6px' }}>{p.metrics.enjoyPct ?? '-'}</td>
                        <td style={{ padding: '3px 6px' }}>{p.metrics.avgDur ?? '-'}</td>
                        <td style={{ padding: '3px 6px', color: '#9CA3AF' }}>{p.metrics.entries ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 6 }}>매일 새벽 크론이 현재 주·월·분기·반기·연을 재계산해 누적. '잘먹는'=2회+ 비거부 고유 식재료.</div>
        </details>
      )}

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
                  <div style={{ fontSize: 11, color: '#C45A00', fontWeight: 700, marginBottom: 3 }}>💌 코치 편지
                    {(() => {   // ⭐ 반복 모니터 칩(2026-06-11) + v3 조립 칩(H-08: 유닛·step·mode·폴백) — 복붙·전개를 한눈에
                      const c = ev.data.context as { scenarioLabel?: string; plan?: { signature?: string } | null; weekly?: { arc?: { stage?: string } | null } | null; simToPrev?: number | null; repeatAlert?: boolean; coachRegen?: boolean; model?: string; verify?: { ok?: boolean; regen?: boolean } | null; assembled?: boolean; fallback?: boolean; decision?: { unit?: string; step?: number; mode?: string } | null; blocks?: string[]; v3?: { recap?: boolean; urgent?: boolean; plateau?: boolean } | null } | null;
                      if (!c) return null;
                      const chip = (txt: string, fg: string, bg: string) => <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: fg, background: bg, borderRadius: 100, padding: '2px 7px' }}>{txt}</span>;
                      return <>
                        {c.assembled ? chip('🧱 조립식', '#1565C0', '#E8F1FB') : null}
                        {c.decision?.unit ? chip(`${c.decision.unit}·${c.decision.step}단·${c.decision.mode}`, '#7C2D92', '#F6EAFB') : null}
                        {c.fallback ? chip('⚠️ 폴백 발행', '#B91C1C', '#FDEBEB') : null}
                        {c.v3?.recap ? chip('📜 주간 회고', '#9A6B00', '#FBEED2') : null}
                        {c.v3?.urgent ? chip('🚨 시급', '#B91C1C', '#FDEBEB') : null}
                        {c.scenarioLabel ? chip(`🎯 ${c.scenarioLabel}`, '#1B5E20', '#EAF6F0') : null}
                        {c.plan?.signature ? chip(c.plan.signature, '#4A3F35', '#F3EDE6') : null}
                        {c.weekly?.arc?.stage ? chip(`아크 ${c.weekly.arc.stage}`, '#7C2D92', '#F6EAFB') : null}
                        {typeof c.simToPrev === 'number' ? chip(`유사도 ${c.simToPrev}`, c.simToPrev >= 0.45 ? '#B91C1C' : '#5B6B53', c.simToPrev >= 0.45 ? '#FDEBEB' : '#EFF4EA') : null}
                        {c.repeatAlert ? chip('🚨 반복경보', '#B91C1C', '#FDEBEB') : null}
                        {c.verify ? (c.verify.ok === false ? chip('⚠️ 검증위반 발행', '#B91C1C', '#FDEBEB') : c.verify.regen ? chip('✅ 검증→재작성', '#1B5E20', '#EAF6F0') : chip('✅ 검증통과', '#5B6B53', '#EFF4EA')) : null}
                        {c.model?.includes('sonnet') ? chip('🧠 Sonnet', '#1565C0', '#E8F1FB') : null}
                        {c.coachRegen ? chip('재생성됨', '#92400E', '#FDF3E0') : null}
                      </>;
                    })()}
                  </div>
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
