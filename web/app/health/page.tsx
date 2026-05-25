/**
 * Health check route — M1 부트스트랩 검증용
 *
 * /health 진입 시:
 *   1. 환경변수 4개 존재 확인 (NEXT_PUBLIC_SUPABASE_URL·ANON_KEY + SUPABASE_SERVICE_ROLE_KEY + ANTHROPIC_API_KEY)
 *   2. Supabase anon 클라이언트로 ping (현재 시각 + 응답 latency)
 *   3. Next.js·node·Supabase·design-spec v3 정합 상태
 *
 * Production deploy 후 https://www.mealfred.com/health 또는 web preview URL에서 확인.
 */
import { createSupabaseServerAnon } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic'; // 항상 fresh check

async function pingSupabase() {
  const start = Date.now();
  try {
    const supabase = await createSupabaseServerAnon();
    const { data, error } = await supabase.from('_health_ping_').select('*').limit(1);
    const latency = Date.now() - start;
    // 테이블 미존재는 정상 (연결 자체가 됐다는 의미)
    return {
      ok: true,
      latency_ms: latency,
      note: error ? `connected · ${error.code}` : 'connected · table found',
    };
  } catch (e) {
    return { ok: false, error: String(e), latency_ms: Date.now() - start };
  }
}

export default async function HealthPage() {
  const envCheck = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
  };
  const supaPing = await pingSupabase();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px', fontFamily: 'var(--font-sans)' }}>
      <header className="hero" style={{ borderRadius: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>🩺 Mealfred Health Check</h1>
        <p style={{ marginTop: 6 }}>M1 부트스트랩 정합 확인 · <strong>2026-05-25</strong></p>
      </header>

      <section style={{ background: 'white', border: '1px solid #FFE8D0', borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>1. 환경변수</h2>
        <ul style={{ fontSize: 13, lineHeight: 1.9 }}>
          {Object.entries(envCheck).map(([k, v]) => (
            <li key={k}>{v ? '✅' : '❌'} <code>{k}</code></li>
          ))}
        </ul>
      </section>

      <section style={{ background: 'white', border: '1px solid #FFE8D0', borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>2. Supabase 연결</h2>
        <ul style={{ fontSize: 13, lineHeight: 1.9 }}>
          <li>{supaPing.ok ? '✅' : '❌'} Connection · latency <strong>{supaPing.latency_ms}ms</strong></li>
          <li style={{ fontSize: 12, color: '#8a7a6a' }}>{supaPing.note || supaPing.error}</li>
        </ul>
      </section>

      <section style={{ background: 'white', border: '1px solid #FFE8D0', borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>3. 스택</h2>
        <ul style={{ fontSize: 13, lineHeight: 1.9 }}>
          <li>Next.js 15 · App Router · Turbopack</li>
          <li>Tailwind v4 (CSS-based config)</li>
          <li>Pretendard Variable</li>
          <li>design-spec v3 토큰 매핑됨 (bg-warm-0~3 · orange-main · navy · brown-mid)</li>
          <li>node: {process.version}</li>
        </ul>
      </section>

      <p style={{ marginTop: 30, fontSize: 12, color: '#8a7a6a', textAlign: 'center' }}>
        전체 마일스톤: <a href="/roadmap.html" style={{ color: '#C45A00', fontWeight: 700 }}>roadmap.html M0-M13</a>
      </p>
    </main>
  );
}
