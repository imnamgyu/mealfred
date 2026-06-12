-- 코칭 엔진 v3 — 커리큘럼 진도 + 주간 목표 포트폴리오 (WBS A-01~A-04 · coaching-v3-build-plan.html)
-- 실행: Supabase 대시보드 SQL Editor에서 1회 (이사님). 멱등(2회 실행 무해). 실행 후 세션이 REST 프로브로 검증(A-01 DoD).
-- 부모 비노출 원칙(§13): RLS 정책 의도적 미생성 = anon/auth 0행, 서버만 접근(weekly_plans 패턴).

create table if not exists public.curriculum_progress (
  child_id uuid not null,
  unit_id text not null check (unit_id in (
    'pressure-off','hunger-rhythm','table-stage','exposure-savings','fullness-respect','parent-model',
    'no-bargain','table-talk','sensory-texture','food-bridge','autonomy-part','link-rhythm'
  )),
  status text not null default 'not_started' check (status in (
    'not_started','active','progressing','maintenance','mastered','pivoted','relapsed'
  )),
  step smallint not null default 0,           -- 과제 사다리 현재 단(0=미시작)
  evidence jsonb not null default '{}',       -- 신호 카운터(B-16 병합기 산출 — 유닛별 키는 lib/curriculum JSDoc)
  started_at date,
  mastered_at date,
  last_signal_at date,                        -- 1차 신호 마지막 관측일(정체 판정 B-19)
  stop_reason text,                           -- 피벗 사유: stalled | interrupted | replaced
  relapse_count smallint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (child_id, unit_id)
);

create index if not exists idx_cp_status on public.curriculum_progress(child_id, status);   -- A-02

alter table public.curriculum_progress enable row level security;   -- A-03: 정책 없음 = 비노출

-- A-04: 주간 목표 포트폴리오(2~3개) — [{"unit_id":"table-stage","priority":1,"status":"focus"}, ...]
alter table public.weekly_plans add column if not exists goals jsonb;

-- 롤백(A-08): 운영 데이터 생긴 뒤에는 drop 금지 — 소프트 리셋만 사용.
-- update public.curriculum_progress set status='not_started', step=0, evidence='{}', stop_reason=null;
-- drop table if exists public.curriculum_progress;
-- alter table public.weekly_plans drop column if exists goals;
