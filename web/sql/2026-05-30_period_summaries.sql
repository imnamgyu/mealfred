-- 병원 차트형 기간 요약 — 주/월(추후 분기·연) 단위로 그 아이의 편식·영양·체위 스냅샷 누적.
-- 새벽 코칭 크론이 매일 현재 주·달을 다시 계산해 upsert(멱등). 어드민 쓰레드에서 시계열로 검토 = '의무기록'.
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

create table if not exists public.period_summaries (
  child_id    uuid not null references public.children(id) on delete cascade,
  period_type text not null,                 -- 'week' | 'month'
  period_key  text not null,                 -- 'week'→'2026-W22', 'month'→'2026-05'
  metrics     jsonb not null,                -- {variety, refusalPct, enjoyPct, avgDur, entries, eatenAccepted, reds, bmiPct, ...}
  updated_at  timestamptz not null default now(),
  primary key (child_id, period_type, period_key)
);
create index if not exists period_summaries_child_idx on public.period_summaries (child_id, period_type, period_key desc);
alter table public.period_summaries enable row level security;
-- 본인 자녀 것만 조회(쓰기는 서비스 로우=크론). 어드민은 service_role로 전체 열람.
drop policy if exists period_summaries_select_own on public.period_summaries;
create policy period_summaries_select_own on public.period_summaries
  for select using (child_id in (select id from public.children where parent_id = auth.uid()));
