/**
 * GET /api/affinity?food=감자 — 식재료의 궁합 이웃(정적 그래프 우선, 없으면 LLM 폴백·캐시).
 * PersonalBridge가 빌드타임 정적 neighbors가 빈 식재료에 한해 호출(Phase B 하이브리드).
 */
import { affinityNeighbors } from '@/lib/affinity';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const food = new URL(req.url).searchParams.get('food')?.trim();
  if (!food) return Response.json({ neighbors: [], source: 'none' });
  try {
    const r = await affinityNeighbors(food);
    // 24h CDN 캐시 — 같은 식재료 폴백은 자주 안 바뀜
    return Response.json(r, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch (e) {
    return Response.json({ neighbors: [], source: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
