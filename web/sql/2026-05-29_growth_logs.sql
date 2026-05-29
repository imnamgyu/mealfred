-- 체위(키·몸무게) 시계열 + 성별 — BMI-for-age 퍼센타일(WHO/질병관리청 기준)용.
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

-- 1) 성별 (BMI 퍼센타일은 성별로 다름)
alter table public.children add column if not exists sex text;  -- 'M'(남아) | 'F'(여아) | null
comment on column public.children.sex is 'BMI-for-age 퍼센타일용 성별: M(남아)/F(여아)/null';

-- 2) 체위 시계열 테이블 (날짜별 키·몸무게 — 언제든 추가)
create table if not exists public.growth_logs (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_id uuid,
  measured_on date not null,
  height_cm numeric,
  weight_kg numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (child_id, measured_on)
);
comment on table public.growth_logs is '아이 체위(키·몸무게) 시계열 — 날짜별 1행, BMI/성장 추세용';

create index if not exists growth_logs_child_date on public.growth_logs (child_id, measured_on desc);

-- 3) RLS — 부모 본인 자녀 데이터만 (meal_logs와 동일 패턴)
alter table public.growth_logs enable row level security;
drop policy if exists growth_logs_owner on public.growth_logs;
create policy growth_logs_owner on public.growth_logs
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- 4) 기존 children의 단일 키·몸무게(온보딩 1회 입력값)를 첫 측정 행으로 이관
insert into public.growth_logs (child_id, parent_id, measured_on, height_cm, weight_kg)
select id, parent_id, coalesce(created_at::date, current_date), height_cm, weight_kg
from public.children
where height_cm is not null or weight_kg is not null
on conflict (child_id, measured_on) do nothing;
