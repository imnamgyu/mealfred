-- 전역 메뉴→식재료 '학습 사전'. 정적 menu-dict.json·룰·스캔이 못 푼 메뉴를 LLM이 분해하면
-- 그 결과를 여기에 적재해 둔다 → 다음에 같은 메뉴가 들어오면 LLM 없이 무료 사전 히트.
-- 우선순위(읽기): user_menu_overrides(부모 교정·부모한정) > learned_menus(기계·전역) > menu-dict(정적).
-- 부모가 care에서 교정하면 그 부모는 override가 이기고, 다른 부모는 learned를 계속 본다.
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

create table if not exists public.learned_menus (
  menu        text primary key,        -- 정규화 키: trim().replace(/\s/g,'') (care override·mapMenuLocal과 동일 규칙)
  ingredients text[] not null,         -- canon+CANON_VOCAB 통과한 표준 식재료만(환각 차단). 빈 배열은 저장 안 함
  processed   boolean not null default false,
  source      text,                    -- 학습 경로: 'llm' | 'rule' | 'scan' | 'dict'
  hits        integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.learned_menus enable row level security;
-- 비민감 전역 데이터지만 쓰기·읽기 모두 service_role(크론·parse 라우트)로만. 정책 없음 = deny all → service_role만 우회.

-- 멱등 학습 upsert(원자적 hits 증가). security definer라 RLS 우회. 호출은 service_role 클라이언트.
create or replace function public.learn_menu(p_menu text, p_ings text[], p_processed boolean, p_source text)
returns void language sql security definer set search_path = public as $$
  insert into public.learned_menus (menu, ingredients, processed, source, hits)
  values (p_menu, p_ings, p_processed, p_source, 1)
  on conflict (menu) do update set
    ingredients = excluded.ingredients,                       -- 최신 분해로 갱신
    processed   = learned_menus.processed or excluded.processed,
    source      = excluded.source,
    hits        = learned_menus.hits + 1,
    updated_at  = now();
$$;
