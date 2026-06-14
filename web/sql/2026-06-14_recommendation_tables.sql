-- 추천 데이터 SQL 전환 — DDL (정정본)
--
-- ⚠️ 첫 시도가 'create table ingredients'로 42703 에러: ingredients 테이블이 이미 존재(147·도감·nutri_per_100g 인라인).
--    → 새 ingredients/dogam 안 만든다. 기존 ingredients 재사용:
--        status='verified'(현 147=도감) + 'seen'(분해에서 나온 유니버스 식재료) 로 구분.
--        영양은 ingredients.nutri_per_100g(jsonb) 인라인 → nong_foods 조인 불필요.
--    이 파일은 '빈 테이블 3개 + 컬럼 2개'만 만든다(additive·안전). 데이터 채우기(이관)는 별도 service_role 스크립트.
--
-- 실행: Supabase SQL Editor에 통째 붙여넣고 RUN. 의존성 순서 그대로(위→아래).
-- 접근: 신규 테이블 전부 RLS on·정책 없음 = service_role(빌드·크론·이관)만.

-- ── 0) 기존 ingredients 재사용 — 유니버스 추적 컬럼만 추가(구조 변경 없음) ─────
alter table public.ingredients
  add column if not exists freq      integer not null default 0,   -- 누적 등장수(분해 빈도) — 복리 신호
  add column if not exists last_seen date;                          -- 최근 등장일
-- status 값 규약: 'verified' = 도감(치료 타깃·기존 147) · 'seen' = 분해 유니버스(비도감, 노드 자격)

-- ── 1) menu_ingredients — 정규화 junction (메뉴 ↔ 식재료, M:N) ★핵심 ─────────
-- learned_menus.ingredients[](비정규화 배열)을 (menu, ingredient_id) 행으로 정규화.
-- "옥수수 들어간 메뉴"·영양 조인·동시출현 집계가 전부 깔끔한 SQL이 됨.
create table if not exists public.menu_ingredients (
  menu          text not null references public.learned_menus(menu) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id)     on delete cascade,
  primary key (menu, ingredient_id)
);
create index if not exists menu_ingredients_ing_idx on public.menu_ingredients(ingredient_id);  -- 역방향("옥수수 메뉴")
alter table public.menu_ingredients enable row level security;

-- ── 2) ingredient_edges — 식재료↔식재료 사촌/궁합(추천 네트워크) ─────────────
-- food-graph.json 대체. menu_ingredients self-join group-by로 동시출현 매일 자동 누적(복리).
-- 무방향: 쌍 한 줄로만(이관 시 a_id<b_id 정렬 권장). 조회는 (a_id=$1 OR b_id=$1).
create table if not exists public.ingredient_edges (
  a_id       uuid not null references public.ingredients(id) on delete cascade,
  b_id       uuid not null references public.ingredients(id) on delete cascade,
  kind       text not null,                  -- 'pair'(궁합) | 'bridge'(사촌) | 'tray'(식판)
  count      integer,                        -- 동시출현 횟수
  lift       numeric,                        -- c·N/(na·nb) 우연 보정. strong 1.2 / med 1.0
  grade      text,                           -- 'strong' | 'medium' | 'weak'
  strength   integer,                        -- 1~3
  src        text,                           -- 'recipe' | 'tray' | 'seed' 등
  basis      text,
  verified   boolean,                        -- 수기 검증 사촌
  tray       text,
  updated_at timestamptz not null default now(),
  primary key (a_id, b_id, kind)
);
create index if not exists ingredient_edges_a_idx          on public.ingredient_edges(a_id);
create index if not exists ingredient_edges_b_idx          on public.ingredient_edges(b_id);
create index if not exists ingredient_edges_kind_grade_idx on public.ingredient_edges(kind, grade);
alter table public.ingredient_edges enable row level security;

-- ── 3) dish_ingredient_stats — 음식(archetype) × 식재료 ──────────────────────
-- kit-dish-matrix.json 대체.
create table if not exists public.dish_ingredient_stats (
  dish          text not null,                                       -- 음식 archetype(볶음밥·카레·계란찜 …)
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  count         integer  not null default 0,                         -- 동시출현(cells)
  score         smallint,                                            -- LLM 정성 0~3(scores). null=미채점
  updated_at    timestamptz not null default now(),
  primary key (dish, ingredient_id)
);
create index if not exists dish_ingredient_stats_ing_idx  on public.dish_ingredient_stats(ingredient_id);
create index if not exists dish_ingredient_stats_dish_idx on public.dish_ingredient_stats(dish);
alter table public.dish_ingredient_stats enable row level security;
