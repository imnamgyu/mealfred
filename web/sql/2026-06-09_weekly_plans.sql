-- 주간 코칭 닻(작전층) — coaching-weekly-plan.html §3·§13·§14.
-- 일요일 종합(Sonnet)이 '다가올 주'의 초점 타깃·예산·의사 소견을 1행으로 저장,
-- 월~토 일간 실행이 이 닻을 읽어 그날 phase를 결정한다.
-- ⭐ 안전 제1원칙: 닻이 없거나 LLM 실패해도 일간은 현행 planFor 폴백으로 항상 편지를 낸다(이 테이블 유무와 무관).
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

create table if not exists public.weekly_plans (
  child_id       uuid not null references public.children(id) on delete cascade,
  week_key       text not null,                       -- isoWeekKey(today+1) = 다가올 주(일요일 종합이 +1 보정해 저장 · §9 Q1)
  status         text not null default 'active',      -- active | degraded | stale_carried | cold_synth | none
  source         text not null default 'weekly_llm',  -- weekly_llm | carried | cold_synth | none
  mission        text,                                -- 부모용 미션 1줄(편지에 녹임 — 미션 카드/직접 노출 금지 · §13)
  mission_target text,                                -- 초점 타깃 1개(주 내내 불변)
  target_pool    text[],                              -- 같은 식품군 대체 식재료(일간 교정은 이 풀 안에서만)
  secondary_axis text,                                -- 보조 축 1개(환경/자율성 — 식품 아님)
  budget         jsonb not null default '{"expose":2,"push":1,"cadenceMinGap":1,"pushWindow":[2,3,4]}'::jsonb,  -- 노출 2~3·채근 1·노출 최소간격 1일·push 윈도우(화수목=dow 2,3,4)
  ledger         jsonb not null default '{"pushUsed":false,"exposeCount":{},"lastExposeDow":null,"arcWeek":1,"reanchorUsed":false,"adviceGivenAt":null,"firstServeDow":null,"progressWeek":1}'::jsonb,  -- 소비 추적·다주 메모리·행동지연(§13)
  impression     text,                                -- ⭐ 의사식 종합 소견(Sonnet · §14) — 일간/다음 주 종합이 read. 부모 비노출.
  arc_week       int not null default 1,              -- 이 미션 몇 주째(다주 아크 3~5주)
  basis          jsonb,                               -- 종합 근거 스냅샷(지난주 metrics·reds·favoriteFoods·구조화 분포)
  basis_hash     text,                                -- 멱등: 지난주 입력 지문(동일하면 LLM 스킵·carry)
  basis_attends_daycare boolean,                      -- 등원 변경 감지(§8)
  model          text default 'sonnet-4-6',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (child_id, week_key)
);
create index if not exists weekly_plans_child_idx on public.weekly_plans (child_id, week_key desc);

alter table public.weekly_plans enable row level security;
-- ⚠️ 의도적으로 '부모 select 정책 없음'(§13 미션 비노출):
--    mission·mission_target·target_pool·ledger·impression가 부모 클라(로그인 세션 RLS)로 새지 않게 한다.
--    부모는 coach_letters(편지)만 읽고, 미션은 편지에 녹아서만 전달된다.
--    쓰기·읽기는 크론(세션 없는 service_role 컨텍스트)·어드민(createSupabaseAdmin=service_role)만 — RLS 우회.
--    period_summaries와 달리 본인-자녀 select 정책을 두지 않는 게 핵심(이 테이블은 엔진 내부 상태).
