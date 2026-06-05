-- 팁 추천 엔진(Phase 2) — 개인 맞춤 랭킹 + 읽음 추적.
-- user_tip_ranking: 새벽 크론(/api/cron/tip-ranking)이 부모별로 글 정렬을 미리 계산해 저장.
--   /api/blog/feed가 이걸 읽어 팁 최상단을 '그 사람에게 맞는 글'로. 없으면 최신순 폴백.
-- blog_reads: /blog/[slug] 열람 기록. 크론이 이미 읽은 글을 뒤로 보내 '다음 읽을 글'을 위로.
-- 둘 다 서버 라우트(service_role)만 쓰고 읽음(앱이 user.id로 필터). 실행: SQL Editor 1회.

create table if not exists public.user_tip_ranking (
  parent_id   uuid primary key references auth.users(id) on delete cascade,
  slug_order  text[] not null default '{}',   -- 추천 순서(slug)
  reasons     jsonb  not null default '{}',    -- { slug: "요즘 채소가 부족해요" }
  computed_at timestamptz not null default now()
);
alter table public.user_tip_ranking enable row level security;
-- 정책 없음 = anon/authenticated deny. service_role(크론·feed 라우트)만.

create table if not exists public.blog_reads (
  parent_id uuid not null references auth.users(id) on delete cascade,
  slug      text not null,
  read_at   timestamptz not null default now(),
  primary key (parent_id, slug)
);
alter table public.blog_reads enable row level security;
-- 정책 없음 = service_role(read 라우트·크론)만. createSupabaseServer가 service_role라 우회.

comment on table public.user_tip_ranking is '팁 개인 맞춤 랭킹(크론 산출). /api/blog/feed가 읽음. service_role only.';
comment on table public.blog_reads is '블로그 열람 기록. 추천 크론이 읽은 글을 뒤로. service_role only.';
