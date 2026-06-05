-- 레시피 빌더(Phase 3) — 어머니가 식재료+조리방식+시간 버튼 조립으로 레시피를 올리고,
-- 도감 식재료 페이지(§6)에 연동 노출. 이케아식 인포그래픽으로 렌더.
-- community_posts(한 줄 노하우)와 별도 테이블 — 레시피는 단계(steps) 구조가 있어 분리.
-- 실행: Supabase SQL Editor 1회.

create table if not exists public.community_recipes (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references auth.users(id) on delete cascade,   -- NULL = 공식(코치 PICK)
  child_id     uuid references public.children(id) on delete set null,
  author_nick  text,
  dish         text not null,                       -- 음식 이름
  tip          text,                                -- 한 줄 팁(선택)
  photo_url    text,
  ingredients  text[] not null default '{}',        -- 도감 표준명(스텝 식재료 distinct) — 도감 연동 키
  steps        jsonb  not null default '[]',         -- [{ing, verb, time, memo}]
  age_band     text,
  traits       text[] default '{}',
  difficulty   text,
  time_min     int,
  status       text not null default 'public',       -- public | hidden | draft
  is_official  boolean not null default false,
  official_key text,
  like_count   int not null default 0,
  tried_count  int not null default 0,
  report_count int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists community_recipes_ing_idx on public.community_recipes using gin (ingredients);
create index if not exists community_recipes_created_idx on public.community_recipes (created_at desc);
create unique index if not exists community_recipes_official_key on public.community_recipes (official_key) where official_key is not null;

create table if not exists public.recipe_reactions (
  recipe_id uuid not null references public.community_recipes(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  kind      text not null check (kind in ('like','tried')),
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id, kind)
);

-- 반응 카운트 동기화(비정규화)
create or replace function public.sync_recipe_counts() returns trigger language plpgsql as $$
declare rid uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  update public.community_recipes r set
    like_count  = (select count(*) from recipe_reactions where recipe_id = rid and kind = 'like'),
    tried_count = (select count(*) from recipe_reactions where recipe_id = rid and kind = 'tried')
  where r.id = rid;
  return null;
end $$;
drop trigger if exists recipe_reactions_sync on public.recipe_reactions;
create trigger recipe_reactions_sync after insert or delete on public.recipe_reactions
  for each row execute function public.sync_recipe_counts();

alter table public.community_recipes enable row level security;
alter table public.recipe_reactions enable row level security;

drop policy if exists community_recipes_read on public.community_recipes;
create policy community_recipes_read on public.community_recipes for select using (status = 'public' or parent_id = auth.uid());
drop policy if exists community_recipes_insert on public.community_recipes;
create policy community_recipes_insert on public.community_recipes for insert with check (parent_id = auth.uid());
drop policy if exists community_recipes_update on public.community_recipes;
create policy community_recipes_update on public.community_recipes for update using (parent_id = auth.uid());

drop policy if exists recipe_reactions_own on public.recipe_reactions;
create policy recipe_reactions_own on public.recipe_reactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.community_recipes is '엄마 레시피(버튼 조립). 도감 §6 ingredients 연동, 이케아식 인포그래픽. community_posts와 별도(steps 구조).';
