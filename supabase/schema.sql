-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 밀프레드 Supabase 스키마 (M2 + M3)
-- 위치: deploy/supabase/schema.sql
-- 적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━ extensions ━━━
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ━━━ M2 · ingredients 마스터 (147종 → 650 → 10,000+) ━━━
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                -- url용 ('시금치')
  name text not null,                       -- 한글 정식명
  name_en text,                             -- 영문 (i18n)
  emoji text,                               -- 빈 문자열 OK (정확한 매핑 없을 때)
  category text,                            -- 14 sub (잎채소·뿌리채소·생선 등)
  food_group text,                          -- WHO MDD 8 (grain·legume·dairy·meat·egg·vitaminA·other·fruit)
  -- 등급 (v4 마스터 + 사용자 결정 3단계 + 라벨 X)
  grade_label text check (grade_label in ('필수','권장','향신료','')),
  grade_star text,                          -- ⭐⭐⭐ / ⭐⭐ / 🌿 등
  v4_grade text check (v4_grade in ('S','A','B','C','D')),
  v4_score numeric,
  v4_freq_total int,
  v4_reason text,
  -- 등장 빈도 (참고)
  elem_count int default 0,
  infant_count int default 0,
  -- 영양 (농진청 v10.4 100g 당)
  nutri_per_100g jsonb,                     -- {energy_kcal:33, protein_g:0.78, ...}
  nong_name text,                           -- 농진청 정식 식품명
  -- 안전 경고
  warning text,                             -- '🚨🚨 매우 위험' (요오드·나트륨)
  mercury jsonb,                            -- {level, guide} (생선 수은)
  allergens text[],
  seasonality int[],                        -- [3,4,5] 제철 월
  -- enrich 메타
  status text default 'verified' check (status in ('verified','ai_enriched','review','draft')),
  source text default '농진청 v10.4',
  enriched_at timestamptz,
  -- 시각화·검색
  meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ingredients_grade on ingredients(grade_label) where grade_label is not null and grade_label <> '';
create index if not exists idx_ingredients_category on ingredients(category);
create index if not exists idx_ingredients_name_trgm on ingredients using gin(name gin_trgm_ops);

-- ━━━ M2 · ingredient_recipes (식재료별 추천 레시피) ━━━
create table if not exists ingredient_recipes (
  id bigserial primary key,
  ingredient_id uuid references ingredients(id) on delete cascade,
  recipe_name text not null,
  age_band text,                            -- 만6-11세 / 만12-18세 / 영아·유아 등
  cooking_method text,                      -- 국·탕·죽·미음·조림·찜·볶음·구이·튀김·전·무침·밥·면류
  allergens text,
  is_top_pick boolean default false,        -- 식재료별 Top 5 표시
  rank_in_ingredient int,
  source text default '4,432 레시피 DB',
  created_at timestamptz default now()
);
create index if not exists idx_recipes_ing on ingredient_recipes(ingredient_id, is_top_pick desc, rank_in_ingredient);

-- ━━━ M2 · ingredient_comments (도감 댓글 — 익명 OK) ━━━
create table if not exists ingredient_comments (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid references ingredients(id) on delete cascade,
  author_nickname text,
  body text not null check (length(body) <= 1000),
  like_count int default 0,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  moderation_reason text,
  ip_hash text,                             -- rate limit + 차단용
  created_at timestamptz default now(),
  approved_at timestamptz,
  deleted_at timestamptz
);
create index if not exists idx_comments_ing on ingredient_comments(ingredient_id, status, created_at desc);
create index if not exists idx_comments_status on ingredient_comments(status) where deleted_at is null;

-- ━━━ M3 · enrich_queue (매일 +50종 자동 enrich) ━━━
create table if not exists enrich_queue (
  id bigserial primary key,
  name text not null,
  category_hint text,
  source_db text default '농진청 v10.4',
  scheduled_for date,
  status text default 'pending' check (status in ('pending','processing','done','failed','skipped')),
  attempt_count int default 0,
  last_error text,
  processed_at timestamptz,
  enriched_ingredient_id uuid references ingredients(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_enrich_queue_status on enrich_queue(status, scheduled_for);
create index if not exists idx_enrich_queue_pending on enrich_queue(scheduled_for) where status = 'pending';

-- ━━━ M3 · cron_runs (cron 실행 로그) ━━━
create table if not exists cron_runs (
  id bigserial primary key,
  job_name text not null,                   -- enrich · moderate-comments · ...
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text check (status in ('running','success','failure')),
  processed_count int default 0,
  error_count int default 0,
  cost_krw numeric default 0,
  meta jsonb
);
create index if not exists idx_cron_runs_job on cron_runs(job_name, started_at desc);

-- ━━━ RLS (Row-Level Security) ━━━
-- 도감·레시피는 공개 read, 댓글 작성은 익명 OK + RLS rate limit
alter table ingredients enable row level security;
alter table ingredient_recipes enable row level security;
alter table ingredient_comments enable row level security;
alter table enrich_queue enable row level security;
alter table cron_runs enable row level security;

-- ingredients : 누구나 read
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'ingredients_public_read') then
    create policy ingredients_public_read on ingredients
      for select using (true);
  end if;
end $$;

-- ingredient_recipes : 누구나 read
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'recipes_public_read') then
    create policy recipes_public_read on ingredient_recipes
      for select using (true);
  end if;
