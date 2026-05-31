-- 친구 가입 + 첫 끼니 기록 시 초대자에게 +4,900P (한 달 구독값).
-- 1) 신규 유저가 '어느 코드로 왔는지' 저장 (가입 시 onboarding에서 채움)
alter table public.children add column if not exists referred_by_code text;

-- 2) referral 보너스 적립 RPC — 끼니 적립 직후 호출. 멱등(referred 유저당 1회), 자기초대 차단.
--    "가입 + 첫 기록" 조건: earn에서 끼니 저장 시 호출되므로 기록이 있어야 트리거되고,
--    멱등 키로 1회만 적립 → 사실상 '첫 끼니에 1회'.
create or replace function public.award_referral_bonus(p_referred_parent uuid)
returns int language plpgsql security definer as $$
declare
  v_code text; v_owner uuid; v_key text; v_bal int;
begin
  -- 이 유저(피초대자)가 들어온 초대 코드
  select referred_by_code into v_code
    from public.children
    where parent_id = p_referred_parent and referred_by_code is not null
    limit 1;
  if v_code is null then return 0; end if;

  -- 초대자(코드 주인). 자기 자신 초대는 차단.
  select parent_id into v_owner from public.app_referrals where code = v_code;
  if v_owner is null or v_owner = p_referred_parent then return 0; end if;

  -- 멱등: 이 피초대자에 대한 보너스는 1회만
  v_key := 'referral_bonus|' || p_referred_parent::text;
  if exists (select 1 from public.point_ledger where idempotency_key = v_key) then return 0; end if;

  -- 초대자에게 +4,900P
  insert into public.point_balance (parent_id, balance, total_earned)
    values (v_owner, 4900, 4900)
    on conflict (parent_id) do update
      set balance = point_balance.balance + 4900,
          total_earned = point_balance.total_earned + 4900,
          updated_at = now()
    returning balance into v_bal;

  insert into public.point_ledger (parent_id, child_id, kind, amount, meta, idempotency_key, balance_after)
    values (v_owner, null, 'referral_bonus', 4900,
            jsonb_build_object('referred_parent', p_referred_parent, 'code', v_code),
            v_key, v_bal);

  return 4900;
end $$;
