-- 앱(케어) 바이럴 엔진 — 사용자별 전용 링크, 방문 카운트, 5명 방문 시 아이 1명 평생무료.
-- 정책: 가입 후 1개월 무조건 무료 + 내 초대링크로 5명 이상 '방문'(가입 불필요)하면 평생무료.
--
-- ⚠️ 기존 '집중 키트 바이럴엔진'의 referrals/referral_visits 테이블과 충돌·데이터 손상을 피하려고
--    앱 전용 별도 이름(app_referrals / app_referral_visits)을 쓴다. 기존 테이블은 건드리지 않는다.
-- 실행: Supabase 대시보드 SQL Editor에서 1회. (drop 없음 — 안전)

-- 1) 사용자당 초대 코드 1개
create table if not exists public.app_referrals (
  parent_id  uuid primary key references auth.users(id) on delete cascade,
  code       text unique not null,
  created_at timestamptz not null default now()   -- 1개월 무료 시작 앵커(≈최초 앱 사용)
);
alter table public.app_referrals enable row level security;
drop policy if exists app_referrals_select_own on public.app_referrals;
create policy app_referrals_select_own on public.app_referrals
  for select using (parent_id = auth.uid());

-- 2) 방문 기록 — (코드, 방문자쿠키) 유니크로 중복 제거. 가입 안 해도 카운트.
create table if not exists public.app_referral_visits (
  code       text not null,
  visitor_id text not null,
  created_at timestamptz not null default now(),
  primary key (code, visitor_id)
);
create index if not exists app_referral_visits_code_idx on public.app_referral_visits (code);
alter table public.app_referral_visits enable row level security;
-- 클라 접근 전면 차단(카운트는 서비스 로우 API로만). 정책 없음 = deny all.
