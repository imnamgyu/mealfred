-- 포인트 anti-fraud — 속도(burst) 한도. 멱등·자기초대차단은 이미 있음(여긴 farming 대량생성 방어).
-- 실행: Supabase SQL Editor에서 1회. (RPC 내부 로직 교체 → 앱 배포 불필요)
--
-- 위협 모델:
--  · 친구가입 +4,900P(=한 달 구독값, 돈 벡터): 가짜 카카오 계정 대량 생성 → 각 가입+첫끼니로 farming.
--    → 초대자별 '일 5건·월 100건' 속도 한도. 초과분은 영구 차단이 아니라 '보류'(다음 끼니 트리거에서 한도 풀리면 적립)
--       → 진짜 슈퍼인플루언서의 실사용 referral은 시간차로 결국 지급, farming 버스트만 차단.
--  · 끼니 +50P(저ROI 벡터): 다자녀 대량생성 farming. → 부모당 '월 900건'(=합리적 ~6자녀) 백스톱.
--  ※ 디바이스 fingerprint는 클라 작업 필요 → 후속. 서버측 속도 한도가 1차 방어.

-- ── 1) 친구가입 보너스 — 일/월 속도 한도 추가 ──────────────────────────────
create or replace function public.award_referral_bonus(p_referred_parent uuid)
returns int language plpgsql security definer as $$
declare
  v_code text; v_owner uuid; v_key text; v_bal int; v_day int; v_mon int;
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

  -- anti-fraud: 초대자 속도 한도(일 5·월 100). 초과면 보류(idempotency_key 안 박음 → 다음 끼니에서 한도 풀리면 적립).
  select count(*) into v_day from public.point_ledger
    where parent_id = v_owner and kind = 'referral_bonus' and created_at >= date_trunc('day', now());
  if v_day >= 5 then return 0; end if;
  select count(*) into v_mon from public.point_ledger
    where parent_id = v_owner and kind = 'referral_bonus' and created_at >= date_trunc('month', now());
  if v_mon >= 100 then return 0; end if;

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

-- ── 2) 끼니 적립 — 부모당 월 한도(다자녀 farming 백스톱) 추가 ──────────────────
create or replace function public.earn_meal_point(p_parent uuid, p_child uuid, p_date text, p_slot text, p_amount int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_key text := p_child::text || '|' || p_date || '|' || p_slot;
  v_today int;
  v_month int;
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
  -- 2b) anti-fraud: 부모당 월 끼니적립 한도(다자녀 대량생성 백스톱). 합리적 다자녀(~6명·월 ~900건)는 통과.
  select count(*) into v_month from point_ledger
    where parent_id = p_parent and kind = 'meal_input' and created_at >= date_trunc('month', now());
  if v_month >= 900 then
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
