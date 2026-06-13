-- 2026-06-13 · 코칭 v2 하이브리드 A/B 비교 — 편지 변형별 선호 투표(EPIC G)
-- 아린에게 매일 2통(A=기존 v2 대조군 · B=하이브리드 처치군)을 발행하고,
-- 이사/부모가 A·B 각각에 👍도움됐어요/👎별로/🔁또비슷 1탭 평가 → 승자 데이터 판정(judgeWinner).
-- letter_feedback은 (child_id, letter_date) 1행 제약이라 변형별 투표를 못 담음 → 별도 테이블(additive·실험 종료 시 제거 가능).
-- 멱등(if not exists). 부모 본인 자녀만(RLS). 편지 2통 저장 자체는 coach_letters.context.altLetter(jsonb)라 DDL 불필요.

create table if not exists compare_votes (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references children(id) on delete cascade,
  parent_id   uuid not null,
  letter_date date not null,
  variant     text not null check (variant in ('A', 'B')),          -- A=기존 v2 · B=하이브리드
  rating      text not null check (rating in ('up', 'down', 'repeat')),
  created_at  timestamptz not null default now(),
  unique (child_id, letter_date, variant)                            -- 변형별 하루 1표(덮어쓰기 upsert)
);

create index if not exists idx_compare_votes_child_date on compare_votes (child_id, letter_date);

alter table compare_votes enable row level security;

-- 부모 본인 자녀 투표만 읽기·쓰기(letter_feedback와 동일 패턴). 어드민 집계는 service_role.
drop policy if exists compare_votes_owner on compare_votes;
create policy compare_votes_owner on compare_votes
  for all
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());
