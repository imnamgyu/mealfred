-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 결과 공유 URL 마이그레이션 (2026-05-28)
-- 분석 결과 스냅샷을 저장 → 별도 URL(?r=id)로 공유/조회.
-- 조회 시 LLM 미사용(read만). 링크는 3일 후 만료.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행 (재실행 안전).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

alter table eval_results add column if not exists result_json jsonb;
alter table eval_results add column if not exists expires_at timestamptz default (now() + interval '3 days');

create index if not exists idx_eval_results_expires on eval_results(expires_at) where result_json is not null;

-- (선택) 만료 스냅샷 비우기 — 통계 행/컬럼은 유지, 렌더 데이터만 제거.
-- 크론 또는 수동으로 주기 실행:
-- update eval_results set result_json = null
--   where expires_at < now() and result_json is not null;
