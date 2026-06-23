-- 2026-06-23 일일 전역 OCR 상한 보험(이사님): 정상 스파이크·악용 모두에 비용 천장.
-- /api/ocr가 비싼 CLOVA+Sonnet 호출 전에 incr_ocr_budget()를 원자적으로 호출 → 당일 누계 > OCR_DAILY_CAP(env, 기본 5000)면 안내 반환.
-- 코드는 RPC가 없어도/장애여도 통과(가용성 우선)하므로, 이 SQL을 실행해야 상한이 '활성화'됨.
-- Supabase SQL editor에서 1회 실행.

create table if not exists public.ocr_budget (
  day   date primary key,
  count int  not null default 0
);

-- 원자적 증가 후 당일 누계 반환(insert ... on conflict ... returning = 단일 원자 구문 → 버스트에도 정확).
create or replace function public.incr_ocr_budget() returns int
  language sql
as $$
  insert into public.ocr_budget(day, count) values (current_date, 1)
  on conflict (day) do update set count = ocr_budget.count + 1
  returning count;
$$;

-- 모니터링: 오늘 사용량
--   select * from public.ocr_budget where day = current_date;
-- 상한 조정: Vercel 환경변수 OCR_DAILY_CAP (미설정 시 5000).
