-- 2026-06-23 런칭 스키마 가드(이사님): 비용캡·이미지·7축 컬럼을 git로 추적(B2).
-- 그동안 수동 DDL로만 prod에 들어가 있어 환경복제·롤백 시 유실 위험 → 멱등 ALTER로 고정.
-- 안전: 모두 `if not exists`라 이미 있어도 무해. Supabase SQL editor에서 그대로 실행.

-- 식단 1벌: 중복분석 5회 캡 카운터 + 부모 업로드 원본 이미지(어드민 상세용)
alter table public.institution_menus
  add column if not exists analysis_count int not null default 0,
  add column if not exists image_urls text[] not null default '{}';

-- 점수: 7축(어드민 리스트) + 빛나는 강점 raw 지표
alter table public.institution_scores
  add column if not exists axes jsonb not null default '{}'::jsonb,
  add column if not exists standout_dims jsonb not null default '{}'::jsonb;

-- 실재 검증(런칭 전 1회 확인용):
--   select column_name from information_schema.columns
--   where table_name in ('institution_menus','institution_scores')
--     and column_name in ('analysis_count','image_urls','axes','standout_dims');
