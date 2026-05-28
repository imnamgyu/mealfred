-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 영유아 레시피 템플릿 (2026-05-28)
-- ingredient_recipes 에 상세(재료·조리·식감·팁) jsonb 컬럼 추가.
-- 기존 학령기 레시피(만6-18세) 외에, 영유아(younger/3-4y/5y/6-7y) age-matched
-- 템플릿을 LLM로 일회 생성해 저장 → 식단 composer가 LLM 없이 결정적으로 서빙.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행 (재실행 안전).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

alter table ingredient_recipes add column if not exists detail jsonb;
-- detail 예: {ingredients:[...], steps:[...], texture, tip, time_min, nutri_point}

-- 영유아 템플릿 빠른 조회용 인덱스
create index if not exists idx_recipes_young
  on ingredient_recipes(ingredient_id, age_band)
  where detail is not null;
