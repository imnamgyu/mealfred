-- ⭐ 신호포착(선호계량화) — 수용 5단계 척도 컬럼 (이사님 2026-06-19)
--   진짜 연속성 천장 = '아이가 뭘 받아들이는지 모름'(ate_well 이진·미상 80%). 5단계로 진전을 포착해야
--   커리큘럼이 '한입→조금→완식'을 졸업 신호로 잡고(step 정체 해소), 추천이 진짜 선호 기반이 된다.
--   척도: 0=거부 · 1=만짐/냄새(탐색) · 2=한입 · 3=조금 · 4=완식.
--   ate_well 호환 유지(true→4·false→0·null→미상). 신규 컬럼 = additive · 기존 데이터 무영향.
alter table public.meal_logs
  add column if not exists acceptance_level smallint check (acceptance_level between 0 and 4),
  add column if not exists refused_category text;   -- 구조화 거부사유(맛·식감·양·환경) — 선택, 콤마분리

comment on column public.meal_logs.acceptance_level is
  '수용 5단계(0거부·1만짐/탐색·2한입·3조금·4완식). 선호계량화 신호 원천. null=미상. ate_well과 병행(true≈4·false≈0).';
comment on column public.meal_logs.refused_category is
  '구조화 거부사유(맛·식감·양·환경 등 콤마분리). 자유텍스트 refused와 별개.';
