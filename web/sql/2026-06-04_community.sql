-- 커뮤니티 MVP Phase 1 — 도감 식재료별 엄마 노하우.
-- 보상모델(이사님 확정): 글 0P · 첫 글 1회 +500 · 좋아요/해봤어요 = 포인트 X(선정 신호만)
--   · 주간 베스트글 톱10(1위 5k/2~3위 3k/4~10위 1k) · 월간 대상 +20000 · 식재료별 명예 +2000
--   → 주간/월간 선정·명예는 별도 배치(cron)에서 지급(Phase 2). Phase 1의 포인트 흐름 = 첫 글 +500뿐(farming-proof).
-- UGC는 별도 테이블(코퍼스 오염 방지). 실행: Supabase SQL Editor에서 1회.

-- ── 노하우 글 ───────────────────────────────────────────────
create table if not exists public.community_posts (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references auth.users(id) on delete cascade,
  child_id     uuid references public.children(id) on delete set null,   -- 작성 주체(자녀) — 월령 표기용
  author_nick  text,                              -- 작성 시점 닉네임 스냅샷(없으면 UI가 'N세 아이 엄마'로 대체)
  ingredients  text[] not null default '{}',     -- 매핑엔진 자동 태깅 도감 표준명(이 글이 달리는 식재료들)
  body         text not null,                     -- 한 줄 노하우(필수)
  photo_url    text,                              -- 본인 촬영 사진(Phase 2)
  age_band     text,                              -- 자녀 월령대(스냅샷)
  traits       text[] default '{}',               -- 아이 성향 칩(예민·새것거부…)
  method_type  text,                              -- 숨기기·곁들이기·모양바꾸기·도전(푸드체이닝 정합)
  difficulty   text,                              -- 쉬움·보통·어려움
  time_min     int,                               -- 소요 시간(분)
  status       text not null default 'public',    -- public · hidden(신고/모더) · draft
  like_count   int not null default 0,            -- 좋아요(비정규화 — 트리거 유지)
  tried_count  int not null default 0,            -- 해봤어요
  report_count int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- 식재료별 스레드 조회(도감 §6) — GIN으로 ingredients 배열 검색
create index if not exists community_posts_ing_idx  on public.community_posts using gin (ingredients);
create index if not exists community_posts_new_idx  on public.community_posts (created_at desc) where status = 'public';
create index if not exists community_posts_hot_idx  on public.community_posts (like_count desc, tried_count desc) where status = 'public';
create index if not exists community_posts_mine_idx on public.community_posts (parent_id, created_at desc);

-- ── 반응(좋아요·해봤어요) = 선정 신호(포인트 X) ──────────────
create table if not exists public.community_reactions (
  id         bigserial primary key,
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                       -- 'like' · 'tried'
  created_at timestamptz not null default now(),
  unique (post_id, user_id, kind)                 -- 1인 1반응(셀프·중복 차단은 API/트리거)
);
create index if not exists community_reactions_post_idx on public.community_reactions (post_id);

-- 반응 변동 → posts 카운트 동기화(트리거=테이블 소유자 권한이라 RLS 우회)
create or replace function public.sync_reaction_count() returns trigger language plpgsql security definer set search_path = public as $$
declare v_post uuid := coalesce(new.post_id, old.post_id); v_kind text := coalesce(new.kind, old.kind); v_delta int;
begin
  v_delta := case when tg_op = 'INSERT' then 1 when tg_op = 'DELETE' then -1 else 0 end;
  if v_kind = 'like'  then update community_posts set like_count  = greatest(0, like_count  + v_delta) where id = v_post; end if;
  if v_kind = 'tried' then update community_posts set tried_count = greatest(0, tried_count + v_delta) where id = v_post; end if;
  return null;
end $$;
drop trigger if exists trg_reaction_count on public.community_reactions;
create trigger trg_reaction_count after insert or delete on public.community_reactions
  for each row execute function public.sync_reaction_count();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.community_posts     enable row level security;
alter table public.community_reactions enable row level security;

-- 글: 공개글은 누구나 읽음 + 내 글(비공개·임시 포함)은 나도. 쓰기/수정/삭제는 내 글만.
drop policy if exists community_posts_sel on public.community_posts;
create policy community_posts_sel on public.community_posts for select using (status = 'public' or parent_id = auth.uid());
drop policy if exists community_posts_ins on public.community_posts;
create policy community_posts_ins on public.community_posts for insert with check (parent_id = auth.uid());
drop policy if exists community_posts_upd on public.community_posts;
create policy community_posts_upd on public.community_posts for update using (parent_id = auth.uid());
drop policy if exists community_posts_del on public.community_posts;
create policy community_posts_del on public.community_posts for delete using (parent_id = auth.uid());

-- 반응: 내 반응만 보고/달고/뗌(셀프 좋아요 차단은 API에서 본인 글 거름).
drop policy if exists community_reactions_sel on public.community_reactions;
create policy community_reactions_sel on public.community_reactions for select using (user_id = auth.uid());
drop policy if exists community_reactions_ins on public.community_reactions;
create policy community_reactions_ins on public.community_reactions for insert with check (user_id = auth.uid());
drop policy if exists community_reactions_del on public.community_reactions;
create policy community_reactions_del on public.community_reactions for delete using (user_id = auth.uid());

-- ── 첫 글 온보딩 +500 (1회·멱등) — point_ledger/point_balance 재사용 ──
create or replace function public.award_community_first_post(p_parent uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_key text := 'community_first|' || p_parent::text; v_amt int := 500; v_bal int;
begin
  if exists (select 1 from point_ledger where idempotency_key = v_key) then return 0; end if;
  insert into point_balance (parent_id, balance, total_earned)
    values (p_parent, v_amt, v_amt)
    on conflict (parent_id) do update
      set balance = point_balance.balance + v_amt, total_earned = point_balance.total_earned + v_amt, updated_at = now()
    returning balance into v_bal;
  insert into point_ledger (parent_id, kind, amount, meta, idempotency_key, balance_after)
    values (p_parent, 'community_first_post', v_amt, jsonb_build_object('reason','첫 노하우'), v_key, v_bal);
  return v_amt;
end $$;
