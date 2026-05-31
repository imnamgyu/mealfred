-- M7 포인트 v0 — 끼니 입력 정액 적립(기획 v2: 90일 챌린지 → 포인트 → 골고루 키트).
-- 1P = 1원. 끼니 입력 1건 = +50P(서버 상수), 일일 5끼 한도, 같은 (자녀·날짜·끼니) 중복 차단(멱등).
-- 적립은 service_role API(/api/points/earn)에서 earn_meal_point RPC로만. 차감(키트)은 M10.
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

-- append-only 원장(모든 적립·차감 기록, 감사용)
create table if not exists public.point_ledger (
  id            bigserial primary key,
  parent_id     uuid not null references auth.users(id) on delete cascade,
  child_id      uuid references public.children(id) on delete set null,
  kind          text not null,        -- 'meal_input' | 'redeem_kit' | 'challenge_bonus' | 'admin_adjust'
  amount        int not null,         -- +적립 / -차감
  meta          jsonb,                -- {date, slot, order_id, ...}
  idempotency_key text unique,        -- 중복 적립 방지. meal: '<child>|<YYYY-MM-DD>|<slot>'
  balance_after int not null,         -- 거래 후 잔액(감사)
  created_at    timestamptz not null default now()
);
create index if not exists point_ledger_parent_idx on public.point_ledger (parent_id, created_at desc);

-- 잔액 캐시(read 성능)
create table if not exists public.point_balance (
  parent_id      uuid primary key references auth.users(id) on delete cascade,
  balance        int not null default 0,
  total_earned   int not null default 0,
  total_redeemed int not null default 0,
  updated_at     timestamptz not null default now()
);

alter table public.point_ledger enable row level security;
alter table public.point_balance enable row level security;
-- 본인 것만 조회. 쓰기는 service_role(API)만(정책 없음 = deny, RPC는 security definer).
drop policy if exists point_ledger_select_own on public.point_ledger;
create policy point_ledger_select_own on public.point_ledger for select using (parent_id = auth.uid());
drop policy if exists point_balance_select_own on public.point_balance;
create policy point_balance_select_own on public.point_balance for select using (parent_id = auth.uid());

-- 끼니 입력 적립 — 멱등(중복 차단) + 일일 5끼 한도 + 잔액 트랜잭션.
-- 반환 = 이번에 실제 적립된 포인트(0 = 중복/한도 도달, p_amount = 적립됨).
create or replace function public.earn_meal_point(p_parent uuid, p_child uuid, p_date text, p_slot text, p_amount int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_key text := p_child::text || '|' || p_date || '|' || p_slot;
  v_today int;
  v_bal int;
begin
  -- 1) 같은 (자녀·날짜·끼니) 중복 → 적립 0
  if exists (select 1 from point_ledger where idempotency_key = v_key) then
    return 0;
  end if;
  -- 2) 일일 한도 5끼(그 자녀의 그 날 meal_input 적립 수) → 적립 0
  select count(*) into v_today from point_ledger
    where kind = 'meal_input' and child_id = p_child and (meta->>'date') = p_date;
  if v_today >= 5 then
    return 0;
  end if;
  -- 3) 잔액 갱신
  insert into point_balance (parent_id, balance, total_earned)
    values (p_parent, p_amount, p_amount)
    on conflict (parent_id) do update
      set balance = point_balance.balance + p_amount,
          total_earned = point_balance.total_earned + p_amount,
          updated_at = now()
    returning balance into v_bal;
  -- 4) 원장 기록
  insert into point_ledger (parent_id, child_id, kind, amount, meta, idempotency_key, balance_after)
    values (p_parent, p_child, 'meal_input', p_amount,
            jsonb_build_object('date', p_date, 'slot', p_slot), v_key, v_bal);
  return p_amount;
end $$;
