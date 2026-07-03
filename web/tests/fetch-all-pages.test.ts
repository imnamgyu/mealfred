/**
 * fetchAllPages — Supabase 1000행 응답 절단 대응 페이지 순회 헬퍼.
 * 2026-07-03 사고 회귀방지: institution_scores 15,752행에 .limit(5000)을 걸어도 1000행만 와서
 * /admin/institutions·/api/eval/rank·/api/institution/stats가 상위 1000행만 보고 계산하던 버그.
 */
import { describe, it, expect } from 'vitest';
import { fetchAllPages, chunk, type PageResult } from '../lib/fetchAllPages';

/** total행짜리 가짜 테이블(값=0..total-1) — count 제공 여부 선택. */
function makePager(total: number, withCount: boolean, calls?: Array<[number, number]>) {
  return async (from: number, to: number): Promise<PageResult<number>> => {
    calls?.push([from, to]);
    const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i);
    return { data, error: null, count: withCount ? total : undefined };
  };
}

describe('fetchAllPages', () => {
  it('count 있으면 첫 페이지 후 나머지를 병렬로 전량 수집 (2345행 → 3페이지)', async () => {
    const calls: Array<[number, number]> = [];
    const rows = await fetchAllPages(makePager(2345, true, calls), 1000);
    expect(rows.length).toBe(2345);
    expect(rows[0]).toBe(0);
    expect(rows[2344]).toBe(2344);
    expect(new Set(rows).size).toBe(2345);            // 중복/누락 없음
    expect(calls.length).toBe(3);
  });

  it('1페이지 미만이면 요청 1번으로 끝', async () => {
    const calls: Array<[number, number]> = [];
    const rows = await fetchAllPages(makePager(37, true, calls), 1000);
    expect(rows.length).toBe(37);
    expect(calls.length).toBe(1);
  });

  it('정확히 페이지 크기(1000행)여도 전량 수집', async () => {
    expect((await fetchAllPages(makePager(1000, true), 1000)).length).toBe(1000);
    expect((await fetchAllPages(makePager(1000, false), 1000)).length).toBe(1000);
  });

  it('count 없으면 짧은 페이지까지 순차 수집', async () => {
    const calls: Array<[number, number]> = [];
    const rows = await fetchAllPages(makePager(2500, false, calls), 1000);
    expect(rows.length).toBe(2500);
    expect(calls.length).toBe(3);
  });

  it('0행 → 빈 배열', async () => {
    expect(await fetchAllPages(makePager(0, true))).toEqual([]);
  });

  it('페이지 오류는 throw(조용한 부분 데이터 금지)', async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom');
  });
});

describe('chunk', () => {
  it('200개 단위로 자른다(.in() URI 한도 대응)', () => {
    const parts = chunk(Array.from({ length: 450 }, (_, i) => i), 200);
    expect(parts.map((p) => p.length)).toEqual([200, 200, 50]);
    expect(parts.flat().length).toBe(450);
  });
  it('빈 배열 → 빈 결과', () => {
    expect(chunk([], 200)).toEqual([]);
  });
});
