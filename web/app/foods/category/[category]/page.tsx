/**
 * /foods/category/[category] — 카테고리별 모음 SSG
 * SEO: '잎채소 영유아·뿌리채소 추천' 등 카테고리 검색 타겟
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPool } from '@/lib/ingredients';

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const cats = new Set(loadPool().map((p) => p.cat).filter(Boolean));
  return Array.from(cats).map((c) => ({ category: encodeURIComponent(c!) }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const decoded = decodeURIComponent(category);
  return {
    title: `${decoded} 영유아 식재료 — 밀프레드 도감`,
    description: `${decoded} 카테고리 영유아·아동 식재료 영양·레시피·SOS 친해지기 가이드`,
    openGraph: { title: `${decoded} — 밀프레드 도감`, type: 'website' },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const decoded = decodeURIComponent(category);
  const items = loadPool().filter((p) => p.cat === decoded);
  if (items.length === 0) notFound();

  return (
    <main>
      <header className="hero">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-orange-50 border border-orange-200 text-orange-700 px-4 py-1.5 rounded-full text-xs font-bold mb-3">
            📂 카테고리
          </span>
          <h1 className="text-3xl font-extrabold mb-2">{decoded.replace('_','·')} {items.length}종</h1>
          <p className="text-sm">{decoded.replace('_','·')} 카테고리 영유아·아동 식재료 백과</p>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map((ing) => {
            const hasEm = !!ing.em?.trim();
            return (
              <Link
                key={ing.nm}
                href={`/foods/${encodeURIComponent(ing.nm)}`}
                className="block rounded-2xl border p-4 text-center transition hover:-translate-y-1 hover:shadow-md bg-white"
                style={{ borderColor: '#FFE8D0' }}
              >
                <div className="mt-2 mb-1 text-5xl leading-none min-h-[50px] flex items-center justify-center">
                  {hasEm ? ing.em : (
                    <span className="text-xs font-bold text-gray-400 bg-gray-50 rounded-full w-14 h-14 flex items-center justify-center px-1">
                      {decoded.split('·')[0]}
                    </span>
                  )}
                </div>
                <div className="text-sm font-extrabold text-[var(--navy)] leading-tight">{ing.nm}</div>
                {ing.grade_label && (
                  <div className="inline-block mt-1.5 px-2 py-0.5 text-[9.5px] font-extrabold rounded-full bg-orange-100 text-orange-700">{ing.grade_label}</div>
                )}
              </Link>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link href="/foods" className="text-sm text-orange-700 font-bold">← 전체 도감으로</Link>
        </div>
      </div>
    </main>
  );
}
