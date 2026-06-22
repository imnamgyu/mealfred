-- 2026-06-22 기관 강점지표(코호트 비교용) — '우리 원이 다른 원보다 특별히 뛰어난 점' 한 줄.
-- 점수(computeDiversityScore)는 거의 전원 90+로 변별력 낮음(영양사+급식센터로 다 훌륭) → 등수는 종이 한 장.
-- 그래서 '약점'은 절대 안 보이고, 코호트 percentile로 그 원의 '대표 강점' 1개만 긍정 노출(이사님 2026-06-22).
alter table public.institution_scores add column if not exists standout_dims jsonb default '{}';