end $$;

-- comments : approved만 공개 read, insert는 익명 OK
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'comments_public_read') then
    create policy comments_public_read on ingredient_comments
      for select using (status = 'approved' and deleted_at is null);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'comments_anon_insert') then
    create policy comments_anon_insert on ingredient_comments
      for insert with check (length(body) between 1 and 1000);
  end if;
end $$;

-- enrich_queue · cron_runs : 운영자만 (service_role 우회)
-- 별도 policy 없음 = 기본 거부

-- ━━━ seed 준비 (data import는 별도 import.ts 스크립트로) ━━━
comment on table ingredients is '식재료 마스터 — 147종 시드 + 매일 +50종 enrich';
comment on table ingredient_recipes is '4,432 레시피 → 식재료별 inverted index Top 5';
comment on table ingredient_comments is '도감 댓글 (익명) + Haiku 자동 모더레이션';
comment on table enrich_queue is 'M3 매일 +50종 자동 enrich 큐';
comment on table cron_runs is 'cron 작업 실행 로그 (운영 모니터링)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ALG-EVAL-07 — 식단표 역분석 → 도감 자동 enrich 파이프라인
-- (engines-deep §1 ALG-EVAL-07 정합)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 어머니 식단표 평가에서 추출된 식재료 빈도 누적
-- '한국 어머니가 실제로 먹이는 식재료' 시그널 (익명)
create table if not exists daycare_eval_signals (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null,            -- 메뉴에서 추출된 식재료명 (정규화 전)
  normalized_name text,                     -- 147 풀과 매칭된 정규화 이름 (null = 미매칭)
  ingredient_id uuid references ingredients(id),  -- 매칭된 식재료 (null = 신규 후보)
  age_band text,                            -- '3-4y'·'5y'·'6-7y'·'younger'
  cooking_method text,                      -- '국·탕'·'볶음·구이'·'밥·면류' 등 (추정)
  sighting_count int default 1,             -- 같은 식재료 누적 등장 횟수
  total_evals int default 1,                -- 등장한 평가 수
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  -- ALG-EVAL-07 promotion
  promoted_to_queue_at timestamptz,         -- enrich_queue로 push된 시점 (미매칭만)
  promoted_to_grade_eval_at timestamptz,    -- 필수/권장 등급 평가에 반영된 시점
  source text default 'daycare-eval'
);
create unique index if not exists idx_daycare_signals_name on daycare_eval_signals(ingredient_name);
create index if not exists idx_daycare_signals_promote on daycare_eval_signals(sighting_count desc)
  where promoted_to_queue_at is null and normalized_name is null;
create index if not exists idx_daycare_signals_matched on daycare_eval_signals(ingredient_id, sighting_count desc)
  where ingredient_id is not null;
comment on table daycare_eval_signals is 'ALG-EVAL-07 어머니 식단표 → 식재료 빈도 시그널 (미매칭 = enrich 후보 / 매칭 = 등급 영향)';

-- 식단표 → 식재료 추천 레시피 보강 (매칭된 식재료가 자주 등장하는 조리법 컨텍스트)
create table if not exists daycare_recipe_hints (
  id bigserial primary key,
  ingredient_id uuid references ingredients(id) on delete cascade,
  menu_name text not null,                  -- 어머니 식단표의 메뉴명
  cooking_method text,
  age_band text,
  sighting_count int default 1,
  last_seen_at timestamptz default now(),
  source text default 'daycare-eval',
  promoted_to_recipes_at timestamptz        -- ingredient_recipes로 승급된 시점
);
create index if not exists idx_daycare_hints_ing on daycare_recipe_hints(ingredient_id, sighting_count desc);
comment on table daycare_recipe_hints is '식단표에서 등장한 메뉴-식재료 매핑 → 추천 레시피 후보 (5회+ 자동 승급)';

-- daycare_eval_signals → enrich_queue 자동 promotion (트리거 또는 cron)
-- 비매칭 식재료가 5회+ 등장 시 enrich_queue로 push (M3 cron이 처리)
-- 정책: 운영자 검토 후 ingredients 테이블에 verified 승급 가능
alter table daycare_eval_signals enable row level security;
alter table daycare_recipe_hints enable row level security;

-- RLS: anon insert 가능 (daycare-eval 평가 시 자동 누적)
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'daycare_signals_anon_insert') then
    create policy daycare_signals_anon_insert on daycare_eval_signals
      for insert with check (length(ingredient_name) between 1 and 100);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'daycare_hints_anon_insert') then
    create policy daycare_hints_anon_insert on daycare_recipe_hints
      for insert with check (length(menu_name) between 1 and 200);
  end if;
end $$;
