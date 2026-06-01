/**
 * sitemap.xml 자동 생성 — Next.js 15 표준
 * /foods + /foods/[slug] 147 URL
 */
import { loadPool } from '@/lib/ingredients';
import type { MetadataRoute } from 'next';

const BASE = 'https://www.mealfred.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const pool = loadPool();
  const now = new Date();
  const cats = Array.from(new Set(pool.map((p) => p.cat).filter(Boolean)));
  const grades = ['자주', '가끔', '드물게', '향신료'];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return [
    { url: `${BASE}/foods`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    ...pool.map((p) => ({
      url: `${BASE}/foods/${encodeURIComponent(p.nm)}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: p.must_eat || p.grade_label === '자주' ? 0.9 : p.grade_label === '가끔' ? 0.75 : 0.6,
    })),
    ...grades.map((g) => ({
      url: `${BASE}/foods/grade/${encodeURIComponent(g)}`,
      lastModified: now, changeFrequency: 'weekly' as const, priority: 0.85,
    })),
    ...cats.map((c) => ({
      url: `${BASE}/foods/category/${encodeURIComponent(c!)}`,
      lastModified: now, changeFrequency: 'weekly' as const, priority: 0.75,
    })),
    ...months.map((m) => ({
      url: `${BASE}/foods/season/${m}`,
      lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7,
    })),
  ];
}
