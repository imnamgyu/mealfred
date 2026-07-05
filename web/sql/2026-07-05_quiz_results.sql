-- ⭐ 아이 편식 상식 점수 — 설문 결과 적재 (이사님 2026-07-05)
--   목적: ①문항별 오답률 실측(콘텐츠·게시글 소재: "부모 N%가 이 문제를 틀려요") ②평균/분포 보고서
--        ③나중에 "상위 X%" 실데이터 표시 근거. 익명(개인정보 없음) — 응답 원본은 선택 인덱스뿐.
--   qv = 문항 세트 버전('k1'=2026-07-05 확정 10문항). 문항을 바꾸면 qv를 올려 집계를 분리한다(오답률 오염 방지).
create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  tool text not null default 'knowledge',        -- 테스트 종류(knowledge=상식점수, 추후 bti 등 확장)
  qv text not null default 'k1',                 -- 문항 세트 버전
  score smallint not null check (score between 0 and 100),
  correct smallint not null check (correct between 0 and 10),
  answers jsonb not null default '[]'::jsonb,    -- 문항별 선택 인덱스 배열 [3,1,0,...]
  wrong jsonb not null default '[]'::jsonb,      -- 틀린 문항 인덱스 배열 [0,4,7] — 오답률 집계용
  created_at timestamptz not null default now()
);

create index if not exists quiz_results_tool_qv_idx on public.quiz_results (tool, qv, created_at desc);

-- RLS: 직접 접근 차단 — 쓰기/읽기는 서버 API(/api/quiz-result, service_role)만.
alter table public.quiz_results enable row level security;

comment on table public.quiz_results is '편식 상식 점수 등 쿠키 테스트 익명 응답. 문항별 오답률·평균은 GET /api/quiz-result 집계.';
