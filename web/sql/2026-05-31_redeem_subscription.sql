-- 포인트로 월 구독 결제 차감 (4,900P = 1개월). 슈퍼 인플루언서 루프 완성.
-- 유료 만료일(포인트 결제분) 저장. 실제 만료 = max(무료만료 가입+30일, paid_until).
create table if not exists public.app_subscriptions (
  parent_id uuid primary key,
  paid_until date,
  updated_at timestamptz default now()
);
alter table public.app_subscriptions enable row level security;
do $$ begin
  create policy "own_sub_read" on public.app_subscriptions for select using (auth.uid() = parent_id);
exception when duplicate_object then null; end $$;

-- 포인트로 1개월 구독 결제 차감. balance >= p_amount면 차감 + paid_until 한 달 연장(이어붙이기).
-- 반환 jsonb: { ok, paid_until?, balance, reason? }. 멱등 아님(의도적 반복 결제 가능) — 더블클릭은 클라에서 차단.
create or replace function public.redeem_subscription(p_parent uuid, p_amount int)
returns jsonb language plpgsql security definer as $$
declare v_bal int; v_until date; v_base date;
begin
  -- 잔액 확인(행 잠금으로 동시성 차단)
  select balance into v_bal from public.point_balance where parent_id = p_parent for update;
  if v_bal is null or v_bal < p_amount then
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', coalesce(v_bal, 0));
  end if;

  -- 기존 유료 만료일 or 오늘 중 늦은 날부터 +30일(이어붙이기)
  select paid_until into v_until from public.app_subscriptions where parent_id = p_parent;
  v_base := greatest(coalesce(v_until, current_date), current_date);
  v_until := v_base + 30;

  -- 잔액 차감
  update public.point_balance
    set balance = balance - p_amount, total_redeemed = total_redeemed + p_amount, updated_at = now()
    where parent_id = p_parent
    returning balance into v_bal;

  -- 원장 기록(음수)
  insert into public.point_ledger (parent_id, child_id, kind, amount, meta, balance_after)
    values (p_parent, null, 'redeem_subscription', -p_amount, jsonb_build_object('paid_until', v_until), v_bal);

  -- 만료일 연장
  insert into public.app_subscriptions (parent_id, paid_until)
    values (p_parent, v_until)
    on conflict (parent_id) do update set paid_until = v_until, updated_at = now();

  return jsonb_build_object('ok', true, 'paid_until', v_until, 'balance', v_bal);
end $$;
