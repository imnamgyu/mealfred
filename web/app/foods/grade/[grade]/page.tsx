/**
 * /foods/grade/[grade] — 등급별 모음 SSG (필수·권장·향신료)
 * SEO: '초등 입학 전 필수 식재료', '권장 식재료' 등 검색 타겟
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPool, listByGrade } from '@/lib/ingredients';

export const dynamic = 'force-static';
export const dynamicParams = false;

const GRADE_MAP: Record<string, { label: string; desc: string; emoji: string }> = {
  '필수':   { label: '필수 식재료',   desc: '초등 입학 전에 반드시 친해져야 할 식재료 (v4 S+A 등급)', emoji: '⭐⭐⭐' },
  '권장':   { label: '권장 식재료',   desc: '먹을 줄 알면 좋은 식재료 (v4 B+C 등급)', emoji: '⭐⭐' },
  '향신료': { label: '향신료',         desc: '향신·양념 식재료', emoji: '🌿' },
};

export async function generateStaticParams() {
  return Object.keys(GRADE_MAP).map((grade) => ({ grade }));
}

export async function generateMetadata({ params }: { params: Promise<{ grade: string }> }) {
  const { grade } = await params;
  const decoded = decodeURIComponent(grade);
  const info = GRADE_MAP[decoded];
  if (!info) return { title: '등급을 찾지 못했어요' };
  return {
    title: `${info.label} — 밀프레드 식재료 도감`,
    description: info.desc,
    openGraph: { title: `${info.emoji} ${info.label}`, description: info.desc, type: 'website' },
  };
}

export default async function GradePage({ params }: { params: Promise<{ grade: string }> }) {
  const { grade } = await params;
  const decoded = decodeURIComponent(grade);
  const info = GRADE_MAP[decoded];
  if (!info) notFound();
  const items = listByGrade(decoded as '필수' | '권장' | '향신료');

  return (
    <main>
      <header className="hero">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-orange-50 border border-orange-200 text-orange-700 px-4 py-1.5 rounded-full text-xs font-bold mb-3">
            {info.emoji} {info.label}
          </span>
          <h1 className="text-3xl font-extrabold mb-2">{info.label} {items.length}종</h1>
          <p className="text-sm">{info.desc}</p>
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
                      {ing.cat.replace('_','·').split('·')[0]}
                    </span>
                  )}
                </div>
                <div className="text-sm font-extrabold text-[var(--navy)] leading-tight">{ing.nm}</div>
                <div className="text-[10px] text-[var(--brown-soft)] font-semibold mt-0.5">{ing.cat.replace('_','·')}</div>
                <div className="text-[9px] text-gray-400 font-bold mt-1 font-mono">
                  v4 {ing.v4_score?.toFixed(1) || '—'}
                </div>
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
