-- 편식키트 탭(커뮤니티 탭 개편) — 사전예약 주문 + 확정 시 포인트 차감(redeem_kit).
-- 사전예약 = 결제 아님: 신청 시 use_points(사용 의사)만 기록, 실제 차감은 관리자 확정 때 redeem_kit RPC.
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

create table if not exists public.kit_orders (
  id              uuid primary key default gen_random_uuid(),
  parent_id       uuid not null references auth.users(id) on delete cascade,
  kit_type        text not null check (kit_type in ('gollo', 'focus')),
  course          text,                 -- 집중 키트만(당근~가지 9종). 골고루는 null
  recipient_name  text not null,
  phone           text not null,        -- 숫자만(01012345678) — 서버 검증 후 저장
  address         text not null,
  use_points      int  not null default 0,   -- 신청 시 할인 사용 '의사'(서버가 잔액·가격으로 상한)
  point_redeemed  int  not null default 0,   -- 확정 시 실제 차감된 포인트
  status          text not null default 'requested' check (status in ('requested', 'confirmed', 'cancelled', 'fulfilled')),
  admin_note      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists kit_orders_parent_idx on public.kit_orders (parent_id, created_at desc);
create index if not exists kit_orders_status_idx on public.kit_orders (status, created_at desc);
-- 동일 (부모·키트종류) 미처리 신청 1건 제한 — API check-then-insert 레이스를 DB에서 봉쇄(중복 확정→이중 차감 방지)
create unique index if not exists kit_orders_one_open_per_type on public.kit_orders (parent_id, kit_type) where status = 'requested';

alter table public.kit_orders enable row level security;
-- 본인 신청 내역만 조회. 쓰기는 service_role API만(정책 없음 = deny).
drop policy if exists kit_orders_select_own on public.kit_orders;
create policy kit_orders_select_own on public.kit_orders for select using (parent_id = auth.uid());

-- 확정 시 포인트 차감 — redeem_subscription 패턴(행 잠금·잔액 검증·음수 원장) + 주문 멱등키.
-- 멱등: point_ledger.idempotency_key = 'kit|<order_id>' 유니크 — 같은 주문 이중 확정해도 1회만 차감.
-- 반환 jsonb: { ok, redeemed, balance, reason? }  (p_amount 0이면 차감 없이 상태만 확정)
create or replace function public.redeem_kit(p_parent uuid, p_order uuid, p_amount int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_bal int; v_key text := 'kit|' || p_order::text;
begin
  if p_amount < 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_amount');
  end if;

  -- 이미 이 주문으로 차감했으면 멱등 반환
  if exists (select 1 from point_ledger where idempotency_key = v_key) then
    select balance into v_bal from point_balance where parent_id = p_parent;
    return jsonb_build_object('ok', true, 'redeemed', 0, 'balance', coalesce(v_bal, 0), 'reason', 'already');
  end if;

  if p_amount = 0 then
    select balance into v_bal from point_balance where parent_id = p_parent;
    return jsonb_build_object('ok', true, 'redeemed', 0, 'balance', coalesce(v_bal, 0));
  end if;

  -- 잔액 확인(행 잠금으로 동시성 차단)
  select balance into v_bal from point_balance where parent_id = p_parent for update;
  if v_bal is null or v_bal < p_amount then
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', coalesce(v_bal, 0));
  end if;

  update point_balance
    set balance = balance - p_amount, total_redeemed = total_redeemed + p_amount, updated_at = now()
    where parent_id = p_parent
    returning balance into v_bal;

  insert into point_ledger (parent_id, child_id, kind, amount, meta, idempotency_key, balance_after)
    values (p_parent, null, 'redeem_kit', -p_amount, jsonb_build_object('order_id', p_order), v_key, v_bal);

  return jsonb_build_object('ok', true, 'redeemed', p_amount, 'balance', v_bal);
end $$;

-- ⚠️ 노출 차단(하우스 규칙 '포인트 쓰기는 service_role RPC만') — public 함수는 기본 EXECUTE가 anon/authenticated에
-- 열려 PostgREST /rest/v1/rpc/* 로 직접 호출 가능하다(funnel_cohort 선례와 동일 처리).
revoke all on function public.redeem_kit(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.redeem_kit(uuid, uuid, int) to service_role;

-- 기존 포인트 RPC 4종도 동일 노출이 확인돼 함께 잠근다(호출자는 전부 service_role API — 검증 완료).
-- 특히 earn_meal_point는 p_amount가 호출자 인자라 노출 시 임의 적립 가능(치명). 함수 없으면 조용히 스킵.
do $$ begin
  revoke all on function public.earn_meal_point(uuid, uuid, text, text, int) from public, anon, authenticated;
  grant execute on function public.earn_meal_point(uuid, uuid, text, text, int) to service_role;
exception when undefined_function then null; end $$;
do $$ begin
  -- 시그니처: (p_parent uuid, p_child uuid, p_key text, p_amount int, p_kind text, p_meta jsonb)
  revoke all on function public.earn_bonus(uuid, uuid, text, int, text, jsonb) from public, anon, authenticated;
  grant execute on function public.earn_bonus(uuid, uuid, text, int, text, jsonb) to service_role;
exception when undefined_function then null; end $$;
do $$ begin
  revoke all on function public.redeem_subscription(uuid, int) from public, anon, authenticated;
  grant execute on function public.redeem_subscription(uuid, int) to service_role;
exception when undefined_function then null; end $$;
do $$ begin
  revoke all on function public.award_referral_bonus(uuid) from public, anon, authenticated;
  grant execute on function public.award_referral_bonus(uuid) to service_role;
exception when undefined_function then null; end $$;
