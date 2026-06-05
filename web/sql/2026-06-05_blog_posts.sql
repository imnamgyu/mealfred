-- blog_posts — 앱(app.mealfred.com) '팁' 탭이 읽는 발행 블로그.
-- 출처: 마케팅 블로그(.md → _build.js → mealfred.com/blog/NNN.html 정적)는 그대로 두고,
--  발행 시 scripts/publish-blog.mjs가 같은 .md를 렌더(body_html)해서 이 테이블에 upsert.
--  앱은 /blog/[slug](인앱 본문)와 /community(팁) 피드에서 이 테이블만 읽는다.
-- 공개글이라 anon read 허용(RLS public). 쓰기는 service_role(발행 스크립트)만.
-- 실행: Supabase SQL Editor 1회.

create table if not exists public.blog_posts (
  slug         text primary key,            -- 발행순서 3자리 '001'
  series_no    int  not null,               -- 발행순서(정렬)
  track        text,                        -- 정주행 | 스낵 | 오프닝
  phase        text,
  phase_name   text,
  category     text,
  title        text not null,               -- 후킹제목
  headline     text,                        -- 첫화면자막
  excerpt      text,                        -- 카드 요약(반전팩트 등)
  body_html    text not null,               -- 발행 시점 md2html 렌더 본문
  after_html   text,                        -- 출처·해시태그 박스
  source       text,                        -- 근거출처
  topics       text[] default '{}',         -- 추천엔진용 태그(카테고리·키워드)
  ingredients  text[] default '{}',         -- 글이 다루는 식재료(도감/추천 매칭)
  published_at date,
  status       text not null default 'public',  -- public | draft | hidden
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists blog_posts_pub_idx on public.blog_posts (published_at desc, series_no desc) where status = 'public';

alter table public.blog_posts enable row level security;
drop policy if exists blog_posts_public_read on public.blog_posts;
create policy blog_posts_public_read on public.blog_posts for select using (status = 'public');
-- 쓰기 정책 없음 = anon/authenticated deny. service_role(발행 스크립트)만 우회.

comment on table public.blog_posts is '앱 팁 탭/인앱 블로그가 읽는 발행 글. 마케팅 .md를 publish-blog.mjs가 렌더해 upsert. anon read, service_role write.';
