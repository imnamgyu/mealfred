-- children UPDATE RLS — 부모가 자기 자녀 프로필(성별 sex·등원 daycare 등)을 수정할 수 있게.
-- 증상: 성별/등원 토글을 눌러도 저장이 안 됨(BMI 또래 퍼센타일 안 뜸). 원인: children에 UPDATE 정책 부재 시 RLS가 막음.
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

alter table public.children enable row level security;
drop policy if exists children_update on public.children;
create policy children_update on public.children
  for update using (parent_id = auth.uid()) with check (parent_id = auth.uid());
