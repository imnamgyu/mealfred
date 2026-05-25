# 밀프레드 Food Bridge MVP

> **🔗 통합 완료 (2026-05-14, 옵션 B)** — 본 MVP는 `/Users/ing/Desktop/dev/web/landing_page/deploy/app-demo.html` (Sprint 9-C 자리)에 **흡수 통합**되었습니다.
> - **라이브 진입점**: `https://www.mealfred.com/app-demo.html` (홈 → 9-C `Food Bridge 4축 생성기` 카드 또는 ICFQ 결과 → `s-foodbridge`)
> - **본 폴더 (`/foodbridge/mvp/`) 역할**: raw 자산 (data·prompts·supabase·sw·manifest) 보관 — app-demo.html이 `data/*.json`을 fetch
> - **별도 PWA 라이브 (`/foodbridge/mvp/index.html`)**: 개발 보조용으로 유지 — 단독 모바일 검증·alpha 5명 테스트 시 사용
> - 자세한 통합 내역: `_MVP_데모통합_보고서_2026-05-14.md` 참조

---

> **버전**: v1-mvp (2026-05-14)
> **URL (라이브 예정)**: https://www.mealfred.com/foodbridge/mvp/
> **Phase**: Phase 9-MVP · Sprint M-A · T700~T717

## 한 줄 정의

부모가 좋아하는 음식 3개 + 거부 음식 1개 + 자녀 연령 입력 → 30초 안에 4축(색·온도·질감·맛) 기반 다리 시퀀스 3~5단계를 LLM이 생성하는 **PWA**.

---

## 스택

| 레이어 | 기술 |
|---|---|
| 프론트엔드 | **PWA (Vanilla JS + HTML5 + CSS3)** — 무빌드 |
| 백엔드 API | **Supabase Edge Function** (Deno + TypeScript) |
| DB | **Supabase Postgres** (`foods` / `chains` / `mvp_logs` 3 테이블) |
| LLM | **Anthropic Claude Sonnet 4.7** (`claude-sonnet-4-6`) |
| 호스팅 | **Vercel** (mealfred.com 동일 프로젝트, `/foodbridge/mvp/` 서브경로) |

---

## 폴더 구조

```
foodbridge/mvp/
├── index.html              # PWA 진입점 (4 screen 단일 파일)
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (cache-first shell, network-only API)
├── css/style.css           # Pretendard + 인디고 #283593 톤
├── js/
│   ├── app.js              # UI 컨트롤러 (화면 전환·입력·로딩·결과·에러)
│   ├── chain.js            # 4축 헬퍼 (라벨 변환·검증·시드 로드)
│   └── api.js              # Supabase Edge Function 호출
├── data/
│   ├── food_seed.json      # 시드 30개 + 4축 라벨링 (T700~T702)
│   └── mock_responses.json # 8 시나리오 정적 답변 (API key 발급 전 UX 검증)
├── prompts/
│   ├── system_v1.md        # T703 — LLM 시스템 프롬프트 v1
│   └── (system_v2.md)      # T705 — 튜닝 후 (대기)
├── supabase/
│   ├── schema.sql          # T706 — 테이블·RLS 정의
│   ├── (seed.sql)          # T707 — 30개 import (food_seed.json → SQL, 대기)
│   └── functions/
│       └── food-chain/
│           └── index.ts    # T708 — Deno Edge Function
└── README.md               # 이 파일
```

---

## 로컬 개발 (무빌드)

### 🎭 Mock 모드 (기본 — API key 발급 전 UX/디자인/플로우 검증)

```bash
# 1) deploy 폴더에서 정적 서버 띄우기
cd /Users/ing/Desktop/dev/web/landing_page/deploy
python3 -m http.server 8080
# 또는 npx serve

# 2) 브라우저 열기
open http://localhost:8080/foodbridge/mvp/
#   → 자동으로 Mock 모드 진입 (api.js CONFIG placeholder 감지)
#   → 상단에 "🎭 Mock 모드 (LLM 미연결) — UX·디자인 검증용" 배지 표시
#   → footer에 "🎭 mock" 태그

# 3) 강제 Mock (CONFIG 채워진 후에도 mock 보고 싶을 때)
open "http://localhost:8080/foodbridge/mvp/?mock=1"
```

**Mock 동작 방식**:
- `data/mock_responses.json`의 8 시나리오 중 입력 유사도 매칭 (refused_food 정확 일치 +3, liked_foods 교집합 +1)
- 매칭 0건이면 가장 흔한 입력 시나리오(S2: 흰밥·계란·치즈 → 시금치)로 fallback
- `age_months < 12` 입력 시 자동 fallback 시나리오(보완식 가이드 redirect) 반환
- 로딩 화면 검증을 위해 1.8s 지연 시뮬레이션
- 4축 라벨·자료 발화 4룰·Fraker·Satter DOR 학술 정합 유지

**8 시나리오**:
| ID | 입력 | 목적 |
|---|---|---|
| S1 | 사과·바나나·감자 → 시금치 | 흔한 입력 (채소 거부) |
| S2 | 흰밥·계란·치즈 → 시금치 | 탄수화물 편향 (기본 fallback) |
| S3 | 사과·바나나·딸기 → 브로콜리 | 단맛 편향 (과일만) |
| S4 | 너겟·과자·시리얼 → 두부 | 식감 편향 (바삭만) |
| S5 | (12개월 미만) | fallback redirect 검증 |
| S6 | 두부·계란·닭고기 → 소고기 | 단백질 다리 |
| S7 | 흰밥·계란·치즈 → 김치 | 한식·매운맛 적응 |
| S8 | 우유·요거트·치즈 → 양파 (milk 알러지) | 알러지 회피 + 큰 거리 |

