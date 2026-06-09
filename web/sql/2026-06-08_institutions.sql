-- 2026-06-08 기관(어린이집·유치원·학교) 디렉터리 — 정확한 기관 기록 + 키트 언락 캠페인 기반
-- 출처: 공공데이터포털 전국어린이집표준데이터(15013108)·전국유치원표준데이터(15096279)·NEIS schoolInfo
-- 부모는 이 마스터에서 '검색→선택'만 하고 children.institution_id(불변 FK)로 저장(자유텍스트 금지).

create extension if not exists pg_trgm;   -- 한글 이름 자동완성(trigram 검색)

create table if not exists public.institutions (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                 -- 'daycare'(어린이집) | 'kindergarten'(유치원) | 'school'(초중고)
  name        text not null,
  name_norm   text not null,                 -- 정규화 검색명(공백 제거 등) — 자동완성 매칭용
  inst_type   text,                          -- 세부유형: 국공립/민간/가정/사회복지법인(어린이집)·공립/사립(유치원)

  sido        text,                          -- 시도
  sigungu     text,                          -- 시군구
  dong        text,                          -- 읍면동(주소에서 파싱) — 동명 구분 표시용
  address     text,                          -- 전체 주소(도로명/지번)
  zipcode     text,
  capacity    int,                           -- 정원
  lat         double precision,
  lng         double precision,
  ext_code    text,                          -- 공식코드(있으면): 어린이집/유치원/SD_SCHUL_CODE. 동기화용
  status      text default 'active',         -- 운영현황(정상/휴지/폐지)
  source      text,                          -- 'childcare_std' | 'kindergarten_std' | 'neis'
  raw         jsonb,                          -- 원본 행 보존(추후 항목 추가 대비)
  created_at  timestamptz default now()
);

-- 자연 dedup 키(공식코드가 없는 표준데이터 대비): 유형+정규화명+주소로 1행. REST on_conflict 대상(평면 컬럼).
create unique index if not exists institutions_natural_key on public.institutions (type, name_norm, address);
-- 자동완성: 정규화명 trigram + 지역 좁히기
create index if not exists institutions_name_trgm on public.institutions using gin (name_norm gin_trgm_ops);
create index if not exists institutions_region    on public.institutions (sido, sigungu);
-- 공식코드 보조 인덱스(있을 때만)
create index if not exists institutions_ext_code  on public.institutions (ext_code) where ext_code is not null;

-- 디렉터리는 공개 정보(정부 공개데이터) → 검색 읽기 공개, 쓰기는 service_role(시드 스크립트)만.
alter table public.institutions enable row level security;
drop policy if exists institutions_read on public.institutions;
create policy institutions_read on public.institutions for select using (true);

-- 자녀 ↔ 기관 연결(불변 FK). referred_by_code와 동형 — 같은 children_update RLS가 자동 커버.
alter table public.children add column if not exists institution_id uuid references public.institutions(id);
create index if not exists children_institution on public.children (institution_id) where institution_id is not null;

comment on table  public.institutions is '기관 디렉터리(어린이집·유치원·학교) — 정확한 기관 기록의 단일 진실. 부모는 검색→선택만, 저장은 children.institution_id.';
comment on column public.children.institution_id is '자녀가 다니는 기관(institutions.id). 자유텍스트가 아니라 디렉터리 선택 결과(불변).';
