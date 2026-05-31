-- children에 만성질환·특이사항 — 코칭·영양 제한에 반영(예: 당뇨·신장·갑상선·PKU·유당불내증).
-- 자유 텍스트(쉼표 구분). 마이페이지에서 부모가 직접 입력.
alter table public.children add column if not exists chronic_conditions text;
