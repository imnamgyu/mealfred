-- llm_usage — 자녀×일자 LLM 토큰 사용량/원가 실측 (코칭 유지비용)
--
-- 실행: Supabase SQL Editor에 붙여넣고 RUN. (없어도 크론은 안전 degrade — try/catch로 기록만 생략)
-- 적재: app/api/cron/coach/route.ts 가 자녀 루프 finally에서 그 자녀의 모든 LLM 콜(편지·질문·주간)을
--       합산해 1행 upsert. 토큰은 패밀리(haiku/sonnet)별·캐시 read/write 분리 보존(단가 변동 소급 가능).
-- 조회: /admin/llm-usage 가 service_role로 읽어 1인당 평균 유지비용 테이블 렌더.
-- 접근: RLS on·정책 없음 = service_role(크론 write·어드민 read)만. 부모 앱은 접근 불가.

create table if not exists llm_usage (
  child_id          uuid not null,
  parent_id         uuid,
  usage_date        date not null,
  calls             int  not null default 0,
  -- Haiku(일간 편지 생성·퇴고·검증·질문)
  haiku_in          bigint default 0,
  haiku_cache_read  bigint default 0,
  haiku_cache_write bigint default 0,
  haiku_out         bigint default 0,
  -- Sonnet(주간 종합·intro 편지·두뇌 켜면 일간 선택)
  sonnet_in          bigint default 0,
  sonnet_cache_read  bigint default 0,
  sonnet_cache_write bigint default 0,
  sonnet_out         bigint default 0,
  cost_usd          numeric(12,6) default 0,   -- 적재 시점 단가 기준 원가(USD). 토큰으로 소급 재계산 가능.
  detail            jsonb,                      -- 패밀리별 토큰 원본({haiku:{...}, sonnet:{...}})
  updated_at        timestamptz default now(),
  primary key (child_id, usage_date)
);

alter table llm_usage enable row level security;
-- 정책 미생성 = service_role 전용(RLS on, no policy). 어드민은 service_role로 읽음.

create index if not exists llm_usage_date_idx on llm_usage (usage_date);
