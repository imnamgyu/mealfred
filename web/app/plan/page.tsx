import type { Metadata } from 'next';
import { composePlan, ageLabel, type PlanRecipe } from '@/lib/composePlan';
import { unstable_cache } from 'next/cache';

// P1-3: composePlan(ingredients·ingredient_recipes DB 조회)을 입력(ings,age)별로 캐시 — 같은 조합 재요청 시 DB·연산 0.
const cachedPlan = unstable_cache(
  (ings: string[], age: string) => composePlan(ings, age),
  ['plan-compose'],
  { revalidate: 3600 },
);

export const metadata: Metadata = {
  title: '우리 아이 맞춤 3일 식단 — 밀프레드',
  description: '식단표에 빠진 식재료로 만든 3일 예시 식단 — 연령 맞춤 레시피 · 푸드체이닝.',
};

const C = {
  bg: '#FFFDFB', cream: '#FFF5EB', orange: '#FF6B1A', brown: '#C45A00', navy: '#1a2b4a',
  text: '#374151', sub: '#6B7280', line: '#E5E7EB', green: '#1B5E20', red: '#C62828',
};

function RecipeCard({ r }: { r: PlanRecipe }) {
  const d = r.detail || {};
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15.5, color: C.navy, fontWeight: 800 }}>{r.recipe_name}</strong>
        <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{r.cooking_method}{d.time_min ? ` · ${d.time_min}분` : ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: C.brown, background: C.cream, padding: '3px 9px', borderRadius: 100, fontWeight: 700 }}>👶 {r.ingredient}</span>
      </div>
      {d.nutri_point ? <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginTop: 6 }}>🟢 {d.nutri_point}</div> : null}
      {d.ingredients?.length ? <div style={{ fontSize: 12, color: C.text, fontWeight: 600, marginTop: 8 }}><b style={{ color: C.sub }}>재료</b> {d.ingredients.join(' · ')}</div> : null}
      {d.steps?.length ? (
        <ol style={{ fontSize: 12.5, color: C.text, fontWeight: 500, margin: '8px 0 0 18px', lineHeight: 1.7 }}>
          {d.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      ) : null}
      {d.texture ? <div style={{ fontSize: 11.5, color: C.sub, fontWeight: 600, marginTop: 8 }}>🥄 식감: {d.texture}</div> : null}
      {d.tip ? <div style={{ fontSize: 11.5, color: C.brown, fontWeight: 600, marginTop: 4 }}>💡 {d.tip}</div> : null}
      {r.allergens ? <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginTop: 4 }}>⚠️ 알레르겐: {r.allergens}</div> : null}
    </div>
  );
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const ingsRaw = typeof sp.ings === 'string' ? sp.ings : '';
  const age = (typeof sp.age === 'string' ? sp.age : '') || '3-4y';
  const ings = ingsRaw.split(',').map((s) => decodeURIComponent(s).trim()).filter(Boolean);

  const plan = await cachedPlan(ings, age);
  const DAYCARE = 'https://www.mealfred.com/daycare-eval.html';

  return (
    <main style={{ minHeight: '100dvh', background: C.bg, fontFamily: 'Pretendard, -apple-system, sans-serif', color: C.text }}>
      <header style={{ background: `linear-gradient(160deg,${C.cream},#FFD0A0)`, padding: '40px 20px 28px', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ fontSize: 12, color: C.brown, fontWeight: 700 }}>🍽 밀프레드 맞춤 식단</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.navy, margin: '8px 0', lineHeight: 1.3 }}>우리 아이 3일 예시 식단</h1>
          <p style={{ fontSize: 13, color: '#5a4a3a', fontWeight: 600 }}>{ageLabel(age)} 기준 · 식단표에 <b>빠진 식재료</b>로 구성했어요</p>
        </div>
      </header>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 60px' }}>
        {plan.days.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontSize: 15, color: C.text, fontWeight: 600 }}>식단을 만들 식재료 정보가 없어요.</p>
            <p style={{ fontSize: 12.5, color: C.sub, marginTop: 6 }}>식단표를 평가하면 빠진 식재료로 맞춤 식단을 만들어드려요.</p>
            <a href={DAYCARE} style={{ display: 'inline-block', marginTop: 16, background: C.orange, color: '#fff', padding: '13px 24px', borderRadius: 100, fontWeight: 700, textDecoration: 'none' }}>📋 식단표 평가하기 →</a>
          </div>
        ) : (
          <>
            <div style={{ background: '#E3F2FD', border: '1.5px solid #3498DB', borderRadius: 14, padding: 14, marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#1565C0', marginBottom: 4 }}>💡 푸드체이닝 — 이렇게 시작하세요</div>
              <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, lineHeight: 1.65 }}>
                새 식재료는 <b>평소 잘 먹는 음식(밥·계란·고기·치즈 등)에 조금씩 섞어</b> 시작하고, 익숙해지면 양을 늘려요. 거부해도 <b>소량 반복 노출(평균 8~15회, 최대 30번)</b>이 핵심 — 한 번 거부했다고 포기하지 마세요.
              </div>
            </div>

            {plan.days.map((d) => (
              <section key={d.day} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.brown, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${C.orange}` }}>{d.day}일차</div>
                {d.recipes.map((r, i) => <RecipeCard key={i} r={r} />)}
              </section>
            ))}

            <div style={{ fontSize: 11.5, color: C.sub, fontWeight: 600, background: '#FAFAFA', border: `1px solid ${C.line}`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 }}>
              ✅ 식단표에 빠졌던 <b>{plan.covered.join(' · ')}</b>를 채우는 구성이에요.
              {plan.missing.length ? <><br />· 레시피 준비 중인 식재료: {plan.missing.join(', ')}</> : null}
              <br />· 모든 레시피는 {ageLabel(age)} 연령 안전(식감·질식·알레르겐) 기준으로 작성됐어요. 알레르겐은 첫 노출 시 소량부터.
            </div>

            <a href={DAYCARE} style={{ display: 'block', textAlign: 'center', marginTop: 18, background: '#fff', border: `1.5px solid ${C.orange}`, color: C.brown, padding: 13, borderRadius: 12, fontWeight: 800, textDecoration: 'none' }}>📋 다른 달 식단 분석하기</a>
          </>
        )}
      </div>
    </main>
  );
}
