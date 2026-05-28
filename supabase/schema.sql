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
-- M4 · children (자녀 정보) + kakao_messages (SENS 발송 로그)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (length(nickname) between 1 and 20),
  age_band text not null check (age_band in ('younger','3-4y','5y','6-7y')),
  birth_year int,                            -- 출생 연도
  birth_month int check (birth_month between 1 and 12),  -- 출생 월
  height_cm numeric,
  weight_kg numeric,
  allergens text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- 기존 DB 마이그레이션 (재실행 안전)
alter table children add column if not exists birth_year int;
alter table children add column if not exists birth_month int;
create index if not exists idx_children_parent on children(parent_id);
alter table children enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'children_owner_all') then
    create policy children_owner_all on children for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
  end if;
end $$;
comment on table children is 'M4 가입 직후 자녀 정보 (실명 X, 닉네임만)';

create table if not exists kakao_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  template_id text not null,                -- signup_welcome·stage_change·challenge_complete·inactive_reminder
  payload jsonb,                            -- {vars, phone(끝4자리만)}
  status text check (status in ('sent','failed','retry')),
  sens_message_id text,
  sent_at timestamptz default now(),
  cost_krw int default 0,
  error text
);
create index if not exists idx_kakao_user on kakao_messages(user_id, sent_at desc);
alter table kakao_messages enable row level security;
-- 본인 메시지만 read, insert는 service_role만
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'kakao_owner_read') then
    create policy kakao_owner_read on kakao_messages for select using (auth.uid() = user_id);
  end if;
end $$;
comment on table kakao_messages is 'M4 네이버 SENS 알림톡 발송 로그 (비용·실패 추적)';

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

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 식단 평가 결과 저장 (기관별 누적 → 통계화)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create table if not exists eval_results (
  id uuid primary key default gen_random_uuid(),
  institution_type text check (institution_type in ('어린이집','유치원','초등학교','기타')),
  institution_hash text,                    -- SHA256(기관명) 익명 식별용 (같은 기관 추적)
  age_band text,
  input_mode text,                          -- manual / sample_fallback
  total_score int,
  grade text,
  axis_scores jsonb,                        -- [{idx,name,score}]
  matched_count int,
  total_menus int,
  matched_ingredients text[],
  missing_essential text[],                 -- 필수 식재료 중 미등장
  result_json jsonb,                         -- 공유 URL용 렌더 스냅샷 (분석 때만 LLM, 조회는 read)
  expires_at timestamptz default (now() + interval '3 days'),  -- 결과 공유 링크 만료
  created_at timestamptz default now()
);
-- 기존 DB 마이그레이션 (재실행 안전)
alter table eval_results add column if not exists result_json jsonb;
alter table eval_results add column if not exists expires_at timestamptz default (now() + interval '3 days');
create index if not exists idx_eval_results_type on eval_results(institution_type, created_at desc);
create index if not exists idx_eval_results_expires on eval_results(expires_at) where result_json is not null;
create index if not exists idx_eval_results_stats on eval_results(institution_type)
  where input_mode = 'manual';
alter table eval_results enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'eval_results_anon_insert') then
    create policy eval_results_anon_insert on eval_results
      for insert with check (total_score between 0 and 100);
  end if;
end $$;
comment on table eval_results is '식단 평가 결과 기관별 누적 — 어린이집/유치원 각 100개 넘으면 통계 크론탭 시작';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- OCR 로그 (사진 업로드 → AI 인식 결과 추적)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create table if not exists ocr_logs (
  id uuid primary key default gen_random_uuid(),
  image_url text,
  storage_path text,
  file_name text,
  file_size int,
  file_type text,
  is_menu boolean,
  ocr_text text,
  reject_reason text,
  duration_ms int,
  model text,
  input_tokens int default 0,
  output_tokens int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_ocr_logs_created on ocr_logs(created_at desc);
create index if not exists idx_ocr_logs_rejected on ocr_logs(is_menu) where is_menu = false;
alter table ocr_logs enable row level security;
comment on table ocr_logs is 'OCR 요청 로그 — 사진·인식 결과·비용·거부 사유 추적';

-- Storage 버킷 (Supabase Dashboard에서도 생성 가능)
insert into storage.buckets (id, name, public)
values ('eval-uploads', 'eval-uploads', true)
on conflict (id) do nothing;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- M5 · meal_logs (식사 기록 PWA)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references children(id) on delete cascade,
  parent_id uuid references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  slot text not null check (slot in ('breakfast','am_snack','lunch','pm_snack','dinner','night')),
  ingredients text[],                        -- 입력된 식재료 (해시태그)
  menus text[],                              -- 입력한 메뉴명 (예: 야채볶음밥)
  menu_text text,                            -- (구) 자유 입력 메뉴명
  photo_url text,                            -- 사진 (선택)
  texture text,                              -- 식감 메모 (선택)
  autonomy text,                             -- 자율성 메모 (스스로 먹음 등)
  note text,                                 -- 전체 상태 자유 메모 (정성 기록, 가공 X)
  refused text,                              -- 거부/남긴 음식
  ate_well boolean,                          -- 잘 먹었는지
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- 기존 DB 마이그레이션 (재실행 안전)
alter table meal_logs add column if not exists menus text[];
alter table meal_logs add column if not exists refused text;
alter table meal_logs add column if not exists environment text;   -- 식사 환경 (table/screen/roaming/play)
alter table meal_logs add column if not exists duration_min int;   -- 식사 시간 (분)
alter table meal_logs add column if not exists meal_time int;      -- 식사 시각 (시, 0~23) — 일정한 시간 추적
alter table meal_logs add column if not exists reaction text;      -- 반응 (refuse/leave/eat/more)
create index if not exists idx_meal_logs_child_date on meal_logs(child_id, log_date desc);
create index if not exists idx_meal_logs_parent on meal_logs(parent_id, log_date desc);
create unique index if not exists idx_meal_logs_unique on meal_logs(child_id, log_date, slot);
alter table meal_logs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'meal_logs_owner_all') then
    create policy meal_logs_owner_all on meal_logs
      for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
  end if;
end $$;
comment on table meal_logs is 'M5 식사 기록 — 6 슬롯(아침·오전간식·점심·오후간식·저녁·야간) × 식재료·메모·사진';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 메뉴 식재료 커스텀 (피드백 루프)
-- 엄마가 AI 분해 결과를 수정하면 그 사용자의 메뉴는 커스텀으로 기억
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create table if not exists user_menu_overrides (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  menu text not null,                        -- 정규화된 메뉴명 (공백 제거)
  ingredients text[] not null,               -- 사용자가 확정한 식재료
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create unique index if not exists idx_menu_override_unique on user_menu_overrides(parent_id, menu);
alter table user_menu_overrides enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'menu_override_owner_all') then
    create policy menu_override_owner_all on user_menu_overrides
      for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
  end if;
end $$;
comment on table user_menu_overrides is '메뉴→식재료 사용자 커스텀 (예: 짜파게티에서 당근 빼면 그 사람 짜파게티는 당근 제외로 기억)';
