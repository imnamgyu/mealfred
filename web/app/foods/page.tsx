/**
 * /foods — 식재료 도감 메인 (SSG)
 * design-spec v3 베이지 톤 정합. 147종 그리드 + 등급 필터.
 */
import Link from 'next/link';
import { loadPool, type Ingredient } from '@/lib/ingredients';

export const dynamic = 'force-static';

export const metadata = {
  title: '밀프레드 식재료 도감 — 초등 입학 전 반드시 먹어놔야 할 식재료',
  description: '147종 영유아 식재료 영양·제철·SOS·레시피 가이드. 농진청 v10.4 + 2,041 레시피 DB.',
  openGraph: {
    title: '밀프레드 식재료 도감 — 필수 10종·권장 18종',
    description: '학교 급식 빈도 + KDRI 영양 + 안전성 통합 Must-Eat 점수. 무료.',
    type: 'website',
  },
};

const GRADE_COLOR: Record<string, string> = {
  '필수': 'bg-green-50 border-green-700 text-green-900',
  '권장': 'bg-yellow-50 border-yellow-700 text-yellow-900',
  '향신료': 'bg-purple-50 border-purple-300 text-purple-900',
};

function Card({ ing }: { ing: Ingredient }) {
  const hasEm = !!ing.em?.trim();
  const slug = encodeURIComponent(ing.nm);
  return (
    <Link
      href={`/foods/${slug}`}
      className="block rounded-2xl border p-4 text-center transition hover:-translate-y-1 hover:shadow-md"
      style={{ background: 'white', borderColor: 'var(--card-border, #FFE8D0)' }}
    >
      <div className="mt-2 mb-1 text-5xl leading-none min-h-[50px] flex items-center justify-center">
        {hasEm ? ing.em : (
          <span className="text-xs font-bold text-gray-400 bg-gray-50 rounded-full w-14 h-14 flex items-center justify-center px-1">
            {ing.cat.replace('_','·').split('·')[0]}
          </span>
        )}
      </div>
      <div className="text-sm font-extrabold text-[var(--navy)] leading-tight">{ing.nm}</div>
      <div className="text-[10px] text-[var(--brown-soft)] font-semibold mt-0.5">{ing.cat.replace('_','·')}</div>
      {ing.grade_label && (
        <div className={`inline-block mt-1.5 px-2 py-0.5 text-[9.5px] font-extrabold rounded-full ${
          ing.grade_label==='필수'?'bg-orange-100 text-orange-700':ing.grade_label==='권장'?'bg-yellow-100 text-yellow-700':'bg-purple-100 text-purple-700'
        }`}>{ing.grade_label}</div>
      )}
      <div className="text-[9px] text-gray-400 font-bold mt-1 font-mono">
        급식 {ing.v4_freq_total || ing.elem_count} · v4 {ing.v4_score?.toFixed(1) || '—'}
      </div>
    </Link>
  );
}

export default function FoodsPage() {
  const pool = loadPool();
  const groups = {
    필수: pool.filter((p) => p.grade_label === '필수'),
    권장: pool.filter((p) => p.grade_label === '권장'),
    향신료: pool.filter((p) => p.grade_label === '향신료'),
    기타: pool.filter((p) => !p.grade_label),
  };

  return (
    <main>
      <header className="hero">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-orange-50 border border-orange-200 text-orange-700 px-4 py-1.5 rounded-full text-xs font-bold mb-3">
            🗂 초등학교 급식 전에 반드시 먹어야 할 식재료들
          </span>
          <h1 className="text-3xl font-extrabold mb-2">밀프레드 식재료 도감</h1>
          <p className="text-sm">
            농진청 v10.4 + 2,041 레시피 DB · <strong>필수 {groups.필수.length}종 · 권장 {groups.권장.length}종</strong>
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {(['필수','권장','향신료','기타'] as const).map((g) => groups[g].length > 0 && (
          <section key={g}>
            <h2 className="text-lg font-extrabold mb-3 pb-2 border-b-2 border-orange-300 text-[var(--navy)]">
              {g === '필수' ? '⭐⭐⭐ 필수 (초등 입학 전 반드시)' : g === '권장' ? '⭐⭐ 권장 (먹을 줄 알면 좋음)' : g === '향신료' ? '🌿 향신료' : '📋 기타 식재료'}
              <span className="ml-2 text-xs font-medium text-[var(--brown-soft)]">{groups[g].length}종</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {groups[g].map((ing) => <Card key={ing.nm} ing={ing} />)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
