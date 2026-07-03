/**
 * Supabase(PostgREST)는 응답을 요청당 최대 1000행으로 절단한다 — .limit(5000)·.limit(100000)을 줘도 1000행만 온다(2026-07-03 실측).
 * 전량이 필요한 집계(코호트 순위·어드민 리스트·통계)는 반드시 이 헬퍼로 1000행씩 range 순회한다.
 *
 * 사용 규칙:
 *  - pager는 반드시 "안정적 유니크 정렬"(예: .order('institution_id').order('month'))을 포함할 것 — 없으면 페이지 간 중복/누락.
 *  - select에 { count: 'exact' }를 주면 첫 페이지 이후를 병렬로 당긴다(왕복 2회). 없으면 짧은 페이지가 나올 때까지 순차.
 *  - 페이지 오류는 throw — 조용한 부분 데이터(절단)로 계산하는 것보다 실패가 낫다.
 *  - 알려진 트레이드오프: offset 순회라 요청 사이에 신규 insert/delete가 끼면 경계 행 1건이 중복/누락될 수 있다
 *    (예: 식단표 import 도중 조회). 일시적이며 다음 로드에서 자가 복구 — 집계/리스트 용도라 수용(keyset 커서는 과설계).
 */
export type PageResult<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

export async function fetchAllPages<T>(
  pager: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const first = await pager(0, pageSize - 1);
  if (first.error) throw new Error(first.error.message);
  const rows: T[] = [...(first.data || [])];
  if (rows.length < pageSize) return rows;

  const total = typeof first.count === 'number' ? first.count : null;
  if (total != null) {
    const pages = Math.ceil(total / pageSize);
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => pager((i + 1) * pageSize, (i + 2) * pageSize - 1)),
    );
    for (const p of rest) {
      if (p.error) throw new Error(p.error.message);
      rows.push(...(p.data || []));
    }
    return rows;
  }

  for (let from = pageSize; ; from += pageSize) {
    const p = await pager(from, from + pageSize - 1);
    if (p.error) throw new Error(p.error.message);
    rows.push(...(p.data || []));
    if ((p.data || []).length < pageSize) return rows;
  }
}

/** .in() 배치용 — id 수천 개를 한 URL에 넣으면 URI 한도 초과. size개씩 잘라 병렬 조회에 쓴다. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