### 🟢 Real 모드 (Anthropic API key + Supabase 배포 완료 후)

```javascript
// 브라우저 콘솔에서:
foodbridge.enableLive();   // localStorage 토글
// → 새로고침 후 실 LLM 호출

foodbridge.disableLive();  // Mock 복귀
foodbridge.mode();         // 현재 모드 확인 ("mock" | "real")
```

또는 URL 파라미터: `?live=1` (mock 강제는 `?mock=1`)

**전제 조건** (아래 §배포 단계 §3 완료):
- Supabase Edge Function `food-chain` 배포
- `index.html`에 `window.__FOODBRIDGE_CONFIG__` 주입 (SUPABASE_URL + SUPABASE_ANON_KEY)
- Anthropic `sk-ant-...` key 가 Supabase secrets에 설정

→ Real 모드인데 CONFIG placeholder가 그대로면 api.js가 보수적으로 mock으로 fallback (502 spam 방지).

---

## 배포 단계 (임남규 대표 실행)

### 1. Supabase 설정

```bash
# Supabase CLI 설치 (없으면)
brew install supabase/tap/supabase

# 로그인
supabase login

# mealfred 프로젝트로 link (또는 신규 프로젝트)
cd /Users/ing/Desktop/dev/web/landing_page/deploy/foodbridge/mvp
supabase link --project-ref <your-mealfred-project-ref>
```

### 2. DB 스키마 + 시드 import

```bash
# Supabase Studio → SQL editor에 schema.sql 붙여넣기 실행
# (또는) supabase db push  ← 마이그레이션 디렉터리 정합 후 가능

# 시드 30개 import
# food_seed.json → seed.sql 변환 (Python or 수동, T707)
# 예: psql 또는 Supabase Studio SQL editor에서 INSERT 30건 실행
```

### 3. Edge Function 배포

```bash
# secrets 설정
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx

# 배포
supabase functions deploy food-chain --project-ref <your-mealfred-project-ref>

# 검증 (curl)
curl -X POST https://<your>.supabase.co/functions/v1/food-chain \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"liked_foods":["흰밥","계란후라이","치즈"],"refused_food":"시금치","age_months":36}'
```

### 4. 프론트엔드 환경변수 주입

`index.html` `<head>`에 다음 스니펫 추가 (Vercel build-time 또는 수동):

```html
<script>
  window.__FOODBRIDGE_CONFIG__ = {
    SUPABASE_URL: "https://<your>.supabase.co",
    SUPABASE_ANON_KEY: "eyJ..."
  };
</script>
```

또는 `js/api.js`의 CONFIG를 직접 수정.

### 5. Vercel 배포

기존 mealfred Vercel 프로젝트는 `deploy/` 폴더를 루트로 사용 중.
`foodbridge/mvp/`는 자동으로 `mealfred.com/foodbridge/mvp/`로 서빙됨 (별도 라우팅 불필요).

```bash
cd /Users/ing/Desktop/dev/web/landing_page/deploy
git add foodbridge/
git commit -m "feat: Food Bridge MVP PWA shell (Sprint M-A)"
git push origin main
# → Vercel auto deploy
```

---

## API 스펙

### `POST /functions/v1/food-chain`

**Request**:
```json
{
  "liked_foods": ["흰밥", "계란후라이", "치즈"],
  "refused_food": "시금치",
  "age_months": 36,
  "allergens": ["milk"]
}
```

**Response (200)**:
```json
{
  "bridge_sequence": [
    {"step": 1, "food": "흰밥", "week_label": "지금", "axis_changed": null, "tone_copy": "지금 자녀가 잘 먹는 음식이야."},
    {"step": 2, "food": "시금치즙 1방울 섞은 흰밥", "week_label": "1주차", "axis_changed": "color", "tone_copy": "색이 살짝 달라졌네."},
    ...
  ],
  "confidence": 0.85,
  "fallback_message": null,
  "starting_point_reason": "흰밥의 4축 벡터(0,2,2,0)가 시금치와 거리 7.07로 가장 가까움."
}
```

**Response (400/502)**:
```json
{ "error": "사유" }
```

---

## 진행 상태 (2026-05-14)

| Task | 상태 |
|---|:---:|
| T700~T702 시드 30개 + 4축 라벨링 | ✅ |
| T703 LLM 시스템 프롬프트 v1 | ✅ |
| T704 5케이스 LLM 검증 | ⏸️ |
| T705 프롬프트 v2 튜닝 | ⏸️ |
| T706 Supabase schema | ✅ (골격) |
| T707 시드 import SQL | ⏸️ |
| T708 Edge Function 골격 | ✅ |
| T709-mock 정적 답변 시나리오 8개 + Mock 토글 | ✅ |
| T709 API curl 검증 | ⏸️ |
| T710 화면 1 입력 | ✅ (골격) |
| T711 화면 2 결과 | ✅ (골격) |
| T712 로딩 화면 | ✅ (골격) |
| T713 에러 핸들러 | ✅ (골격) |
| T714 모바일 검증 | ⏸️ |
| T715 Vercel 배포 | ⏸️ |
| T716 alpha 5명 | ⏸️ |
| T717 v1.5 결정 | ⏸️ |

→ **다음 트리거**: T707 (시드 SQL 생성) + T708 Anthropic API key 발급 + Supabase 배포 → T709 curl 검증 → 라이브.

---

## 라이선스

mealfred 내부 자산. 외부 배포 금지.
