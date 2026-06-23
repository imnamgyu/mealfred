/**
 * /admin/funnel — 마케팅 펀넬 코호트 (Phase 1, DB 기반).
 *
 * 가입일(KST) 코호트로: 가입 → 자녀 등록 → 첫 끼니(활성)까지 며칠에 걸쳐 도달했는지.
 * Phase 1은 DB에 이미 있는 단계만(가입=auth.users·자녀=children·첫끼니=meal_logs).
 * 홈 진입·사인업 페이지(익명 트래픽)는 Phase 2(mf_vid 쿠키 + /api/funnel)에서 앞단에 붙는다.
 *
 * 접근: 관리자만(service_role로 전 계정 읽음).
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import Link from 'next/link';
import RefreshButton from './RefreshButton';

export const dynamic = 'force-dynamic';

// 요일은 KST 기준으로(런타임이 UTC면 getDay()가 KST 자정을 전날로 봐서 하루 밀린다 → 정오 앵커 + timeZone).
const label = (d: string) => {
  const w = new Date(d + 'T12:00:00+09:00').toLocaleDateString('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' });
  return `${d.slice(5)} (${w})`;
};

export default async function FunnelPage() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 420, margin: '60px auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a2b4a' }}>🔒 관리자 전용</h1>
      <p style={{ marginTop: 8, color: '#6B7280', fontSize: 14 }}>mealfred.com 계정으로 <Link href="/admin" style={{ color: '#C45A00' }}>로그인</Link>하세요.</p>
    </main>;
  }

  const db = createSupabaseAdmin();
  // 집계는 DB 안에서(funnel_cohort RPC). 1만 명에서도 meal_logs 풀스캔·listUsers 1000 한계 없이
  // 일자별 GROUP BY 결과만 받는다. RPC 없으면(마이그레이션 전) 안내 배너로 안전 degrade.
  type Row = { day: string; signups: number; children: number; meals: number; visits: number };
  const { data: rowsData, error: rpcErr } = await db.rpc('funnel_cohort');
  const rows: Row[] = (rowsData as Row[] | null) || [];

  type Cell = { signup: number; child: number; meal: number };
  const coh: Record<string, Cell> = {};
  const visitByDay: Record<string, number> = {};
  const tot: Cell = { signup: 0, child: 0, meal: 0 };
  let totVisits = 0;
  rows.forEach((r) => {
    coh[r.day] = { signup: r.signups, child: r.children, meal: r.meals };
    visitByDay[r.day] = r.visits;
    tot.signup += r.signups; tot.child += r.children; tot.meal += r.meals; totVisits += r.visits;
  });
  // 최근 30일을 빠짐없이(KST). 방문·가입이 0인 날도 행을 만들어 0으로 표시.
  // 정오(UTC) 앵커 + UTC 일자 빼기 = 런타임 TZ와 무관하게 KST 달력일 그대로.
  const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
  const base = new Date(todayKst + 'T12:00:00Z');
  const dates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });

  // 오늘(KST) 런칭 지표 — 식단표 평가 퍼널: ocr_budget(OCR 콜)·ocr_logs(식단표 인식)·institution_scores(기관평가 저장).
  //   테이블/컬럼 없거나 에러여도 count null → 0으로 안전 degrade.
  const kstMidnightUtc = `${todayKst}T00:00:00+09:00`;
  const { data: budgetRow } = await db.from('ocr_budget').select('count').order('day', { ascending: false }).limit(1).maybeSingle();
  const ocrCalls = (budgetRow as { count: number } | null)?.count ?? 0;
  const { count: menuOkCnt } = await db.from('ocr_logs').select('id', { count: 'exact', head: true }).gte('created_at', kstMidnightUtc).eq('is_menu', true);
  const { count: evalSavedCnt } = await db.from('institution_scores').select('institution_id', { count: 'exact', head: true }).gte('computed_at', kstMidnightUtc);
  const menuOk = menuOkCnt ?? 0;
  const evalSaved = evalSavedCnt ?? 0;

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  const Stage = ({ n, base, color }: { n: number; base: number; color: string }) => (
    <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 800, color: '#1a2b4a' }}>{n}</span>
      <span style={{ display: 'inline-block', minWidth: 38, marginLeft: 6, fontSize: 11, fontWeight: 700, color }}>{base ? `${pct(n, base)}%` : '–'}</span>
    </td>
  );

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <header style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a2b4a' }}>📊 마케팅 펀넬 · 가입일 코호트</h1>
          <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>가입한 날 기준으로, 자녀 등록·첫 끼니까지 얼마나 내려갔나 (KST)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshButton renderedAt={new Date().toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' })} />
          <Link href="/admin" style={{ fontSize: 12, fontWeight: 800, color: '#1a2b4a', background: '#F1F1F0', borderRadius: 8, padding: '8px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}>← 콘솔</Link>
        </div>
      </header>

      {rpcErr && (
        <div style={{ marginBottom: 14, padding: '12px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, fontSize: 12.5, color: '#9A3412', lineHeight: 1.6 }}>
          ⚠️ 집계 함수가 아직 없어요. <code>sql/2026-06-05_funnel_cohort.sql</code>을 Supabase SQL Editor에서 1회 실행하면 숫자가 채워집니다.
        </div>
      )}

      {/* 오늘(런칭) 식단표 평가 실시간 스트립 */}
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'linear-gradient(135deg,#FFF1F2,#FFF7ED)', border: '1.5px solid #FECACA', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#DC2626', whiteSpace: 'nowrap' }}>🔴 오늘 식단표 평가 <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>({todayKst} KST)</span></div>
        {[
          { l: 'OCR 분석 콜', n: ocrCalls, c: '#1a2b4a' },
          { l: '식단표 인식', n: menuOk, c: '#16A085' },
          { l: '기관 평가 저장', n: evalSaved, c: '#C45A00' },
        ].map((x) => (
          <div key={x.l} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: x.c, lineHeight: 1.1 }}>{x.n}</span>
            <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 700 }}>{x.l}</span>
          </div>
        ))}
        <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>우상단 ⚪실시간 켜면 20초 자동 갱신</span>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[
          { label: '방문 (고유)', n: totVisits, sub: '익명 접속자', c: '#6B7280' },
          { label: '가입', n: tot.signup, sub: totVisits ? `방문 대비 ${pct(tot.signup, totVisits)}%` : '누적', c: '#1a2b4a' },
          { label: '자녀 등록', n: tot.child, sub: `가입 대비 ${pct(tot.child, tot.signup)}%`, c: '#C45A00' },
          { label: '첫 끼니 (활성)', n: tot.meal, sub: `가입 대비 ${pct(tot.meal, tot.signup)}%`, c: '#16A085' },
        ].map((x) => (
          <div key={x.label} style={{ padding: 14, background: 'white', border: '1px solid #ECECEC', borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 700 }}>{x.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: x.c, marginTop: 2 }}>{x.n}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>{x.sub}</div>
          </div>
        ))}
      </div>

      {/* 코호트 테이블 */}
      <div style={{ background: 'white', border: '1px solid #ECECEC', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#FAFAF8', color: '#6B7280', fontSize: 11, fontWeight: 800 }}>
              <th style={{ padding: '9px 10px', textAlign: 'left' }}>날짜</th>
              <th style={{ padding: '9px 10px', textAlign: 'right' }}>방문</th>
              <th style={{ padding: '9px 10px', textAlign: 'right' }}>가입</th>
              <th style={{ padding: '9px 10px', textAlign: 'right' }}>→ 자녀 등록</th>
              <th style={{ padding: '9px 10px', textAlign: 'right' }}>→ 첫 끼니</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#FFF8F0', borderBottom: '2px solid #FFE0C0', fontSize: 13 }}>
              <td style={{ padding: '9px 10px', fontWeight: 800, color: '#C45A00' }}>합계</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: '#6B7280' }}>{totVisits}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: '#1a2b4a' }}>{tot.signup}</td>
              <Stage n={tot.child} base={tot.signup} color="#C45A00" />
              <Stage n={tot.meal} base={tot.signup} color="#16A085" />
            </tr>
            {dates.map((d) => {
              const c = coh[d] || { signup: 0, child: 0, meal: 0 };
              const v = visitByDay[d] || 0;
              const isToday = d === todayKst;
              return (
                <tr key={d} style={{ borderBottom: '1px solid #F3F3F1', background: isToday ? '#FEF9C3' : undefined }}>
                  <td style={{ padding: '9px 10px', color: '#374151', fontWeight: isToday ? 800 : 600 }}>{label(d)}{isToday ? ' · 오늘' : ''}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#6B7280' }}>{v}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: '#1a2b4a' }}>{c.signup}</td>
                  <Stage n={c.child} base={c.signup} color="#C45A00" />
                  <Stage n={c.meal} base={c.signup} color="#16A085" />
                </tr>
              );
            })}
            {dates.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#9CA3AF' }}>아직 데이터가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 14, fontSize: 11.5, color: '#9CA3AF', lineHeight: 1.7 }}>
        · <b>방문(고유)</b> = <code>mf_vid</code> 쿠키 익명 접속자 · <b>첫 방문일</b> 기준. 전체 방문→가입 전환율은 상단 KPI.<br />
        · <b>가입·자녀·첫끼니</b>는 <b>가입한 날</b> 코호트(6/1 가입자가 6/3 자녀 등록해도 6/1 행). 같은 행의 방문↔가입은 날짜만 같을 뿐 직접 전환은 아님.<br />
        · 최근 30일 · 방문 추적은 <code>app_visitors</code> 테이블 필요(SQL 1회 실행). 첫 끼니 = 활성(가입만 하고 안 쓴 사람과 구분).
      </p>
    </main>
  );
}
