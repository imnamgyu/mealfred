-- ⭐ 무접촉 prefill 추정 마커 (이사님 2026-07-05 — 마커 방식 채택)
--   /care 입력폼은 장소·시간·식감·자율성·환경·소요시간을 개인 패턴/carry-forward로 미리 채운다(P0-D).
--   부모가 안 만지고 저장하면 지금까지는 그 추정값이 '관찰 데이터'와 구분 불가로 영구화됐다 —
--   ① 다음 패턴 계산(mealDefaults)의 표본이 되는 자기강화 루프 ② carry-forward 연쇄 전파.
--   이 컬럼이 '어느 필드가 추정으로 저장됐나'를 기록한다(DB 컬럼명 목록).
--   소비: 클라 mealDefaults(패턴 학습에서 제외)·lastEnv carry-forward(명시값만 물어옴).
--   엔진(P0-D 졸업 판정 등)은 현행 유지 — child_daily_state 작업 때 마커 활용 결정.
--   additive · 기존 데이터 무영향(null=전부 명시값 취급). 코드는 컬럼 미적용 시 자동 폴백.
alter table public.meal_logs
  add column if not exists inferred_fields text[];

comment on column public.meal_logs.inferred_fields is
  '부모가 직접 안 찍고 prefill 추정으로 저장된 필드의 DB 컬럼명 목록(place·meal_time·texture·autonomy·environment·duration_min). null/빈배열=전부 명시 입력.';
