# Mealfred Next.js (deploy/web/)

밀프레드 웹사이트의 Next.js 15 부트스트랩. 점진 마이그레이션 — 기존 정적 HTML(`deploy/*.html`)과 공존.

## 🚀 시작 (M1 검증)

```bash
cd deploy/web
cp .env.local.example .env.local
# .env.local 열어서 실제 키 4개 입력 (Supabase URL·anon·service + Anthropic)
npm install
npm run dev
# 브라우저: http://localhost:3000/health
```

`/health` 페이지에서 ✅ 4개 환경변수 + ✅ Supabase 연결 확인되면 M1 부트스트랩 검증 완료.

## 📁 구조

```
web/
├── app/
│   ├── health/page.tsx     # M1 health check (env + Supabase ping)
│   ├── layout.tsx
│   ├── page.tsx            # / (기본 Next.js 홈, M2에서 /foods로 대체)
│   └── globals.css         # design-spec v3 토큰 + Hero 표준
├── lib/supabase/
│   ├── server.ts           # Server Components·Route Handlers
│   └── client.ts           # Client Components
├── .env.local.example
└── package.json
```

## 🎨 디자인 토큰

design-spec v3 정합 (`/design-spec.html`). Tailwind v4 CSS-based config — `app/globals.css` 안에 정의.

```tsx
<div className="bg-bg-warm-0 text-navy">...</div>
<h1 className="text-navy">제목</h1>
<p className="text-brown-mid">본문</p>
<button className="bg-orange-main text-white">CTA</button>
```

`.hero` 클래스로 표준 hero (모든 페이지 통일).

## 🔌 Supabase

```ts
// Server Component
import { createSupabaseServer } from '@/lib/supabase/server';
const supabase = await createSupabaseServer();  // service_role · RLS 우회
const { data } = await supabase.from('ingredients').select('*');

// Client Component
import { createSupabaseBrowser } from '@/lib/supabase/client';
const supabase = createSupabaseBrowser();  // anon · RLS 적용
```

## 🛣 라우팅 전략 (M1~M2)

- **M1**: `/health` 만 (검증용). 다른 모든 URL은 정적 HTML이 처리
- **M2**: `/foods`, `/foods/[slug]` 동적 라우트 + `deploy/vercel.json` rewrites
- **M5+**: 앱 화면들 (`/me`, `/log`, `/recipes`)

## 📐 다음 마일스톤

`/roadmap.html` M0-M13 참조.

## 🔒 보안

- `.env.local` git ignore (절대 commit X)
- `service_role` 키 server-only (브라우저 노출 X)
- 모든 입력 zod 검증 + Supabase RLS 정책 통과
- LLM 입력 sanitize + prompt injection 가드 (`/engines-deep.html` §0)
