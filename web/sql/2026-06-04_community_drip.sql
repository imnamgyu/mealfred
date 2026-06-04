-- 커뮤니티 드립 — '밀프레드 코치' 큐레이션 노하우 자동 게시(콜드스타트·항시 신선도).
-- 공식 글 = parent_id NULL + is_official + official_key(멱등). service_role(드립 cron)만 insert.
-- 실행: Supabase SQL Editor에서 1회.

alter table public.community_posts add column if not exists is_official boolean not null default false;
alter table public.community_posts add column if not exists official_key text;   -- 콘텐츠 풀 id(중복 게시 방지)
alter table public.community_posts alter column parent_id drop not null;          -- 공식 글은 작성자(부모) 없음

create unique index if not exists community_posts_official_key on public.community_posts (official_key) where official_key is not null;
create index if not exists community_posts_official_idx on public.community_posts (is_official) where is_official = true;
