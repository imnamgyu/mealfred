-- 관리자 평생무료 부여 — app_subscriptions에 lifetime 플래그.
-- 어드민이 사용자 초대코드로 계정을 찾아 부여/해제. care/me는 lifetime이면 '평생 무료' + 페이월 스킵.
-- 쓰기는 service_role(어드민 API)만, 읽기는 기존 own_sub_read RLS로 본인 행만(care/me가 읽음).
alter table public.app_subscriptions add column if not exists lifetime boolean not null default false;
alter table public.app_subscriptions add column if not exists lifetime_note text;
alter table public.app_subscriptions add column if not exists lifetime_granted_at timestamptz;
