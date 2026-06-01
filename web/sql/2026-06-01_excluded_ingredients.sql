-- 2026-06-01 · 추천 제외 재료 (집에 늘 있는 것)
-- 홈 '시도해볼 식재료'와 박스 배합에서 엄마가 뺀 재료를 저장.
-- 구매 전에 '🏠 있어요'를 누르면 추천/박스에서 빠지고 다음 우선순위가 채워진다.
-- 기존 children 행 소유자 정책(부모=본인 자녀 update)이 이 컬럼도 커버하므로 새 RLS 불필요.

alter table children
  add column if not exists excluded_ingredients text[] not null default '{}';
