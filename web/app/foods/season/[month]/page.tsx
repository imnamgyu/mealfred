/**
 * /foods/season/[month] — 월별 제철 식재료 SSG (1-12월)
 * SEO: '3월 제철 식재료', '봄 식단' 등 시즌 검색 타겟
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPool } from '@/lib/ingredients';

export const dynamic = 'force-static';
export const dynamicParams = false;

const SEASON_MAP: Record<number, string[]> = {
  1: ['배추','무','시금치','대구','명태'],
  2: ['시금치','달래','대구','명태'],
  3: ['딸기','달래','쑥','냉이','미나리'],
  4: ['딸기','달래','쑥','쪽파'],
  5: ['딸기','마늘','참외'],
  6: ['감자','마늘','갈치'],
  7: ['수박','복숭아','옥수수','오이','가지'],
  8: ['수박','복숭아','옥수수','가지','전복','오징어'],
  9: ['배','포도','감','연근','고등어','전어'],
  10: ['배','감','사과','밤','고구마','연어'],
  11: ['배','사과','감','무','배추','대구'],
  12: ['귤','배추','무','시금치','대구','명태'],
};

export async function generateStaticParams() {
  return Array.from({ length: 12 }, (_, i) => ({ month: String(i + 1) }));
}

export async function generateMetadata({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  return {
    title: `${month}월 제철 식재료 — 밀프레드 도감`,
    description: `${month}월 영유아·아동에게 좋은 제철 식재료 모음. 영양·레시피·친해지기 가이드`,
  };
}

export default async function SeasonPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const m = parseInt(month);
  if (!m || m < 1 || m > 12) notFound();
  const seasonal = SEASON_MAP[m] || [];
  const pool = loadPool();
  const items = pool.filter((p) => seasonal.includes(p.nm));
  const currentMonth = new Date().getMonth() + 1;
  const isCurrent = m === currentMonth;

  return (
    <main>
      <header className="px-6 pt-8 pb-5" style={{ background: 'linear-gradient(135deg,#FFF8F2,#FFE8D0)' }}>
        <div className="max-w-3xl mx-auto">
          <Link href="/foods" className="text-xs font-bold" style={{ color: '#C45A00' }}>← 도감</Link>
          <span className="inline-block mt-2.5 mb-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold" style={{ background: '#FFE0C0', color: '#C45A00' }}>🌸 {m}월 제철 {isCurrent && '· 지금이 제철!'}</span>
          <h1 className="text-2xl font-extrabold" style={{ color: '#1a2b4a' }}>{m}월 제철 식재료 {items.length}종</h1>
          <p className="text-[13px] mt-1" style={{ color: '#8a7a6a' }}>제철 식재료는 영양 가치가 높고 우리 아이가 자연스럽게 친해지기 좋아요.</p>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {items.length > 0 ? (
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
                        {ing.cat.replace('_','·').split('·')[0]}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-extrabold text-[var(--navy)] leading-tight">{ing.nm}</div>
                  <div className="text-[10px] text-[var(--brown-soft)] font-semibold mt-0.5">{ing.cat.replace('_','·')}</div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-[var(--brown-soft)]">{m}월 제철 식재료는 도감에 없거나 정리 중이에요.</p>
        )}
        <div className="mt-8 flex justify-center gap-4 flex-wrap">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mn) => (
            <Link key={mn} href={`/foods/season/${mn}`} className={`text-xs font-bold px-3 py-1.5 rounded-full ${mn===m?'bg-orange-500 text-white':'bg-orange-50 text-orange-700'}`}>
              {mn}월
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/foods" className="text-sm text-orange-700 font-bold">← 전체 도감으로</Link>
        </div>
      </div>
    </main>
  );
}
