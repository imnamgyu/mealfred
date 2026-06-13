-- 코칭 편지 1탭 피드백(자가발전 Phase1·이사님 06-13) — coaching-self-improvement.html §3 ⭐1
-- 부모가 편지 카드에서 누르는 👍도움됐어요 / 👎별로 / 🔁또 비슷해요. 직접 보상신호 + '같은 편지' 자동탐지.
create table if not exists public.letter_feedback (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_id uuid not null,
  letter_date date not null,
  rating text not null check (rating in ('up','down','repeat')),
  created_at timestamptz not null default now(),
  unique (child_id, letter_date)   -- 하루 1표(덮어쓰기)
);
alter table public.letter_feedback enable row level security;
-- 본인 자녀 편지에만 피드백(부모 = parent_id 일치)
create policy lf_owner on public.letter_feedback
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());
create index if not exists lf_child_date on public.letter_feedback (child_id, letter_date desc);
