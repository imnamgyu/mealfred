-- 코칭 QA 어드민용 — 편지·질문 생성 시 "우리가 무슨 판단을 했나"(분석 입력 스냅샷)를 저장.
-- 어드민 쓰레드에서 각 코칭 메시지 아래 reds·신호등·시계열·집기관 등을 그대로 보여주기 위함.
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

alter table public.coach_letters   add column if not exists context jsonb;
alter table public.daily_questions  add column if not exists context jsonb;
comment on column public.coach_letters.context  is 'QA용: 편지 생성 입력 스냅샷(reds·식품군·시계열·집기관·등원·생성경로 등)';
comment on column public.daily_questions.context is 'QA용: 질문 생성 입력 스냅샷(recentMeals·거부·등원 등)';
