-- Phase B · 궁합 그래프 웹/LLM 폴백 캐시
-- 정적 그래프(lib/food-graph.json)에 이웃이 없는 식재료를, LLM이 도감 어휘 안에서 궁합/사촌으로 채우고 캐시한다.
-- 한 번 채우면 영구 재사용(식재료 궁합은 안 변함). API 라우트(/api/affinity)가 service_role로 upsert.

create table if not exists public.affinity_cache (
  food        text primary key,
  neighbors   jsonb not null,                 -- [{nm, kind:'pair'|'bridge', strength, basis}]
  source      text  not null default 'llm',
  created_at  timestamptz not null default now()
);

alter table public.affinity_cache enable row level security;

-- 비민감 데이터(식재료 궁합) — 누구나 읽기 허용. 쓰기는 service_role(서버 API)만(RLS 우회).
drop policy if exists affinity_cache_read on public.affinity_cache;
create policy affinity_cache_read on public.affinity_cache for select using (true);
