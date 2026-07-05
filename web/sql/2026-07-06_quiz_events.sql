-- ⭐ 퀴즈 전환 이벤트 (이사님 2026-07-06) — "몇 명이 다른 서비스로 이어갔나" 추적.
--   quiz_results(응답)와 별개로, 결과 화면에서의 행동 클릭을 적재: app_cta(앱으로 이동)·share(공유/도전장).
--   익명·개인정보 없음. 어드민 /admin/quiz에서 참여 대비 전환율로 집계.
create table if not exists public.quiz_events (
  id uuid primary key default gen_random_uuid(),
  tool text not null default 'knowledge',   -- 어느 테스트에서(knowledge=상식점수)
  event text not null,                      -- app_cta | share (슬러그, API에서 검증)
  created_at timestamptz not null default now()
);

create index if not exists quiz_events_tool_event_idx on public.quiz_events (tool, event, created_at desc);

-- RLS: 직접 접근 차단 — 쓰기는 서버 API(/api/quiz-event, service_role)만.
alter table public.quiz_events enable row level security;

comment on table public.quiz_events is '쿠키 테스트 결과 화면의 전환 클릭(app_cta·share). 집계는 /admin/quiz.';
