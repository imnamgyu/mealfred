-- 등원 사실 + 식단표 OCR 자동채움 지원. 코칭엔진 스펙 §3 (기관 끼니 표준화).
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

-- 1) 어린이집·유치원 등원 여부 (평일 점심·간식 = 기관 끼니라는 표준 사실)
alter table public.children add column if not exists daycare boolean default false;
comment on column public.children.daycare is '어린이집·유치원 등원 여부. true면 평일 점심·간식은 기관 끼니(부모가 메뉴 못 바꿈)로 코칭이 판단.';

-- 2) meal_logs 출처 — 부모 입력 vs 식단표 OCR 자동채움 구분
alter table public.meal_logs add column if not exists source text;
comment on column public.meal_logs.source is '끼니 출처: null(부모 입력) / daycare_menu(어린이집 식단표 OCR 자동채움)';
