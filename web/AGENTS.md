<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 테스트는 코드와 함께 — 모든 개발에 필수 (2026-06-29 추가)

- `web/`의 `lib`·`app`·`components` **로직을 추가/수정하면 vitest 테스트도 같이 작성·갱신**한다(콜로케이트 `*.test.ts`). 데이터 사전(`lib/menuMapCore.ts` 등) 편집 시 **중복 키 금지**.
- 커밋·푸시 **전 반드시 통과 확인**: `npm test` + `npx tsc --noEmit`  (또는 `npm run build` = prebuild 테스트 + 타입체크를 한 번에).
- 자동 게이트 3겹 — 셋 중 어디서든 실패하면 배포 안 됨:
  1. **pre-push 훅** (`.git/hooks/pre-push`): web/ 변경 시 test+tsc. (로컬·이 PC 전용)
  2. **GitHub Actions CI** (`.github/workflows/ci.yml`): push마다 test+tsc.
  3. **Vercel 배포**: `buildCommand: npm run build` → prebuild 테스트 + next build(tsc).
- 이유: 런타임 테스트로 **못 잡는** 정적 오류(예: 2026-06-29 `menuMapCore` 중복 키 → `next build` TS1117 → app 배포 차단)는 **tsc**가, 로직 회귀는 **vitest**가 잡는다 — 둘 다 게이트에 둔다.
