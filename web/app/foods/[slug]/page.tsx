/**
 * /foods/[slug] — 식재료 상세 (147 SSG)
 * care.html 디자인 통일: 흰 카드 + 부드러운 헤더 + 영양 빈도 바(별점 대신).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPool, loadRecipes, loadFreqRecipes, findIngredient, KDRI_1_2Y, NUTRI_LABELS, nutriToStars, isSpicyDish } from '@/lib/ingredients';
import RefusedBadge from '@/components/RefusedBadge';
import MasteryBadge from '@/components/MasteryBadge';
import { cookingGuide } from '@/lib/cookingMatrix';

// SOS 식감 난이도 순서 (부드러움 → 단단함) — 거부 식재료 친해지기 정렬
function textureRank(method: string): number {
  const m = method || '';
  if (/죽|미음|퓨레|수프/.test(m)) return 1;
  if (/국|탕|찌개/.test(m)) return 2;
  if (/무침|나물|샐러드/.test(m)) return 3;
  if (/조림|찜/.test(m)) return 4;
  if (/볶음|구이|전|튀김|밥|면/.test(m)) return 5;
  return 3;
}

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

const SOS = ['👀 보기', '✋ 만지기', '👃 냄새', '👅 핥기', '🦷 씹기', '🍽 삼키기'];

// 영양 한 줄 — care.html nutri-row 스타일(이름 + 빈도 바 + RNI%·라벨)
function NutriBar({ name, value, unit, pct, label }: { name: string; value: number; unit: string; pct: number; label: string }) {
  const color = pct >= 67 ? '#16A085' : pct >= 34 ? '#F9A825' : '#9CA3AF';
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: '#1a2b4a', width: '74px' }}>{name}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#F0F0F0' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color }} />
      </div>
      <span className="text-[10.5px] font-bold text-right flex-shrink-0" style={{ color: '#6B7280', width: '92px' }}>{value}{unit} · RNI {pct}%</span>
    </div>
  );
}

export default async function IngredientDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ing = findIngredient(slug);
  if (!ing) notFound();

  const recipesByIng = loadRecipes();
  const recipes = recipesByIng[ing.nm];
  // 영유아 — 매운 메뉴는 추천에서 제외
  const safeRecipes = recipes ? [...recipes.top_recipes].filter((r) => !isSpicyDish(r.name)) : [];
  const freqRecipes = (loadFreqRecipes()[ing.nm] || []).filter((r) => !isSpicyDish(r.name));   // 급식 빈도 기반 '또래가 잘 먹는 음식'
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
    <main className="max-w-md mx-auto min-h-screen px-5 py-6" style={{ background: '#FFFDFB' }}>
      <Link href="/foods" className="inline-block text-xs font-bold mb-4" style={{ color: '#C45A00' }}>← 식재료 도감</Link>

      {/* 헤더 카드 (care.html score-card 스타일) */}
      <header className="rounded-2xl p-5 mb-3" style={{ background: 'linear-gradient(135deg,#FFF8F2,#FFE8D0)', border: '1.5px solid #FFD8B0' }}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl flex-shrink-0" style={{ background: 'white' }}>
            {hasEm ? ing.em : <span className="text-[11px] font-bold" style={{ color: '#9CA3AF' }}>{ing.cat.replace('_', '·').split('·')[0]}</span>}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold" style={{ color: '#1a2b4a' }}>{ing.nm}</h1>
            <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs items-center">
              {ing.grade_label && <span className="px-2 py-0.5 rounded-full font-extrabold" style={{ background: '#FFE0C0', color: '#C45A00' }}>{ing.grade && ing.grade.startsWith('⭐') ? ing.grade + ' ' : ''}{ing.grade_label}</span>}
              <span style={{ color: '#8a7a6a' }}>{ing.cat.replace('_', '·')}</span>
            </div>
            {ing.grade_reason && <div className="text-[11px] mt-1.5 leading-relaxed" style={{ color: '#8a7a6a' }}>{ing.grade_reason}</div>}
          </div>
        </div>
        {ing.warning && (
          <div className="mt-3 rounded-lg p-2.5 text-xs font-semibold" style={{ background: '#FFF5F5', border: '1px solid #FFCDD2', color: '#C62828' }}>⚠ {ing.warning}</div>
        )}
      </header>

      <section className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
        <h2 className="text-sm font-extrabold mb-2" style={{ color: '#1a2b4a' }}>📊 학교 급식·영유아 등장 빈도</h2>
        <p className="text-[13px] leading-relaxed" style={{ color: '#5a4a3a' }}>
          학교 급식 통합 <strong style={{ color: '#1a2b4a' }}>{ing.v4_freq_total || ing.elem_count || 0}회</strong> 등장.
          {ing.v4_score && <> · Must-Eat 점수 <strong>{ing.v4_score.toFixed(1)}</strong></>}
        </p>
        {ing.v4_reason && <p className="text-[11.5px] mt-2 italic" style={{ color: '#8a7a6a' }}>{ing.v4_reason}</p>}
      </section>

      <section className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>🧬 KDRI 영양 <span className="font-normal text-[11px]" style={{ color: '#9CA3AF' }}>만 1-2세 · 100g당</span></h2>
        </div>
        {nutriItems.length > 0 ? (
          <>
            {nutriItems.map((n) => <NutriBar key={n.key} name={n.name} value={n.value} unit={n.unit} pct={n.pct} label={n.label} />)}
            <p className="text-[10px] mt-3" style={{ color: '#9CA3AF' }}>📊 출처: 농진청 v10.4 「{ing.nong_name || ing.nm}」 · KDRI 2025 만 1-2세 RNI/AI 대비 % 자동 계산</p>
          </>
        ) : (
          <p className="text-xs" style={{ color: '#8a7a6a' }}>영양 매핑 진행 중 (M2 alias 보정 예정)</p>
        )}
      </section>

      <section className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
        <h2 className="text-sm font-extrabold mb-3" style={{ color: '#1a2b4a' }}>🎯 친해지기 SOS 6단계 <span className="font-normal text-[11px]" style={{ color: '#9CA3AF' }}>(Toomey)</span></h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {SOS.map((s, i) => (
            <div key={i} className="text-center text-[10px] font-bold px-1 py-2 rounded-lg" style={i < 2 ? { background: '#FFF0E0', color: '#C45A00' } : { background: '#FAFAF7', color: '#9CA3AF' }}>
              <div className="text-base">{s.split(' ')[0]}</div>
              {s.split(' ')[1]}
            </div>
          ))}
        </div>
        <p className="text-[11.5px] mt-3 font-semibold" style={{ color: '#5a4a3a' }}>강요는 거부를 강화합니다. 1단계부터 천천히 — 일주일 1-2 단계 진행 권장.</p>
      </section>

      <MasteryBadge ingredient={ing.nm} />
      <RefusedBadge ingredient={ing.nm} />

      {freqRecipes.length > 0 && (
        <section className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
          <h2 className="text-sm font-extrabold mb-1" style={{ color: '#1a2b4a' }}>👶 또래가 잘 먹는 음식</h2>
          <p className="text-[11px] mb-3" style={{ color: '#8a7a6a' }}>전국 어린이집·학교 급식에 자주 오른 = 또래 아이들이 실제로 잘 먹는 검증된 메뉴예요. <strong>꼭 새로 만들 필욘 없어요</strong> — 아래 <strong>우리 아이 맞춤</strong>처럼 좋아하는 음식에 {ing.nm} 섞기부터 시작해도 돼요.</p>
          <ul className="space-y-1.5">
            {freqRecipes.map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-sm py-0.5">
                <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full shrink-0" style={{ background: '#EAF6F0', color: '#16A085' }}>급식 {r.freq}회</span>
                <span style={{ color: '#1a2b4a', fontWeight: 600 }}>{r.name}</span>
                {r.share >= 0.4 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: '#FFF0E0', color: '#C45A00' }}>주재료</span>}
                <span className="text-[10px] ml-auto shrink-0 tabular-nums" style={{ color: '#9CA3AF' }}>유{r.u}·초{r.e}·중{r.h}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] mt-3" style={{ color: '#8a7a6a' }}>💡 ‘급식 N회’ = 전국 식단표에 오른 빈도, ‘유·초·중’ = 유아·초등·중고 식단 등장 횟수. 자주·여러 연령에서 나올수록 두루 사랑받는 음식이에요.</p>
        </section>
      )}

      {(() => {
        const cg = cookingGuide(ing.cat);
        return cg.length > 0 ? (
          <section className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
            <h2 className="text-sm font-extrabold mb-1" style={{ color: '#1a2b4a' }}>📐 {ing.nm} 어떻게 줄까 <span className="font-normal text-[11px]" style={{ color: '#9CA3AF' }}>· 정부 식단 12,454개 평균</span></h2>
            <p className="text-[11px] mb-3" style={{ color: '#8a7a6a' }}>한 끼 표준 분량이에요. 아이는 <strong>한 입부터</strong> 줄여서, 양념은 영유아 기준 최소로.</p>
            <ul className="space-y-1.5">
              {cg.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm py-0.5">
                  <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full shrink-0" style={{ background: '#FFF0E0', color: '#C45A00' }}>{c.method}</span>
                  <span style={{ color: '#1a2b4a' }}>{ing.nm} 약 <strong>{Math.round(c.g)}g</strong></span>
                  <span className="text-[10.5px] ml-auto text-right shrink-0" style={{ color: '#9CA3AF' }}>{c.season}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })()}

      <section className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
        <h2 className="text-sm font-extrabold mb-1" style={{ color: '#1a2b4a' }}>🍳 친해지기 레시피</h2>
        <p className="text-[11px] mb-3" style={{ color: '#8a7a6a' }}>부드러운 요리부터 순서대로 — 죽·국으로 먼저, 익숙해지면 볶음·구이로</p>
        {safeRecipes.length > 0 ? (
          <>
            <ul className="space-y-2">
              {safeRecipes.sort((a, b) => textureRank(a.method) - textureRank(b.method)).map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-[9px] font-extrabold w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-white" style={{ background: ['#16A085', '#16A085', '#F9A825', '#E67E22', '#C62828'][textureRank(r.method) - 1] }}>{textureRank(r.method)}</span>
                  <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full shrink-0" style={{ background: '#FFF0E0', color: '#C45A00' }}>{r.method}</span>
                  <span style={{ color: '#1a2b4a' }}>{r.name}</span>
                  {r.allergens && <span className="text-[10px]" style={{ color: '#9CA3AF' }}>({r.allergens})</span>}
                </li>
              ))}
            </ul>
            <p className="text-[10px] mt-3" style={{ color: '#8a7a6a' }}>💡 {ing.nm}이(가) 들어간 <strong>{recipes.total_count}개</strong> 레시피 중 식감 난이도 순 Top {safeRecipes.length}. 숫자 1(부드러움)→5(단단함) 순으로 도전하세요.</p>
          </>
        ) : (
          <p className="text-xs" style={{ color: '#8a7a6a' }}>DB 매칭 없음 — 가입 후 개인화 레시피로 안내 예정</p>
        )}
      </section>

      <Link href="/care" className="block rounded-xl p-4 text-center font-extrabold text-sm text-white" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>
        ✏️ 우리 아이 식사 기록하러 가기 →
      </Link>
    </main>
  );
}
