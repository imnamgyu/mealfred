-- funnel_cohort — /admin/funnel 코호트 집계를 DB 안에서 1회 GROUP BY로.
-- 왜: 페이지가 force-dynamic이라 그릴 때마다 auth.users·children·meal_logs·app_visitors를
--  통째로 끌어와 JS에서 셌다. 1만 명 규모에선 (a) listUsers는 perPage 1000 한계로 숫자가 틀리고
--  (b) meal_logs 전 행을 distinct child_id 하나 만들려고 풀스캔했다(가장 무거움).
--  → 이 함수는 meal_logs를 EXISTS 세미조인으로만 건드리고, 일자별로 묶어 30행 수준만 반환한다.
-- 보안: security definer(소유자=postgres라 auth.users 읽음) + execute는 service_role만(어드민 라우트).
--  anon/authenticated는 실행 불가 → 전 계정 데이터 노출 차단(페이지 isAdmin 게이트와 이중).
-- 실행: Supabase SQL Editor에서 1회.

-- meal_logs 세미조인 가속(없으면 추가). 끼니가 수십만 행이어도 '존재 여부'만 빠르게.
create index if not exists meal_logs_child_idx on public.meal_logs (child_id);

create or replace function public.funnel_cohort()
returns table (day date, signups int, children int, meals int, visits int)
language sql
security definer
set search_path = public, auth
as $$
  with u as (
    select id, (created_at at time zone 'Asia/Seoul')::date as d
    from auth.users
  ),
  pc as (                                   -- 자녀를 1명이라도 등록한 부모
    select distinct parent_id from public.children
  ),
  pm as (                                   -- 자녀가 끼니를 1건이라도 남긴 부모(=활성)
    select distinct c.parent_id
    from public.children c
    where exists (select 1 from public.meal_logs m where m.child_id = c.id)
  ),
  flagged as (
    select u.d as day,
           (pc.parent_id is not null) as has_child,
           (pm.parent_id is not null) as has_meal
    from u
    left join pc on pc.parent_id = u.id
    left join pm on pm.parent_id = u.id
  ),
  signup as (
    select day,
           count(*)::int                            as signups,
           count(*) filter (where has_child)::int   as children,
           count(*) filter (where has_meal)::int    as meals
    from flagged
    group by day
  ),
  vis as (
    select (first_seen at time zone 'Asia/Seoul')::date as day, count(*)::int as visits
    from public.app_visitors
    group by 1
  )
  select coalesce(s.day, v.day)        as day,
         coalesce(s.signups, 0)        as signups,
         coalesce(s.children, 0)       as children,
         coalesce(s.meals, 0)          as meals,
         coalesce(v.visits, 0)         as visits
  from signup s
  full outer join vis v on s.day = v.day
  order by day desc;
$$;

revoke all on function public.funnel_cohort() from public, anon, authenticated;
grant execute on function public.funnel_cohort() to service_role;

comment on function public.funnel_cohort() is '/admin/funnel 가입일 코호트(가입→자녀→첫끼니) + 일자별 방문. service_role만. meal_logs는 세미조인.';
