-- ⭐ 주간계획 모듈(작전층) 테이블 설계 확장 — 이사님 2026-06-18
--   기존 weekly_plans는 mission_target(카테고리 1개)·target_pool(≤4군)만 들고 있어 '빈약'했고,
--   그래서 일간 편지가 매일 콩류→두부로 다양성이 붕괴했다. 주간계획 모듈(enrichWeeklyPlan)이
--   다른 모듈(추천엔진·영양거울·영양평가·진척·그래프)을 오케스트레이션해 '7일치 구체 dish 회전 ·
--   2트랙 풀 · BMI/탄단지 macro 트랙 · anti-stall 커리큘럼 · 영양거울 스케줄'을 미리 구워 이 컬럼에 적재한다.
--   일간(월~토)은 slot=(daySeed+cidHash)%7로 이 계획을 결정론 소비하되 '그날 기록된 데이터'로 vetting(유연성 가드).
--   SSOT는 기존 컬럼 유지(불일치 시 기존 컬럼 우선) · plan_detail은 부가 캐시(degrade-safe).
alter table public.weekly_plans
  add column if not exists plan_detail jsonb;

comment on column public.weekly_plans.plan_detail is
  '주간계획 모듈 산출(작전층 부가 계획): targetRotation[7] 구체 dish 회전·supplyPool/challengePool 2트랙·macroTrack(BMI/탄단지)·curriculum(anti-stall)·mirrorSchedule[7]. 일간이 slot으로 소비. schemaVersion 포함. null=thin 폴백.';
