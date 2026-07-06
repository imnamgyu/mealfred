-- ⭐ 레시피 DB — 식단표 상위 메뉴 × 연령대별 1인분 레시피 (이사님 2026-07-06)
--   목적: 어린이집·유치원·초등 식단표 빈도 상위 ~1,000메뉴의 "가정 재현용 소량 레시피"를
--        재료 g(0.1g 단위 간 포함)·조리 순서·나트륨 역산까지 구조화 적재.
--   소스 2종:
--     standard     = 식약처 어린이급식관리지원센터 표준레시피(01_참고자료/B_레시피DB, 재료 1인분 g 원본)
--     ai_generated = 표준레시피에 없는 메뉴를 유사 표준레시피+배식량·염도 기준으로 생성(전량 draft, 검수 필요)
--   나트륨 = Σ(재료 g × nong_foods.nutrients.sodium_mg/100) 결정론 역산 — 표준레시피 영양표에 나트륨이 없어 자체 계산.
--     한계: 건조 재료(건미역 등)는 불림·헹굼 손실 미반영 → 과대추정 방향(안전 방향). sodium_detail에 재료별 기여 기록.
--   ⚠️ 저작권: method_raw(원문 조리법)는 내부 참고 전용. 공개 노출은 method_rewritten=true(자체 재작성)만.
--   additive · 기존 테이블 무영향.

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  menu_norm text not null,                       -- 정규화 메뉴명(공백·괄호 제거, 쇠고기→소고기 등 병합키)
  title text not null,                           -- 표시명(원 레시피명)
  age_band text not null check (age_band in ('1-2세','3-5세','6-11세','12-18세')),
  dish_type text check (dish_type in ('soup','rice_main','side_main','side','noodle','snack','etc')),
  source text not null check (source in ('standard','ai_generated')),
  source_ref text,                               -- 원 레시피명·파일 (standard) / 생성 근거 (ai)
  servings numeric not null default 1,           -- 1 = 해당 연령 1인분
  yield_g numeric,                               -- 재료 총량(물 제외)
  steps jsonb not null default '[]'::jsonb,      -- ["①…","②…"] 파싱된 조리 순서
  method_raw text,                               -- 원문 조리법(내부 전용 — 공개 금지)
  method_rewritten boolean not null default false, -- true = 공개 가능한 자체 재작성본이 steps에 반영됨
  allergens text[] not null default '{}',
  nutrition jsonb,                               -- 표준레시피 원 영양표(에너지·탄단지 등 — 나트륨 없음)
  sodium_mg numeric,                             -- ⭐ 역산 나트륨(1인분, mg)
  sodium_detail jsonb,                           -- {covered_g, total_g, items:[{name,g,na}], missing:[...]}
  energy_kcal_computed numeric,                  -- 역산 에너지(원 영양표와 교차검증용)
  na_flag text check (na_flag in ('ok','review','over')), -- 제안 기준: 3-5세 ok≤350<review≤550<over / 6-11세 ok≤550<review≤900<over (확정 전 제안치)
  demand jsonb,                                  -- 식단표 수요 {"elementary":{"rank":1,"n":6701,"insts":791},...}
  status text not null default 'draft' check (status in ('draft','verified','live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_norm, age_band)
);

create index if not exists recipes_band_status_idx on public.recipes (age_band, status);
create index if not exists recipes_menu_norm_idx on public.recipes (menu_norm);

create table if not exists public.recipe_ingredients (
  id bigint generated always as identity primary key,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  position int not null,
  name_raw text not null,                        -- 원 표기 예: "소고기, 한우, 양지, 생것"
  ingredient_norm text,                          -- 표준명(용어사전·도감 연결) — 미매칭 null
  nong_name text,                                -- 매칭된 nong_foods.name (영양 근거 추적)
  amount_g numeric not null,
  amount_display text,                           -- 가정 계량 병기 예: "1/2티스푼", "한 꼬집"
  is_seasoning boolean not null default false,   -- 소금·장류·기름 등 (간 보정 대상)
  sodium_mg numeric                              -- 이 재료의 나트륨 기여분(mg)
);

create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);
create index if not exists recipe_ingredients_norm_idx on public.recipe_ingredients (ingredient_norm);

-- RLS: 직접 접근 차단 — 읽기/쓰기 모두 service_role(어드민·빌드 스크립트)만. 공개 시점에 status='live' 한정 정책 추가 예정.
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

comment on table public.recipes is '식단표 상위 메뉴 연령대별 1인분 레시피(표준레시피+AI생성). 나트륨은 nong_foods 역산. method_raw는 내부 전용.';
comment on table public.recipe_ingredients is '레시피 재료(1인분 g). nong_name으로 영양 근거 추적, ingredient_norm으로 도감·표준명 연결.';
comment on column public.recipes.sodium_mg is 'Σ(재료g × nong_foods sodium_mg/100). 건조 재료 불림 손실 미반영(과대추정 방향).';
comment on column public.recipes.na_flag is '제안 기준(확정 전): 3-5세 ok≤350/review≤550/over>550 · 6-11세 ok≤550/review≤900/over>900 (mg/1인분).';
