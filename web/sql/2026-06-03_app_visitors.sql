-- app_visitors — 익명 방문자(mf_vid 쿠키) 고유 추적. 마케팅 펀넬 맨 윗단(방문 → 가입).
-- /api/funnel(POST)가 방문 시 upsert, /admin/funnel가 집계. 실행: Supabase SQL Editor 1회.
create table if not exists public.app_visitors (
  visitor_id text primary key,           -- mf_vid 쿠키값(httpOnly)
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

-- 서버 라우트(service_role)만 쓰고 읽는다. anon/공개 접근은 0행(RLS 켜고 정책 없음 → service_role만 우회).
alter table public.app_visitors enable row level security;

comment on table public.app_visitors is '익명 방문자 고유 추적(mf_vid). /api/funnel가 upsert, /admin/funnel가 방문→가입 전환 집계. 보류됐던 펀넬 Phase 2.';
