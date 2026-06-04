-- 커뮤니티 Phase 2 — 사진 스토리지 + 보상(주간 톱10·월간 대상) 지급 RPC.
-- 실행: Supabase SQL Editor에서 1회 (community Phase 1 SQL 이후).

-- ── 사진 버킷(공개 읽기 · 인증 사용자가 본인 폴더에만 업로드) ──
insert into storage.buckets (id, name, public) values ('community', 'community', true)
  on conflict (id) do nothing;

drop policy if exists community_photo_read on storage.objects;
create policy community_photo_read on storage.objects for select using (bucket_id = 'community');

drop policy if exists community_photo_write on storage.objects;
create policy community_photo_write on storage.objects for insert to authenticated
  with check (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists community_photo_del on storage.objects;
create policy community_photo_del on storage.objects for delete to authenticated
  using (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── 범용 커뮤니티 포인트 지급(멱등) — 주간 톱10·월간 대상·명예 등 ──
-- p_key(idempotency_key)로 중복 차단. 주간: 'community_weekly|<ISO주>|<post_id>' · 월간: 'community_monthly|<YYYY-MM>'
create or replace function public.award_community_points(p_parent uuid, p_amount int, p_kind text, p_key text, p_meta jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_bal int;
begin
  if p_amount is null or p_amount <= 0 then return 0; end if;
  if exists (select 1 from point_ledger where idempotency_key = p_key) then return 0; end if;
  insert into point_balance (parent_id, balance, total_earned)
    values (p_parent, p_amount, p_amount)
    on conflict (parent_id) do update
      set balance = point_balance.balance + p_amount, total_earned = point_balance.total_earned + p_amount, updated_at = now()
    returning balance into v_bal;
  insert into point_ledger (parent_id, kind, amount, meta, idempotency_key, balance_after)
    values (p_parent, p_kind, p_amount, coalesce(p_meta, '{}'::jsonb), p_key, v_bal);
  return p_amount;
end $$;
