-- 2026-06-19 기관 월별 식단 저장 + 영양 점수 랭킹 (daycare-eval '우리 기관 상위 몇 등')
-- 식단표↔기관 매핑: 업로드한 식단을 institution+month로 귀속 → 결정론 점수(computeDiversityScore)로
--   전국·지역(시군구) 줄세우기 + DeepSeek 한 줄 총평. 채점 엔진 = lib/institutionScore.ts.
-- 컨벤션은 sql/2026-06-08_institutions.sql 답습(gen_random_uuid·자연키 unique·RLS read 공개·쓰기 service_role).

-- ① 기관 월별 식단 1벌 (institution+month = 1행, 재업로드 시 갱신)
create table if not exists public.institution_menus (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  month          text not null,                  -- 'YYYY-MM' (식단표 해당 월, KST)
  source         text default 'eval_upload',     -- 'eval_upload' | 'batch_import' | 'admin'
  raw_ocr_text   text,
  created_by     uuid,                            -- 업로더(로그인 시) — 익명 업로드는 null
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create unique index if not exists institution_menus_natural_key on public.institution_menus (institution_id, month);
create index if not exists institution_menus_inst on public.institution_menus (institution_id);

-- ② 기관 ↔ 메뉴 m:n (날짜·끼니별 메뉴/식재료)
create table if not exists public.institution_menu_items (
  id                  uuid primary key default gen_random_uuid(),
  institution_menu_id uuid not null references public.institution_menus(id) on delete cascade,
  menu_date           date,                        -- 식단표상 날짜(연-월-일). 연/월 없으면 month+일 보정, 미상은 null.
  slot                text,                         -- 'am_snack' | 'lunch' | 'pm_snack' (care OCR_SLOT와 동일)
  menus               text[] default '{}',
  ingredients         text[] default '{}',
  created_at          timestamptz default now()
);
create unique index if not exists institution_menu_items_key on public.institution_menu_items (institution_menu_id, menu_date, slot);
create index if not exists institution_menu_items_menu on public.institution_menu_items (institution_menu_id);

-- ③ 기관 월별 영양 점수(랭킹 단일 소스) — 줄세우기는 이 표만 스캔(기관 메타 비정규화로 join 회피).
create table if not exists public.institution_scores (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  month          text not null,
  type           text,                            -- institutions.type 사본(어린이집/유치원 코호트 분리)
  sido           text,                            -- 지역 랭킹용 사본
  sigungu        text,
  score          int not null,                    -- computeDiversityScore 0~100
  diversity_base int,
  gate_cap       int,
  processed      int,
  repeat_pen     int,
  red_groups     text[] default '{}',
  summary        text,                            -- DeepSeek 한 줄 총평
  day_count      int,                             -- 채점에 쓰인 날 수(표본 가드)
  item_count     int,
  computed_at    timestamptz default now()
);
create unique index if not exists institution_scores_key on public.institution_scores (institution_id, month);
-- 전국 랭킹(유형·월 내 점수 내림차순) + 지역 랭킹(시군구·유형·월)
create index if not exists institution_scores_rank_nat on public.institution_scores (type, month, score desc);
create index if not exists institution_scores_rank_reg on public.institution_scores (sigungu, type, month, score desc);

-- RLS: 점수·식단은 공개 비교 정보 → 읽기 공개, 쓰기는 service_role(귀속 라우트)만(insert 정책 없음 = anon 쓰기 차단).
alter table public.institution_menus       enable row level security;
alter table public.institution_menu_items  enable row level security;
alter table public.institution_scores      enable row level security;
drop policy if exists institution_menus_read on public.institution_menus;
create policy institution_menus_read on public.institution_menus for select using (true);
drop policy if exists institution_menu_items_read on public.institution_menu_items;
create policy institution_menu_items_read on public.institution_menu_items for select using (true);
drop policy if exists institution_scores_read on public.institution_scores;
create policy institution_scores_read on public.institution_scores for select using (true);

-- eval_results: 업로드 평가를 기관·월에 연결(랭킹·통계용). 기존 institution_type/institution_hash와 공존.
alter table public.eval_results add column if not exists institution_id uuid references public.institutions(id);
alter table public.eval_results add column if not exists month text;
create index if not exists eval_results_institution on public.eval_results (institution_id, month) where institution_id is not null;

comment on table public.institution_menus  is '기관 월별 식단(어린이집·유치원). institution+month=1벌. daycare-eval 업로드/배치 임포트가 채움.';
comment on table public.institution_scores is '기관 월별 영양 점수(랭킹 단일 소스). computeDiversityScore 결정론 + DeepSeek 총평. 전국·지역 줄세우기.';
