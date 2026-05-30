-- 농진청 국가표준식품성분표 10.4 — 3,272식품 내부 보유(도감 노출 X, 부모 음식기록→식재료→영양 매핑용 원천).
-- 부위/형태는 대표 식재료(rep)로 정규화: '소고기, 사태'·'소고기, 갈비' → rep '소고기'.
-- 실행: Supabase SQL Editor에서 1회. 적재는 web/scripts/import-nong-foods.py (service_role upsert).

create table if not exists public.nong_foods (
  code        text primary key,         -- DB10.4 색인
  name        text not null,            -- 농진청 식품명(원형)
  food_group  text,                     -- 식품군
  rep         text,                     -- 대표 식재료(정규화) — 음식→식재료 매핑의 표준명
  nutrients   jsonb not null,           -- 주요 영양성분(100g당): energy_kcal·protein_g·... 19종
  covers      text[],                   -- 1일 KDRI 15%↑ 공급 영양소 라벨(신호등용)
  updated_at  timestamptz not null default now()
);
create index if not exists nong_foods_name_idx on public.nong_foods using gin (to_tsvector('simple', name));
create index if not exists nong_foods_rep_idx  on public.nong_foods (rep);
alter table public.nong_foods enable row level security;
-- 내부 원천 데이터 — 클라 직접 접근 차단(어드민은 service_role로 열람, 런타임 매핑은 정적맵 사용). 정책 없음 = deny all.
