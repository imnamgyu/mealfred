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
  return [
    { url: `${BASE}/foods`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    ...pool.map((p) => ({
      url: `${BASE}/foods/${encodeURIComponent(p.nm)}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: p.grade_label === '필수' ? 0.9 : p.grade_label === '권장' ? 0.8 : 0.6,
    })),
  ];
}
