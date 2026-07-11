# 밀프레드 — 저장소 지도 & 작업 규칙

이 폴더(`deploy/`)가 git repo **`imnamgyu/mealfred`**의 루트다. **코드가 여기 있다.** (지식·문서 보관소는 별도 — 아래.)

## 새 작업 시작 시 — ⓪ 위키 → ① 최근 일지 순서 (필수)

**⓪ 위키 먼저 (2026-07-11 이사님 지시).** 위키(구 '문서 허브') = `mealfred.com/docs.html`, 소스 = `deploy/docs.html`. SessionStart 훅이 위키 문서 인덱스를 자동 주입한다 — 새 작업 전 **관련 정본이 이미 있는지 인덱스에서 먼저 확인**하고, 세션 산출물(보고서·계획·명세)이 생기면 **위키에 페이지 게시 + docs.html 카드 등록까지가 기본 마감**이다.

**① 최근 작업 일지** — 맥락 잡기(중복 작업·역행·이미 내린 결정 뒤집기 방지):

1. `~/Desktop/편식극복키트/09_업무일지/README.md` (인덱스) → 최신 월 `_month.md` → 해당 주 `_week-WXX.md` 순으로 **드릴다운**. 필요할 때만 그 날 일 파일.
2. ⚠️ 월/주 전체를 통째로 읽지 말 것 — 롤업이 요약본이다. 보통 **최근 1~2주 롤업이면 충분**.
3. 같은 날 **병행 세션이 흔하다** — 오늘 일 파일의 다른 세션 섹션도 확인(작업 충돌·중복 방지).
4. 빠른 공개 뷰는 위키의 '📓 작업 일지' 카드.

## 무엇이 어디에 있나

| 구분 | 위치 | 내용 | 배포 |
|---|---|---|---|
| **정적 사이트** (mealfred.com) | `deploy/` 루트 | `*.html`(pitch·docs·investor-objections·worklog·blog 등), `blog/`, 정적 자산 | Vercel 정적 프로젝트(빌드 없음) |
| **Next.js 앱** (app.mealfred.com) | `deploy/web/` | `app/`·`lib/`·`components/`·`scripts/` + vitest 테스트. 코칭 엔진·매핑·API·크론 | Vercel 앱 프로젝트(`web/vercel.json`, `npm run build`) |
| **지식·문서 보관소** | `~/Desktop/편식극복키트/` | `09_업무일지`(worklog 일·주·월), `00_설계원칙`(편식 이론·백과사전) 등. **git 미추적**(로컬 단일 진실) | — |
| **위키 (구 문서 허브)** | `mealfred.com/docs.html` | 위 지식의 큐레이션 공개본(docs-gate @mealfred.com 인증). **단일 지식 허브 — 새 작업 전 최우선 확인** | 정적 사이트의 일부 |

→ **repo 1개 = Vercel 프로젝트 2개.** main에 push하면 정적+앱 **둘 다** 재배포(푸시 1번=2배포).

## 코드 변경 = 테스트 동반 (필수)

`web/` 로직을 **추가/수정하면 vitest 테스트도 같이 작성·갱신**하고, **커밋·푸시 전** `cd web && npm test && npx tsc --noEmit`(또는 `npm run build`)을 통과시킨다. 데이터 사전(`web/lib/menuMapCore.ts` 등)은 **중복 키 금지**. 상세 규칙·이유 → `web/AGENTS.md`.

**자동 게이트 3겹**(어디서든 실패 시 배포 차단): ① pre-push 훅(`.git/hooks/pre-push`, 로컬) ② GitHub Actions(`.github/workflows/ci.yml`) ③ Vercel `npm run build`(prebuild 테스트+타입체크). 2026-06-29 `menuMapCore` 중복 키가 `next build`(TS1117)를 깨 app 배포가 막힌 사고 이후 도입 — 런타임 테스트로 못 잡는 정적 오류는 tsc가, 로직 회귀는 vitest가 잡는다.

## 세션 종료
`/mealfred-worklog` 로 일지 기록(`09_업무일지` 일 파일 + `worklog-YYYY-MM-DD.html` 허브 + push).
