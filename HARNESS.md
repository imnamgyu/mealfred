# 밀프레드 웹사이트 — 개발현황 하네스

> **밀프레드 웹사이트 (mealfred.com) 전용 트래커.** B2B 편식극복키트 HARNESS와 분리.
> 위치: `/Users/ing/Desktop/dev/web/landing_page/deploy/HARNESS.md`
> 메인 트래커 (편식극복키트): `/Users/ing/Desktop/편식극복키트/HARNESS.md`

---

## 🎯 다음 세션 시작점 (2026-05-26 09:30 갱신 — 세션 종료)

**오늘(2026-05-25~26) 종합 산출 — M0~M4 코드 100% 완료**:
- M0 ✅ 정적 사이트 라이브
- M1 ✅ Next.js 부트스트랩 (web/) + design v3 + Supabase 클라이언트 + /health
- M2 ✅ 도감 SSG (~176 SEO URL: /foods·/foods/[slug]·/foods/grade/·/category/·/season/)
- M3 ✅ enrich cron 골격 + seed 스크립트 (60+ 큐)
- M4 ✅ **카카오 OAuth MVP** (signup·callback·onboarding) + SENS 알림톡 (4 템플릿) + signals API
- ALG-EVAL-07 ✅ 식단표 → 도감 자동 enrich 백엔드

**다음 세션 시작 시 진입 가이드** (사용자가 먼저 할 것):
1. **`/Users/ing/Desktop/밀프레드_내가할일_2026-05-26.html` 열어서 A1 (schema.sql 적용)** ← 가장 먼저
2. A4: NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable) 받아서 RTF로 저장
3. 위 둘 완료 후 Claude에게 "schema 적용했어 + anon key 받았어" 한 마디 → 자동 진행:
   - A3 seed (147 + 660 recipes) 자동 실행
   - A4 enrich_queue seed (60+) 자동 실행
   - Vercel 배포 검증
4. 그 다음 카카오 Developers 등록 (A2) → /signup 작동 검증

**현재 막힌 곳**:
- A3 seed 시도 → ingredients 테이블 미존재 (schema 미적용)로 실패 (147/147)
- ANON_KEY 없어서 service_role로 임시 채워둠 (.env.local) — 클라이언트 작동 X

**환경변수 4개 상태**:
- ✅ NEXT_PUBLIC_SUPABASE_URL = https://spopsngwvpxvbokoefem.supabase.co
- ⏳ NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable) — Supabase API Keys에서 별도 받기 필요
- ✅ SUPABASE_SERVICE_ROLE_KEY (RTF + Vercel 등록 완료)
- ✅ ANTHROPIC_API_KEY (RTF + Vercel 등록 완료)

**로컬 .env.local 자동 생성됨**: `/Users/ing/Desktop/dev/web/landing_page/deploy/web/.env.local`
(RTF에서 자동 추출, .gitignore 적용됨)

---

## 🎯 이전 세션 시작점 (2026-05-25 22:00 갱신)

**이번 세션 (2026-05-25) 산출 — 8 주요 영역**:
1. design-spec v3 + 7개 페이지 hero 베이지 정합
2. 정성 시계열 LLM 체이닝 (engines-deep §4 ALG-COACH-00)
3. 룰 vs LLM 결정 매트릭스 (rule-vs-llm.html, 44 기능)
4. served vs consumed 분리 (engines-deep §1 ALG-EVAL-06)
5. URL /dex → /foods + 도감 페이지 baseline 정리
6. 농진청 v10.4 영양 매핑 (132/147 매칭) + 식재료 DB 정합
7. **v4 마스터 랭킹 채택** (필수 26 · 권장 50 · 향신료 6 · 해조류 라벨X)
8. **M1 부트스트랩 완료** + M2 SSG 라우트 + M3 enrich cron 골격

