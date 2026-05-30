-- 바이럴(초대) 엔진 — 사용자별 전용 링크, 방문 카운트, 5명 방문 시 아이 1명 평생무료.
-- 정책: 가입 후 1개월 무조건 무료 + 내 초대링크로 5명 이상 '방문'(가입 불필요)하면 평생무료.
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

-- 1) 사용자당 초대 코드 1개
create table if not exists public.referrals (
  parent_id  uuid primary key references auth.users(id) on delete cascade,
  code       text unique not null,
  created_at timestamptz not null default now()   -- 1개월 무료 시작 앵커(≈최초 앱 사용)
);
alter table public.referrals enable row level security;
-- 본인 것만 조회(쓰기는 서비스 로우만)
drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals for select using (parent_id = auth.uid());

-- 2) 방문 기록 — (코드, 방문자쿠키) 유니크로 중복 제거. 가입 안 해도 카운트.
create table if not exists public.referral_visits (
  code       text not null,
  visitor_id text not null,                        -- 방문자 브라우저 쿠키 UUID
  created_at timestamptz not null default now(),
  primary key (code, visitor_id)
);
create index if not exists referral_visits_code_idx on public.referral_visits (code);
alter table public.referral_visits enable row level security;
-- 클라 접근 전면 차단(카운트는 서비스 로우 API로만). 정책 없음 = deny all.
