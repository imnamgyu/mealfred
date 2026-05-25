-- T706 — Supabase schema for Food Chaining 4축 LLM-Lite MVP
-- 2026-05-14 · Sprint M-A · Phase 9-MVP
--
-- 적용 방법:
--   1) Supabase Studio (mealfred 기존 프로젝트 또는 신규) → SQL editor에 본 파일 붙여넣기
--   2) RLS 정책은 본 파일 하단에 명시 (mvp_logs는 service_role만 insert)
--   3) 시드 데이터 import는 별도 `seed.sql` 실행 (T707)

-- ========== 1. foods (시드 30개 + 향후 확장) ==========
create table if not exists public.foods (
  id              integer primary key,
  name_ko         text not null unique,
  category        text not null,        -- 9코스 / 친숙 / 한식
  tier            text not null,        -- course / tier1 / korean
  color           integer not null,     -- 0~9
  temperature     integer not null,     -- 0~3
  texture         integer not null,     -- 0~5
  flavor          integer not null,     -- 0~7
  allergens       jsonb default '[]'::jsonb,
  min_age_months  integer default 12,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_foods_category on public.foods(category);
create index if not exists idx_foods_tier     on public.foods(tier);

-- ========== 2. chains (선택 — 생성 결과 저장. MVP는 미사용. v1.5 진입 시 활성화) ==========
create table if not exists public.chains (
  id              bigserial primary key,
  created_at      timestamptz default now(),
  user_session    text,                                  -- 익명 세션 ID (uuid 또는 localStorage)
  liked_foods     text[] not null,
  refused_food    text not null,
  age_months      integer not null,
  allergens       jsonb default '[]'::jsonb,
  bridge_sequence jsonb not null,                        -- LLM 출력 그대로
  confidence      numeric(3,2),
  axes_used       jsonb default '[]'::jsonb              -- ["color","texture",...]
);

create index if not exists idx_chains_created on public.chains(created_at desc);

-- ========== 3. mvp_logs (alpha 디버깅 — 응답시간·비용 측정) ==========
create table if not exists public.mvp_logs (
  id               bigserial primary key,
  created_at       timestamptz default now(),
  request_id       uuid default gen_random_uuid(),
  input_liked      text[] not null,
  input_refused    text not null,
  input_age        integer not null,
  input_allergens  jsonb default '[]'::jsonb,
  output_json      jsonb,
  llm_model        text default 'claude-sonnet-4-6',
  llm_input_tokens integer,
  llm_output_tokens integer,
  llm_latency_ms   integer,
  llm_cost_usd     numeric(10,6),
  status           text default 'ok',                    -- ok | error | timeout
  error_message    text
);

create index if not exists idx_mvp_logs_created on public.mvp_logs(created_at desc);
create index if not exists idx_mvp_logs_status  on public.mvp_logs(status);

-- ========== 4. RLS (Row-Level Security) ==========
alter table public.foods     enable row level security;
alter table public.chains    enable row level security;
alter table public.mvp_logs  enable row level security;

-- foods: 누구나 읽기 가능 (시드 DB는 공개)
drop policy if exists foods_select_public on public.foods;
create policy foods_select_public on public.foods
  for select using (true);

-- chains: anon은 자신 세션만 (MVP는 미사용이지만 미리 정의)
drop policy if exists chains_select_own on public.chains;
create policy chains_select_own on public.chains
  for select using (true);  -- MVP는 익명 공개 (v1.5에서 세션 격리)

drop policy if exists chains_insert_anon on public.chains;
create policy chains_insert_anon on public.chains
  for insert with check (true);

-- mvp_logs: anon은 insert만 가능, select는 service_role만
drop policy if exists mvp_logs_insert_anon on public.mvp_logs;
create policy mvp_logs_insert_anon on public.mvp_logs
  for insert with check (true);

-- (mvp_logs SELECT는 정책 정의하지 않음 → service_role만 가능)

-- ========== 5. 무결성 체크 (검증용 SELECT) ==========
-- select count(*) from public.foods;                        -- 30 기대
-- select category, count(*) from public.foods group by 1;   -- 9코스 9 / 친숙 15 / 한식 6
-- select * from public.mvp_logs order by created_at desc limit 5;

-- ========== 6. 변경 이력 ==========
-- 2026-05-14: v1 — T706 골격. foods / chains / mvp_logs 3 테이블 + RLS 기본 정책.
