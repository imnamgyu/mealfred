-- meal_logs.place — 먹는 장소 (집/기관). 코칭엔진 스펙 §3.
-- 정량 영양평가는 전부 집계하되, 정성 코칭은 집 끼니·기관 거부에 포커스하기 위함.
-- 실행: Supabase 대시보드 SQL Editor에서 1회 실행.

alter table public.meal_logs add column if not exists place text;

comment on column public.meal_logs.place is '먹는 장소: home(집) / daycare(어린이집·유치원) / null(미상). 정량은 전부 집계, 정성 코칭은 집·기관 거부 포커스.';
