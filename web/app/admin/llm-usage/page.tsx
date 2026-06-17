/**
 * /admin/llm-usage — 코칭 유지비용 실측(토큰 기반).
 *
 * llm_usage(자녀×일자)에서 최근 N일을 읽어: 자녀별 누적 토큰·원가 → 1일 평균 → 월 추정(×30) → 1인당 월 평균.
 * 토큰은 callLLM가 적재한 실측값(추정 아님). 단가는 lib/llmCost.PRICE(2026-06 공식가) 기준.
 * 접근: 관리자만(service_role). llm_usage 테이블 없으면(SQL 실행 전) 안내 배너로 안전 degrade.
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { PRICE, KRW_PER_USD } from '@/lib/llmCost';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 30;

type UsageRow = {
  child_id: string; usage_date: string; calls: number; cost_usd: number;
  haiku_in: number; haiku_cache_read: number; haiku_cache_write: number; haiku_out: number;
  sonnet_in: number; sonnet_cache_read: number; sonnet_cache_write: number; sonnet_out: number;
};

const won = (usd: number) => `₩${Math.round(usd * KRW_PER_USD).toLocaleString('ko-KR')}`;
const tok = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export default async function LlmUsagePage() {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 420, margin: '60px auto', padding: 24, fontFamily: 'Pretendard, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a2b4a' }}>🔒 관리자 전용</h1>
      <p style={{ marginTop: 8, color: '#6B7280', fontSize: 14 }}>mealfred.com 계정으로 <Link href="/admin" style={{ color: '#C45A00' }}>로그인</Link>하세요.</p>
    </main>;
  }

  const db = createSupabaseAdmin();
  const since = (() => {
    const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const base = new Date(todayKst + 'T12:00:00Z');
    base.setUTCDate(base.getUTCDate() - (WINDOW_DAYS - 1));
    return base.toISOString().slice(0, 10);
  })();

  const { data: rowsData, error } = await db.from('llm_usage').select('*').gte('usage_date', since).order('usage_date', { ascending: false });
  const tableMissing = !!error;
  const rows: UsageRow[] = (rowsData as UsageRow[] | null) || [];

  // 자녀 이름
  const { data: kids } = await db.from('children').select('id,nickname');
  const nameOf: Record<string, string> = {};
  (kids || []).forEach((k: { id: string; nickname: string | null }) => { nameOf[k.id] = k.nickname || k.id.slice(0, 6); });

  // 자녀별 집계
  type Agg = { child: string; days: Set<string>; calls: number; cost: number; haikuTok: number; sonnetTok: number; haikuCost: number; sonnetCost: number };
  const byChild: Record<string, Agg> = {};
  const sumFam = (input: number, cacheRead: number, cacheWrite: number, output: number, fam: 'haiku' | 'sonnet') => {
    const p = PRICE[fam];
    return { tok: input + cacheRead + cacheWrite + output, cost: input * p.in + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite + output * p.out };
  };
  for (const r of rows) {
    const a = (byChild[r.child_id] ||= { child: r.child_id, days: new Set(), calls: 0, cost: 0, haikuTok: 0, sonnetTok: 0, haikuCost: 0, sonnetCost: 0 });
    a.days.add(r.usage_date); a.calls += r.calls || 0; a.cost += Number(r.cost_usd) || 0;
    const h = sumFam(r.haiku_in, r.haiku_cache_read, r.haiku_cache_write, r.haiku_out, 'haiku');
    const s = sumFam(r.sonnet_in, r.sonnet_cache_read, r.sonnet_cache_write, r.sonnet_out, 'sonnet');
    a.haikuTok += h.tok; a.sonnetTok += s.tok; a.haikuCost += h.cost; a.sonnetCost += s.cost;
  }
  const aggs = Object.values(byChild).map((a) => {
    const d = a.days.size || 1;
    const perDay = a.cost / d;
    return { ...a, dayCount: d, perDay, perMonth: perDay * 30 };
  }).sort((x, y) => y.perMonth - x.perMonth);

  // 전체 요약
  const childN = aggs.length;
  const totalCost = aggs.reduce((s, a) => s + a.cost, 0);
  const totalCalls = aggs.reduce((s, a) => s + a.calls, 0);
  const avgPerChildMonth = childN ? aggs.reduce((s, a) => s + a.perMonth, 0) / childN : 0;   // 1인당 월 평균(자녀별 월추정의 평균)
  const haikuCost = aggs.reduce((s, a) => s + a.haikuCost, 0);
  const sonnetCost = aggs.reduce((s, a) => s + a.sonnetCost, 0);

  const card = { background: '#fff', border: '1px solid #ECECEC', borderRadius: 12, padding: '14px 16px' } as const;
  const th = { textAlign: 'left' as const, fontSize: 11.5, color: '#9AA0A6', fontWeight: 700, padding: '8px 10px', borderBottom: '1px solid #EEE', whiteSpace: 'nowrap' as const };
  const td = { fontSize: 13, color: '#2A2A2A', padding: '9px 10px', borderBottom: '1px solid #F4F4F4', whiteSpace: 'nowrap' as const };

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 24px 80px', fontFamily: 'Pretendard, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a2b4a' }}>💸 코칭 유지비용 (토큰 실측)</h1>
      <p style={{ marginTop: 6, color: '#6B7280', fontSize: 13 }}>
        최근 {WINDOW_DAYS}일 · callLLM가 적재한 실제 토큰 기준. 단가 Haiku ${'{'}1/$5{'}'}·Sonnet $3/$15 per MTok, 환율 ₩{KRW_PER_USD.toLocaleString()}/$. 시스템블록 캐싱 반영(실측).
      </p>

      {tableMissing && (
        <div style={{ ...card, marginTop: 16, background: '#FFF7ED', borderColor: '#FED7AA', color: '#9A3412', fontSize: 13 }}>
          ⚠️ <b>llm_usage 테이블이 아직 없습니다.</b> <code>web/sql/2026-06-14_llm_usage.sql</code>을 Supabase에서 실행하면, 다음 야간 크론(1회)부터 실측이 쌓입니다. (크론은 테이블 없어도 안전하게 계속 돕니다.)
        </div>
      )}
      {!tableMissing && !rows.length && (
        <div style={{ ...card, marginTop: 16, background: '#F0F9FF', borderColor: '#BAE6FD', color: '#075985', fontSize: 13 }}>
          테이블은 있으나 아직 데이터가 없습니다. 다음 야간 크론(KST 02시) 1회 실행 후 채워집니다.
        </div>
      )}

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
        <div style={card}><div style={{ fontSize: 11.5, color: '#9AA0A6', fontWeight: 700 }}>1인당 월 평균(추정)</div><div style={{ fontSize: 24, fontWeight: 800, color: '#C45A00', marginTop: 4 }}>{won(avgPerChildMonth)}</div><div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 2 }}>${avgPerChildMonth.toFixed(3)}/월</div></div>
        <div style={card}><div style={{ fontSize: 11.5, color: '#9AA0A6', fontWeight: 700 }}>측정 자녀</div><div style={{ fontSize: 24, fontWeight: 800, color: '#1a2b4a', marginTop: 4 }}>{childN}명</div><div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 2 }}>최근 {WINDOW_DAYS}일</div></div>
        <div style={card}><div style={{ fontSize: 11.5, color: '#9AA0A6', fontWeight: 700 }}>총 콜 / 비용</div><div style={{ fontSize: 24, fontWeight: 800, color: '#1a2b4a', marginTop: 4 }}>{totalCalls.toLocaleString()}</div><div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 2 }}>{won(totalCost)} (${totalCost.toFixed(2)})</div></div>
        <div style={card}><div style={{ fontSize: 11.5, color: '#9AA0A6', fontWeight: 700 }}>Haiku : Sonnet 비용</div><div style={{ fontSize: 18, fontWeight: 800, color: '#1a2b4a', marginTop: 8 }}>{won(haikuCost)} : {won(sonnetCost)}</div><div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 2 }}>{totalCost ? Math.round(haikuCost / totalCost * 100) : 0}% : {totalCost ? Math.round(sonnetCost / totalCost * 100) : 0}%</div></div>
      </div>

      {/* 자녀별 테이블 */}
      {!!aggs.length && (
        <div style={{ ...card, marginTop: 18, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>자녀</th><th style={th}>일수</th><th style={th}>콜</th>
              <th style={th}>Haiku 토큰</th><th style={th}>Sonnet 토큰</th>
              <th style={th}>누적 원가</th><th style={th}>일평균</th><th style={th}>월 추정</th>
            </tr></thead>
            <tbody>
              {aggs.map((a) => (
                <tr key={a.child}>
                  <td style={td}><Link href={`/admin/${a.child}`} style={{ color: '#C45A00', textDecoration: 'none', fontWeight: 600 }}>{nameOf[a.child] || a.child.slice(0, 6)}</Link></td>
                  <td style={td}>{a.dayCount}</td>
                  <td style={td}>{a.calls}</td>
                  <td style={td}>{tok(a.haikuTok)}</td>
                  <td style={td}>{tok(a.sonnetTok)}</td>
                  <td style={td}>{won(a.cost)}</td>
                  <td style={td}>{won(a.perDay)}</td>
                  <td style={{ ...td, fontWeight: 700, color: '#C45A00' }}>{won(a.perMonth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 14, fontSize: 11.5, color: '#9AA0A6', lineHeight: 1.6 }}>
        · <b>월 추정</b> = (자녀 누적 원가 ÷ 측정 일수) × 30. 측정 일수가 적은 신규 자녀는 변동 큼.<br />
        · 토큰은 input+cache_read+cache_write+output 합. 캐시 read는 0.1×, write는 1.25× 단가로 비용 반영.<br />
        · 일간 두뇌(Sonnet 매일)는 현재 라이브 OFF — 켜면 Sonnet 비중이 오릅니다.
      </p>
    </main>
  );
}
