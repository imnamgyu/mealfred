# 밀프레드 웹사이트 — 개발현황 하네스

> **밀프레드 웹사이트 (mealfred.com) 전용 트래커.** B2B 편식극복키트 HARNESS와 분리.
> 위치: `/Users/ing/Desktop/dev/web/landing_page/deploy/HARNESS.md`
> 메인 트래커 (편식극복키트): `/Users/ing/Desktop/편식극복키트/HARNESS.md`

---

## 🎯 다음 세션 시작점 (2026-05-25 갱신)

**이번 세션 산출**: design-spec v3 + 정성 시계열 LLM 체이닝 + 룰 vs LLM 매트릭스 + served vs consumed 분리 + URL /dex → /foods 일괄 변경 + 두 페이지 디자인 정합.

**다음 세션 시작 시 가장 먼저 할 일**:
1. `사용자에게 Supabase 키 요청` (다음 항목 ❶ 참조) — 받는 즉시 M1 부트스트랩 진입
2. 키 받기 전까지 가능한 작업 진행 중 (이번 세션 후반 작업 = daycare-eval 라이브 수준 + 농진청 식품성분표 다운로드·매핑 사전 작업)

**M1 (Next.js + Supabase) 진입 전 사용자에게 받아야 할 토큰** ❶:
- `NEXT_PUBLIC_SUPABASE_URL` (예: https://xxx.supabase.co)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (jwt)
- `SUPABASE_SERVICE_ROLE_KEY` (서버용, .env.local만)
- `ANTHROPIC_API_KEY` (M3 enrich 시작 시 필요, M1·M2엔 X)
- 기존 mealfred Supabase 프로젝트의 기존 테이블 스키마 (있다면)
- 카카오 OAuth Redirect URL 등록 (M4 가입 시)

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

### ⏳ 다음 세션 (사용자 토큰 받은 후)

#### M1 — Next.js + Supabase 부트스트랩 (1주)
- [ ] `deploy/web/` 폴더에 Next.js 15 부트스트랩 (App Router · TS · Tailwind)
- [ ] design-spec v3 컬러 토큰 → tailwind.config.ts 매핑
- [ ] Supabase 클라이언트 (`lib/supabase/{server,client}.ts`)
- [ ] `/web/health` 라우트 — Supabase ping + version
- [ ] `vercel.json` rewrites — `/web/*`만 Next.js, 나머지 정적 보존
- [ ] 로컬 npm run dev 검증 + Vercel preview

#### M2 — 도감 SEO 폭발 (1주)
- [ ] ingredients 테이블 스키마 (slug, name, category, grade, nutri_per_100g jsonb, ...)
- [ ] 147종 JSON + 농진청 매핑 → Supabase seed
- [ ] `/foods` 동적 라우트 (SSG, 검색·필터)
- [ ] `/foods/:slug` 동적 라우트 (147 페이지 정적 생성)
- [ ] `/foods/grade/:g`, `/foods/category/:c`, `/foods/season/:m`
- [ ] 자동 meta·OG·sitemap.xml
- [ ] Google·Naver Search Console 등록

#### M3 — 매일 +50종 enrich 자동화 (1주)
- [ ] 농진청 식품성분표 v10.0 전체 import (~3,300종)
- [ ] enrich_queue 테이블 + cron 04:00
- [ ] Claude Haiku 분류·메타 생성 파이프라인
- [ ] Vercel ISR 자동 빌드 + sitemap·indexing API push

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
