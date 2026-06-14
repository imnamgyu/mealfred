-- menu_resolve_skip — 메뉴→식재료 분해 '실패(LLM 빈 결과)' negative-cache.
--
-- 배경: saveLearned는 빈 식재료 배열 저장을 거부한다(환각 방지). 그래서 분해 불가 메뉴(한과·스낵·신조어 등)는
--   learned_menus에 안 남고, 2시 백필 크론이 매일 같은 메뉴를 다시 LLM 호출 → 예산(maxLlmCalls=8) 낭비 +
--   진짜 신규 메뉴가 예산 부족으로 처리 못 되는 '기아(starvation)' 발생.
-- 해결: LLM이 빈 결과를 낸 메뉴를 여기 기록 → 백필이 최근 COOLDOWN_DAYS(코드 14일) 내면 LLM 건너뜀.
--   쿨다운으로만 재시도하므로 도감/사전 개선 후엔 자연 재해소된다.
-- 정합: 도감·사전(menu-dict/lexicon)·도감 식재료가 바뀌면 /mealfred-food-mapping 스킬이 이 표를 비워(또는
--   해당 행 삭제) 재해소를 허용한다. (정적 산출물 개선 = 분해 가능성 변화 → negative-cache 무효화.)
--
-- 접근: RLS on·정책 없음 → service_role(createSupabaseAdmin)로만. learned_menus와 동일 운영.
-- 이 DDL을 실행하기 전에도 백필은 정상 동작한다(코드가 테이블 부재 시 graceful degrade = 현행 동작).

create table if not exists public.menu_resolve_skip (
  menu       text primary key,                                   -- 정규화 메뉴키(normalizeMenuKey와 동일 규칙)
  attempts   int  not null default 1,                            -- 누적 실패 시도 수(진단용)
  last_tried date not null default (now() at time zone 'utc')::date,  -- 마지막 LLM 시도일 — 쿨다운 기준
  created_at timestamptz not null default now()
);

-- 쿨다운 스캔(.in(menu).gte(last_tried, cutoff)) 가속
create index if not exists menu_resolve_skip_last_tried_idx on public.menu_resolve_skip (last_tried);

alter table public.menu_resolve_skip enable row level security;
-- 정책 미생성 = service_role 외 접근 불가(의도).
