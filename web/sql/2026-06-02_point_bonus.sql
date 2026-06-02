-- 일회성 보너스 적립 RPC — 식단표 업로드 +1,000P 등.
-- earn_meal_point와 달리 '일일 5끼 한도' 없음. 멱등키로 중복만 차단(예: 'daycaremenu|<child>|<YYYY-MM>').
-- 적립은 service_role API(/api/points/bonus)에서만. 금액·kind는 서버가 결정(클라 위조 불가).
-- 실행: Supabase 대시보드 SQL Editor에서 1회. (point_ledger/point_balance는 2026-05-31_points.sql 선행)

create or replace function public.earn_bonus(
  p_parent uuid, p_child uuid, p_key text, p_amount int, p_kind text, p_meta jsonb default '{}'::jsonb
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_bal int;
begin
  -- 같은 멱등키 이미 있으면 적립 0(중복)
  if exists (select 1 from point_ledger where idempotency_key = p_key) then
    return 0;
  end if;
  insert into point_balance (parent_id, balance, total_earned)
    values (p_parent, p_amount, p_amount)
    on conflict (parent_id) do update
      set balance = point_balance.balance + p_amount,
          total_earned = point_balance.total_earned + p_amount,
          updated_at = now()
    returning balance into v_bal;
  insert into point_ledger (parent_id, child_id, kind, amount, meta, idempotency_key, balance_after)
    values (p_parent, p_child, p_kind, p_amount, p_meta, p_key, v_bal);
  return p_amount;
end $$;