**환경변수 — Vercel 등록 완료 ✅**:
- ✅ `NEXT_PUBLIC_SUPABASE_URL` = `https://spopsngwvpxvbokoefem.supabase.co`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sb_publishable_...)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` (sb_secret_...)
- ✅ `ANTHROPIC_API_KEY` (sk-ant-api03-...)
- RTF 보관: `/Users/ing/Desktop/편식극복키트/10_개발관련/`

**다음 세션 시작 시 가장 먼저 할 일**:
1. Vercel 별도 프로젝트 등록 (`mealfred-app`, Root Directory: `deploy/web`) — 사용자 작업
2. Supabase SQL Editor → `deploy/supabase/schema.sql` 적용 (필수)
3. seed 실행: `cd deploy/web && node --env-file=.env.local ../supabase/seed-ingredients.mjs`
4. enrich_queue seed (농진청 미매칭 식재료): `node ../supabase/seed-enrich-queue.mjs`
5. `/foods` Next.js SSG 정상 동작 확인 → 본 mealfred.com에 통합 (vercel.json rewrites)

---

## 📋 할일 목록 (TODO)

### 🚀 진행 중 (현재 세션)
- [x] design-spec v3 갈아엎기 (메인 사이트 톤 정합)
- [x] 7개 페이지 hero 베이지 톤 일괄 변경
- [x] 정성 시계열 LLM 체이닝 설계 (engines-deep §4)
- [x] 룰 vs LLM 결정 매트릭스 (rule-vs-llm.html, 44 기능 3 카테고리)
- [x] served vs consumed 분리 카운팅 (engines-deep §1 ALG-EVAL-06)
- [x] /dex.html → /foods.html 네이밍 + 301 redirect + 모든 참조 갱신
- [x] daycare-eval 리드 폼 제거 → 도감 CTA 교체
- [x] dex-prd 42 URL 일괄 갱신
- [ ] 농진청 식품성분표 다운로드 + 147 풀 매핑 사전 작업 (이번 세션 진행)
- [ ] daycare-eval 라이브 수준 작업 (이번 세션 진행)

### ⏳ 다음 세션

#### M1 — Next.js + Supabase 부트스트랩 ✅ 완료 (2026-05-25)
- [x] `deploy/web/` Next.js 15 부트스트랩 (App Router · TS · Tailwind v4)
- [x] design-spec v3 컬러 토큰 → `globals.css` @theme inline
- [x] Supabase 클라이언트 (`lib/supabase/{server,client}.ts`)
- [x] `/health` 라우트 — Supabase ping + version
- [x] `web/vercel.json` (framework nextjs + 2 cron)
- [x] `.env.local.example` + README
- [ ] **Vercel 별도 프로젝트 등록** (사용자 작업, Root Directory: deploy/web)
- [ ] 본 mealfred.com과 통합 (vercel.json rewrites)

#### M2 — 도감 SEO 폭발 ✅ 코드 완료, DB 적용 대기
- [x] supabase/schema.sql (ingredients · recipes · comments · enrich_queue · cron_runs + RLS)
- [x] supabase/seed-ingredients.mjs (147 + 660 recipes 멱등 시드)
- [x] `/foods` 도감 메인 SSG (필수·권장·향신료·기타 그룹)
- [x] `/foods/[slug]` 147 동적 SSG (영양·SOS·레시피·CTA)
- [x] `app/sitemap.ts` (자동 sitemap.xml)
- [x] `lib/ingredients.ts` (loadPool·findIngredient·KDRI 유틸)
- [ ] **사용자 작업**: Supabase 대시보드 → SQL Editor → schema.sql 적용
- [ ] **사용자 작업**: `node --env-file=.env.local ../supabase/seed-ingredients.mjs`
- [ ] `/foods/grade/[g]` · `/foods/category/[c]` · `/foods/season/[m]` (다음 세션)
- [ ] Google·Naver Search Console 등록 (배포 후)

#### M3 — 매일 +50종 enrich ✅ 골격 완료
- [x] `web/app/api/cron/enrich/route.ts` (Vercel Cron + Haiku 분류 파이프라인)
- [x] CRON_SECRET 검증 + cron_runs 로그 + 비용 추적
- [x] 미매칭 식재료 alias·정확한 이모지 가드
- [ ] **enrich_queue seed** — 농진청 v10.4 3,200+ 미매칭 종을 큐에 push
- [ ] Vercel Cron 실제 작동 검증 (Supabase·키 적용 후)

#### M4 — 가입 + 카카오톡 알림톡 (1주)
- [ ] Supabase Auth 전화번호 + OTP
- [ ] 카카오 OAuth (소셜 로그인)
- [ ] 네이버 SENS 알림톡 템플릿 4종 신청 (심사 4-7일)
- [ ] 온보딩 (자녀 정보·BMI·연령)

#### M4 — 가입 + 카카오톡 알림톡 (1주)
- [ ] Supabase Auth 전화번호 + OTP
- [ ] 카카오 OAuth (소셜 로그인)
- [ ] 네이버 SENS 알림톡 템플릿 4종 신청 (심사 4-7일)
- [ ] 온보딩 (자녀 정보·BMI·연령)

### 🌿 사이드 작업 (언제든)
- [ ] foods.html 다른 페이지들과 디자인 미세 정합 (예: 도감 카드 hover, 모달 등)
- [ ] 357편 블로그 가속화 (주 3편 페이스)
- [ ] dogam.html PWA 데모를 v3 톤으로 점진 마이그레이션
- [ ] 운영 대시보드 (Metabase 임베드)
- [ ] PostHog 이벤트 트래킹 설치

---

## 📜 작업 일지 (역순)

### 2026-05-25 (오늘) — design v3 + 정성 체이닝 + 룰vsLLM + served vs consumed + URL 정리

#### Phase 1 — 디자인 + 아키텍처 (오전·오후)
- **design-spec.html v3 완전 재작성**: 메인 사이트(mealfred.com) 톤 정합. 베이지·피치 그라데이션 표준화. "다크 hero 전면 금지" 명시. 컬러 토큰 17개(베이지 4 + 오렌지 4 + 네이비 2 + 브라운 3 + Status 4)
- **7개 페이지 hero 일괄 베이지로**: proposal · docs · dex-prd · viral-engine-prd · roadmap · growth-strategy · daycare-eval — 다크 navy/purple 배경 폐기, 흰 텍스트 → 네이비/브라운
- **engines-deep §4 정성 시계열 LLM 체이닝** (ALG-COACH-00 ★): raw_note 절대 가공 X, 시계열 보존, Sonnet 주간 분석 + Haiku 매 입력 시 역질문, qualitative_notes·qualitative_threads DB 분리
- **rule-vs-llm.html 신규** (44 기능 매트릭스): "점수는 룰, 멘트는 LLM" 원칙. 결정 트리·DO/DON'T·가드레일 5종·fallback 정책
- **engines-deep §0 전처리 엔진 v3**: 자유 텍스트 → MealLog 정규화 시 served vs consumed 분리 명시
- **engines-deep §1 ALG-EVAL-06 ★ served vs consumed 분리 카운팅**:
  - 다양성·KDRI·신호등 = consumed/partial만 (partial=50% 가중)
  - Toomey SOS 노출 = served 전체 (Cooke 반복 노출 학술 정합)
  - 친해지기 진전도 = successCount / attemptCount → SOS 0-5 자동
  - ingredient_attempts 테이블 + 트리거 자동 누적
- **proposal.html 학술 기준 정확화**: 5개 → 11 학술 이론 + 5 편식 개선 방법론 + 4 행동 변화 이론 = 20개

#### Phase 2 — URL 네이밍 + 페이지 정리 (오후)
- **사용자 결정**: M1 시 기존 deploy/ 안에서 점진 마이그레이션 · 기존 Supabase 프로젝트 재사용
- **/dex.html → /foods.html 네이밍 변경** (사용자 결정: /foods 채택)
- foods.html 신규 (dex.html 복사 + design-spec v3 베이지 hero)
- dex.html → /foods.html 301 redirect (meta refresh + JS location.replace + canonical + 안내 카드)
- 모든 내부 참조 일괄 변경: personal-coming · docs · dex-prd · roadmap
- dex-prd 42개 /dex/* URL → /foods/* 일괄 갱신
- **daycare-eval 리드 폼 제거** (line 489-499) → 도감 CTA 카드로 교체 (오렌지 그라데이션 버튼)
- formatPhone·submitLead 함수 정리

#### Phase 3 — 가짜 비용 추정 정정
- 사용자 지적: rule-vs-llm.html의 "₩12M / 6.5배" 추정이 근거 없음
- 인정 + 가짜 비교 섹션 삭제 → 진짜 이유(재현성·속도·오프라인·장애 내성·감사·디버그) 표로 교체
- 비용은 캐시 가능 시 ≈ ₩0이므로 부수적 효과로 명시

#### 농진청 데이터 출처 답변 + 매핑 일정 정리 (이번 세션 후반)
**출처 3개**:
1. **농촌진흥청 국립농업과학원 (RDA·NIAS)** — 국가표준식품성분표 v10.0 (2024)
   - URL: <https://koreanfood.rda.go.kr/>
   - 약 3,300+ 식품 · 145개 영양 성분
   - Excel/CSV 무료 다운로드 (로그인 X, 공공데이터)
   - **메인 데이터 소스 — 매일 +50종 enrich의 원천**
2. **식품안전나라 식품영양성분 DB (식약처)** — 보조
   - URL: <https://various.foodsafetykorea.go.kr/nutrient/>
   - 가공식품 영양 (NOVA 가공도 분류 시 활용)
3. **KDRI 2025 (보건복지부)** — 권장 섭취량
   - 이미 PDF 6권 정합화 완료 (메인 트래커 참조)

**enrich 진행 일정**:
- **사전 작업 (이번 세션 ~ 다음 세션)**: 농진청 Excel 다운로드 + 147 풀 매핑 스크립트 작성
- **M2 (다음 세션 + 1주)**: 147종 ingredients 테이블 seed 데이터 풀 매핑 완료
- **M3 (다음 세션 + 2주)**: 매일 +50종 cron 자동 enrich 시작

**foods.html의 "enrich 대기 — 농진청 매핑 진행 중" 처리**:
- 현재: 모든 식재료 mock 영양 데이터 사용
- M2에서 147종 실데이터로 일괄 교체
- M3부터 매일 +50종 자동 enrich → 1년 후 ~18,000종

#### Phase 4 — 정합·정직 (저녁)
- **농진청 v10.4 영양 매핑** (132/147 = 89.8% 성공): `data_ingredient_pool_enriched.json` 75KB · 19 영양 컬럼
- **2,041 레시피 inverted index**: `data_recipes_by_ingredient.json` · 132/147 매칭 · 조리법 다양성 Top 5
- **이모지 화이트리스트 일괄 보정**: 70/147 변경 · 46종 빈 문자열 (정확한 매핑 없으면 달지말기)
- **카테고리 보정**: 다시마/미역=해조류 · 파/대파=기타채소 · 김치=발효식품 등 16종
- **김치 이모지 🍙(주먹밥) → 빈 문자열**: 한국 김치 정확한 이모지 없음
- **메인 index에 /foods·/daycare-eval 카드 추가**: 4 제품 카드로 확장
- **NEXT_PUBLIC_SUPABASE_URL vs SUPABASE_URL 같은 값 OK 답변**: 둘 다 등록 정상
- **인플레 한도 가짜 추정 정정**: rule-vs-llm '월 ₩12M / 6.5배' → 진짜 이유 (재현성·속도·오프라인)

#### Phase 5 — v4 마스터 랭킹 채택 (식재료_랭킹_마스터_v4.xlsx)
- 9 시트 정본 데이터: S~D 등급 + Must-Eat v4 통합 점수 + 안전 경고
- 사용자 결정: **S+A → 필수 · B+C → 권장 · 해조류 라벨X** (요오드 위험)
- 최종 분포: 필수 26 · 권장 50 · 향신료 6 · 라벨X 65 (해조류 5 포함)

#### Phase 6 — M1 후속 (Next.js 부트스트랩 완료)
- `deploy/web/` Next.js 15 + Tailwind v4 + @supabase/ssr
- `app/health/page.tsx` · `lib/supabase/{server,client}.ts` · `globals.css` design v3
- `.env.local.example` 템플릿 (RTF 키 위치 안내)
- README.md M1 가이드

#### Phase 7 — M2+M3 코드 일괄
- `supabase/schema.sql`: ingredients·recipes·comments·enrich_queue·cron_runs + RLS
- `supabase/seed-ingredients.mjs`: 147 + 660 recipes 멱등 시드
- `web/app/foods/page.tsx`: 도감 메인 SSG (4 그룹)
- `web/app/foods/[slug]/page.tsx`: 147 동적 SSG + 자동 SEO meta
- `web/app/sitemap.ts`: Next.js 15 표준 sitemap.xml
- `web/app/api/cron/enrich/route.ts`: M3 매일 +50종 Haiku enrich

#### Phase 8 — 정직성 + 카피 정합
- **'영유아 레시피' → '식약처 급식관리지원센터 레시피'**: 출처 권위 명확화
- **'한국 평균 72점' 정직 제거**: 근거 없는 임의 수치 → 단순 점수만 표시
- **'36 영양 신호등' → '필수 36가지 영양소 자동 점검'**: 사용자 가치 중심
- **'필수·권장 기준이 뭐야?' → '우리 아이한테 꼭 필요한 식재료, 어떻게 골랐을까요?'**: 부드러운 권유 톤
- **타겟 연령 재정의**: 만 3-7세 (유치원·초1·초2) · 앱 사용자 자녀 목표 = 초등 2학년까지
- **키트 CTA → 개인화 통합**: 식재료 상세에서 집중·골고루 키트 제거 → /personal-coming 단일 CTA
- **'+50/일 매일 enrich' 통계 제거**: 아직 안 작동하는 기능 거짓 약속 X

#### 신규 설계 ALG-EVAL-07 (engines-deep §1)
- 식단표 역분석 → 도감 자동 enrich 파이프라인
- daycare-eval에서 미매칭 식재료 → `unmatched_ingredient_signals` 누적
- 5회 도달 시 enrich_queue 자동 push (M3 cron 처리)
- '한국 어머니가 실제 먹이는 식재료 도감' 생성 기반

---

### 이전 일지
이번 세션이 mealfred 웹사이트 전용 HARNESS의 첫 시작. 이전 작업은 통합 트래커 `/Users/ing/Desktop/편식극복키트/HARNESS.md`에 기록됨.

---

## 🔗 참고 링크

- 라이브: <https://www.mealfred.com>
- GitHub: <https://github.com/imnamgyu/mealfred>
- 호스팅: Vercel (Hobby)
- DB: Supabase
- 알림톡: 네이버 SENS (템플릿 심사 대기)
- 메인 트래커: `/Users/ing/Desktop/편식극복키트/HARNESS.md`
- 디자인 v3: `/design-spec.html`
- 룰 vs LLM 매트릭스: `/rule-vs-llm.html`
- 로드맵 M0-M13: `/roadmap.html`
- 도감 PRD: `/dex-prd.html`
- 바이럴 엔진 PRD: `/viral-engine-prd.html`
