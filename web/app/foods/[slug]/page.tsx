/**
 * /foods/[slug] — 식재료 상세 (147 SSG)
 * 각 식재료에 대한 영양·SOS·레시피·안전 경고 풀 페이지.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPool, loadRecipes, findIngredient, KDRI_1_2Y, NUTRI_LABELS, nutriToStars } from '@/lib/ingredients';

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return loadPool().map((p) => ({ slug: p.nm }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ing = findIngredient(slug);
  if (!ing) return { title: '식재료를 찾지 못했어요 — 밀프레드' };
  return {
    title: `${ing.nm} — 밀프레드 식재료 도감 (영양·레시피·SOS)`,
    description: `${ing.nm} 영유아 영양 정보 · 농진청 v10.4 · ${ing.grade_label || '식재료'} · 학교 급식 ${ing.v4_freq_total || ing.elem_count || 0}회 등장`,
    openGraph: {
      title: `${ing.nm} — ${ing.grade_label || '식재료'} (밀프레드 도감)`,
      description: ing.v4_reason || `${ing.nm} 영양·제철·레시피 가이드`,
      type: 'article',
    },
  };
}

const SOS = ['👀 보기','✋ 만지기','👃 냄새','👅 핥기','🦷 씹기','🍽 삼키기'];

function NutriRow({ name, value, unit, rni }: { name: string; value: number; unit: string; rni: number }) {
  const s = nutriToStars(value, rni);
  if (!s) return null;
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-orange-50 text-sm">
      <span className="font-semibold text-[var(--navy)] min-w-[80px]">{name}</span>
      <span className="text-orange-700 font-bold">{'★'.repeat(s.s)}{'☆'.repeat(3-s.s)}</span>
      <span className="text-xs text-[var(--brown-soft)] flex-1">{value}{unit} · RNI {s.pct}% · {s.label}</span>
    </div>
  );
}

export default async function IngredientDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ing = findIngredient(slug);
  if (!ing) notFound();

  const recipesByIng = loadRecipes();
  const recipes = recipesByIng[ing.nm];
  const hasEm = !!ing.em?.trim();

  const nutriItems = ing.nutri ? Object.entries(ing.nutri)
    .map(([key, value]) => {
      const rni = KDRI_1_2Y[key]; const label = NUTRI_LABELS[key];
      if (!rni || !label || value == null) return null;
      const s = nutriToStars(value, rni);
      if (!s) return null;
      return { key, name: label[0], unit: label[1], value, ...s };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8) : [];

  return (
    <main className="max-w-3xl mx-auto px-5 py-6">
      <Link href="/foods" className="inline-block text-xs text-orange-700 font-bold mb-4">← 식재료 도감</Link>

      <header className="rounded-2xl p-5 mb-5 bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200">
        <div className="flex items-center gap-4">
          <div className="text-5xl">{hasEm ? ing.em : <span className="text-xs font-bold text-gray-400 bg-white rounded-full w-16 h-16 flex items-center justify-center px-1">{ing.cat.replace('_','·').split('·')[0]}</span>}</div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-[var(--navy)]">{ing.nm}</h1>
            <div className="flex flex-wrap gap-2 mt-1.5 text-xs">
              {ing.grade && <span className="font-bold text-orange-700">{ing.grade}</span>}
              {ing.grade_label && <span className="bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-bold">{ing.grade_label}</span>}
              <span className="text-[var(--brown-soft)]">{ing.cat.replace('_','·')}</span>
            </div>
          </div>
        </div>
        {ing.warning && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-800 font-semibold">⚠ {ing.warning}</div>
        )}
      </header>

      <section className="bg-white rounded-2xl border border-orange-100 p-5 mb-4 shadow-sm">
        <h2 className="text-sm font-extrabold text-orange-700 mb-3">━ 📊 학교 급식·영유아 등장 빈도 ━</h2>
        <p className="text-sm text-[var(--brown-mid)] leading-relaxed">
          학교 급식 통합 <strong className="text-[var(--navy)]">{ing.v4_freq_total || ing.elem_count || 0}회</strong> 등장.
          {ing.v4_score && <> · Must-Eat 점수 <strong>{ing.v4_score.toFixed(1)}</strong></>}
        </p>
        {ing.v4_reason && <p className="text-xs text-[var(--brown-soft)] mt-2 italic">{ing.v4_reason}</p>}
      </section>

      <section className="bg-white rounded-2xl border border-orange-100 p-5 mb-4 shadow-sm">
        <h2 className="text-sm font-extrabold text-orange-700 mb-3">━ 🧬 KDRI 영양 (만 1-2세 · 100g 당) ━</h2>
        {nutriItems.length > 0 ? (
          <>{nutriItems.map((n) => <NutriRow key={n.key} name={n.name} value={n.value} unit={n.unit} rni={KDRI_1_2Y[n.key]} />)}
          <p className="text-[10.5px] text-[var(--brown-soft)] mt-3">📊 출처: 농진청 v10.4 「{ing.nong_name || ing.nm}」 · KDRI 2025 만 1-2세 RNI/AI 대비 % 자동 계산</p></>
        ) : (
          <p className="text-xs text-[var(--brown-soft)]">영양 매핑 진행 중 (M2 alias 보정 예정)</p>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-orange-100 p-5 mb-4 shadow-sm">
        <h2 className="text-sm font-extrabold text-orange-700 mb-3">━ 🎯 친해지기 SOS 6단계 (Toomey) ━</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {SOS.map((s, i) => (
            <div key={i} className={`text-center text-[10px] font-bold px-1 py-2 rounded-lg ${i<2?'bg-orange-100 text-orange-700':'bg-gray-50 text-gray-400'}`}>
              <div className="text-base">{s.split(' ')[0]}</div>
              {s.split(' ')[1]}
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-[var(--brown-mid)] mt-3 font-semibold">강요는 거부를 강화합니다. 1단계부터 천천히 — 일주일 1-2 단계 진행 권장.</p>
      </section>

      <section className="bg-white rounded-2xl border border-orange-100 p-5 mb-4 shadow-sm">
        <h2 className="text-sm font-extrabold text-orange-700 mb-3">━ 🍳 추천 레시피 (2,041 레시피 DB) ━</h2>
        {recipes && recipes.top_recipes.length > 0 ? (
          <>
            <ul className="space-y-2">
              {recipes.top_recipes.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="bg-orange-50 text-orange-700 text-[9.5px] font-extrabold px-2 py-0.5 rounded-full shrink-0">{r.method}</span>
                  <span className="text-[var(--navy)]">{r.name}</span>
                  {r.allergens && <span className="text-[10px] text-gray-400">({r.allergens})</span>}
                </li>
              ))}
            </ul>
            <p className="text-[10.5px] text-[var(--brown-soft)] mt-3">💡 {ing.nm}이(가) 들어간 <strong>{recipes.total_count}개</strong> 레시피 중 조리법 다양성 기준 Top {recipes.top_recipes.length}.</p>
          </>
        ) : (
          <p className="text-xs text-[var(--brown-soft)]">DB 매칭 없음 — 가입 후 개인화 레시피로 안내 예정</p>
        )}
      </section>

      <Link href="/personal-coming.html" className="block bg-[var(--navy)] text-white rounded-xl p-4 text-center font-extrabold text-sm">
        ✨ 우리 아이만을 위한 레시피 받기 →
      </Link>
    </main>
  );
}
