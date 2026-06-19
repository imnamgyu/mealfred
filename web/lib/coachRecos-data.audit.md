# coachRecos 데이터 정합성 점검표 (WBS EPIC I)

EPIC I = "데이터 정합성·근거 보강". Letter B의 '재료 결정론'이 실측 근거 위에 서도록 데이터층을 점검·고정한다.
모든 수치는 회귀 테스트(`tests/coach-data.test.ts`)로 못 박았다(데이터 드리프트 감지).

산출일: 2026-06-13 · 소스: scripts/build-ingredient-freq.py(권위표=인계서 실측 learned_menus 1000개).

---

## I-01/I-02 — 식재료 급식빈도·상위% (public/ingredient-freq.json · lib/ingredient-freq.json)

| 식재료 | freq | rank | topPct | 비고 |
|--------|------|------|--------|------|
| 당근   | 184  | 1    | 2%     | 최다·상위 2%(eat-common) |
| 토마토 | 42   | 2    | 12%    | |
| 브로콜리| 25  | 3    | 18%    | |
| 양배추 | 20   | 4    | 24%    | |
| 치즈   | 18   | 5    | 27%    | |
| 시금치 | 13   | 6    | 33%    | |
| 근대   | 11   | 7    | 39%    | 비타민A채소 중 최하위 |
| 단호박 | 0    | —    | —      | **미수록**(0회 → null, '상위 100%'로 위장 금지) |
| 요거트 | 0    | —    | —      | **미수록**(0회 → null) |

- 산출 키 전부 도감 표준명(ingredients-light.json 교집합) — SEASONING 잔류·오타 0건.
- 값은 coachMaterials.ts `GIO_FREQ`와 동일(단일 진실원). `freqOf`/`topPctOf`/`isCommon`이 동일 API로 조회.
- **TBD(데이터 의존):** 전체 코퍼스(learned_menus DB ~9,988행) 재산출은 DB 접속이 필요.
  레시피 DB가 있으면 `python3 scripts/build-ingredient-freq.py --src recipedb`,
  ingredient-recipes 합산은 `--src recipes`. 현재 커밋 산출물 = 권위표(`measured`·결정론).

## I-03 — GROUP_INGREDIENTS 정비 (단호박 강등·계란 중복)

**결정: 원본 `GROUP_INGREDIENTS`(coachRecos.ts)는 무변경. 빈도 정비는 EPIC A의 `GROUP_INGREDIENTS_RANKED`(coachMaterials.ts)가 이미 수행.**

근거:
- Letter A의 `pickFoodReco`(seed%length 회전)·`weeklyExposureTarget`이 원본 순서에 의존하는 **v2 대조군**이다.
  기존 회귀 `A-01-7`이 `GROUP_INGREDIENTS['비타민A채소'][0] === '단호박'`을 못 박고 있어, 원본을 재정렬하면 대조군이 깨진다.
- EPIC A는 이를 예견해 **빈도 내림차순 사본** `GROUP_INGREDIENTS_RANKED`를 별도로 두었다(안정 정렬·빈도 미상=0=끝).
  → 비타민A채소 RANKED = `['당근','시금치','근대','단호박']`. **단호박(0회)이 이미 맨 뒤로 강등**되어 빈도 가중 랭킹(`rankIngredients`)에서 가라앉는다(I-03 의도 충족).
- Letter B(`selectDailyMaterials`→`rankIngredients`)는 RANKED를 쓰므로, 단호박 선두 문제·0근거 추천이 발생하지 않는다.

| 그룹 | 원본(Letter A 대조군·무변경) | RANKED(Letter B·빈도순) |
|------|------------------------------|--------------------------|
| 비타민A채소 | 단호박·당근·시금치·근대 | 당근·시금치·근대·**단호박(끝)** |
| 유제품 | 치즈·요거트·우유 | 치즈·요거트·우유 |
| 기타채소 | 브로콜리·양배추·애호박·버섯·토마토 | 토마토·브로콜리·양배추·애호박·버섯 |

**관찰된 데이터 이슈(미수정·문서화):**
- `'고기·계란'`에 `'달걀'`·`'계란'`이 **둘 다** 존재(동일 식품·둘 다 freq 0). 원본 제거 시 Letter A 회전(seed%length)이 바뀌어 대조군 위반 → 원본 유지. NUTRI_ROLE은 둘 다 동일 라벨로 커버되어 추천 품질엔 영향 없음.
- 도감 미수록 대표: `잡곡`·`콩`·`요거트`·`버섯`(ingredients-light.json nm에 없음).
  영양상 유지(STAPLE/콩류/유제품/기타채소 커버리지)하되, **freq가 있는 대표가 각 그룹에 1개 이상** 존재(전부 0회 그룹 0) — `I-03-6`로 고정.

## I-04 — 괴식 조합 차단 (lib/comboGuard.ts · kit-dish-matrix)

미역국 행 · 당근 열 점수 스냅샷(kit-dish-matrix scores):

| dish | 당근 score | ok(>=2) |
|------|-----------|---------|
| 볶음밥·비빔밥·덮밥·카레·잡채·계란찜·무침·나물·볶음·전·부침·찜·샐러드·만두·그라탕·수프 | 3 | ✅ |
| 국·된장국·찌개·찌개·전골·탕·순두부·조림·구이·국수·면·떡·음료·스무디 | 2 | ✅ |
| **미역국** · 김치찌개 · 빵·토스트 · 요거트·간식 · 쌈 | **1** | ❌ 차단 |

- 임계 = **2**. score<2(미역국=1)·미수록(undefined)은 **금지**(보수적 기본값).
- LLM 후보는 `validCombos` 화이트리스트만(괴식 미역국+당근 제외).

## I-05 — food-graph 경계 (식재료 그래프)

- food-graph는 **ingredient×ingredient(pair/bridge)만** 표현. dish+ingredient 정합은 kit-dish-matrix 소관.
- **결정: dish를 food-graph에 삽입하지 않는다**(노드 단위가 식재료라 오염). '볶음밥/카레/짜파게티'는 graph 노드가 아님 → `ingredientPairFit`가 거부(경계 강제). 이들의 당근 조합은 kit-dish-matrix(볶음밥3·카레3)로 처리.
- 당근 핵심 pair 존재 확인: 두부·달걀·감자·고구마·시금치·브로콜리·치즈… (`neighborsOf('당근')`).
- 당근 bridge(사촌): 비트·파스닙.
- **미역 pair에 당근 없음** — 미역국×당근 괴식과 정합(pair로 곁들임 추천 안 됨).
- 메타: nodes 198 · edges 549(pair 362 · bridge 187). 드리프트 시 의도 확인(`I-05-4·5`).
- **보강 필요 셀:** 없음(당근 pair 충분·kit-matrix dish 커버 충분).

## I-06 — 근거 문구 (lib/recoEvidence.ts)

- `evidenceFor(ing)` = { freqPct(I-02 단일 진실원·0회는 null), nutrients(NUTRIENT_FOODS 역인덱스), text }.
- 당근 → '급식 상위 2%·비타민A(눈·면역)'. 단호박 → freqPct null·'상위' 절 없음(위장 금지).
- 영양·빈도 둘 다 없으면 빈 text(허위 근거 0). text에 재료 밖 음식명 미포함(사실만).

## I-07 — 통합 계약

- GROUP_INGREDIENTS 전 대표가 도감/food-graph/NUTRI_MAP 중 1+에 등장(고아 0).
- 추천 파이프(`validCombos(popularDishesFor(당근), ['당근'])`)에 미역국 미포함(괴식 0).
- route.ts L101 `'/ingredient-recipes.json'` freqMap 소스 경로 회귀 고정.
- A 대조군 영향: GROUP_INGREDIENTS **무변경**이라 Letter A 출력 불변(I-07-8·기존 A-01-7 그대로 그린).

---

## 2026-06-19 — 추천 품질·커버리지 보강 (이사님: 메뉴 매핑/괴식/그래프/급식빈도)

시그니처 전부 고정·신규 export만 추가·`strongPairsOf`/`GROUP_INGREDIENTS` **byte 무변경**(대조군·TR-02 골든 보존). throw 0·LLM 0·degrade 폴백.

### J-01 — 곁들임 안전 게이트(라이브 괴식 봉합)
- **사고:** `buildRecoFacts`/`selectDailyMaterials`가 `strongPairsOf`를 곁들임 추천에 직접 써서 **"잘 먹는 김치 곁들이면 좋아요"**(두부 타깃)가 라이브로 노출됨. 원인 ⓐ tray(식판 동시출현) 엣지가 strong(김치+요구르트·미역+돼지고기), ⓑ spicy/교차괴식 미차단.
- **봉합:** `foodGraph.garnishPairsOf`(=strongPairsOf − tray) → `coachRecos.safeGarnishOf`가 추가 차단 ① 매운/김치류(`isSpicyIngredient`+깍두기/총각) ② **날곡물**(생쌀·밀가루 등 STAPLE_FORMS 키 — 곁들임 금지, 먹는 형태로만) ③ **교차괴식**(`단 것[과일·우유류] ↔ 짠 단백질[생선·해산물·콩/두부]`. 짠↔짠 두부+멸치는 허용). 곁들임 노출 경로(`buildRecoFacts` part a·b, `pickFoodReco` pl, `selectDailyMaterials` pairLiked)만 사용. **`strongPairsOf`는 무변경**(음식 추천을 '식단으로 판단'하는 TR-02 의도·골든 보존).
- **김치 앵커 차단:** part(b)는 liked가 김치류면 앵커째 생략("김치 → 궁합 X"는 '김치에 X 섞어라' 권유이므로).
- **과일 매핑 차단:** `popularDishesFor`가 과일이면 빈 배열(배=양념인 '너비아니구이'처럼 숨은-재료 음식으로 오인 금지). 과일은 과일로(간식채널).
- **부적합 메뉴 확장:** 매운국(육개장·닭개장·부대찌개·얼큰)·짠절임(장아찌·단무지·깻잎지·젓)·견과 알레르겐·**튀김/초가공/단음료**(튀김·돈가스·과자·사탕·탄산·아이스크림) 차단.

### J-02 — popularDishesFor 메뉴 정제
- NEIS 원본명 정제: 접두 `(간식)`·접미 `&쌈장`/`(200ml)` 제거, `육개장·닭개장`(isSpicyDish 미탐 매운국)·짠지·견과 알레르겐 차단. kit 카테고리 폴백이 받쳐 빈 배열 없음. 급식빈도순(freqMap freq 내림차순) 유지.
- 예: 당근 `(간식)꼬마김밥·깻잎지` → `꼬마김밥·채소죽` / 소고기 `육개장` 제거.

### J-03 — 식재료명 별칭 정규화(`ING_YOUA_ALIAS`)
- 도감 표준명 ↔ youa 키 불일치로 `youaRankOf`가 null이던 대표 봉합: 요거트→요구르트·달걀→계란·콩/검은콩→콩(대두)·현미/쌀/백미→멥쌀·잡곡→보리·밀가루→밀·버섯→느타리버섯. **전부 youa 실재 키 매핑(% 날조 0).**
- **의도적 미매핑:** 연어(한국 영유아 급식 희소·고가) → null 유지(정직).

### J-04 — youaRankOf 분모 정직화 + 부모 노출은 안심 톤(서열·등수·% 금지)
- 순위 모집단을 youa **전 항목(169종)**으로(기존 식품군 인식 부분집합 → 인위 축소). 동률 안전(엄격히 큰 것 +1). rank/topPct는 **내부용**(빈도 동률 타이브레이크)으로만 유지.
- **부모 노출(`buildRecoFacts`)은 `youaReassuranceFor`** — `상위 N%`·등수·등장률% **전부 제거**, "또래 급식에도 자주 오르는 익숙한 재료"라는 **안심 톤만**(이사님: 서열은 부모 부담). 등장률 `YOUA_COMMON_PCT(50)` **이상인 흔한 재료만** 노출, 미만/미수록은 절 생략(근거 없으면 안 넣음 → 단호박 1.4%는 "자주" 주장 안 함).

### J-05 — 급식빈도 추천 반영(이사님: 흔할수록 매우 우선) + OCR 일일 리밸런싱
- **안전가산(Q1):** `rankIngredients` 정렬에 youa 등장률 **동률 타이브레이크** 삽입 — 골든 점수/parts 무변경, 점수 동률만 '급식에 더 흔한 것' 우선.
- **리밸런싱 준비(엔진만 — 자동 실행 아님):** `ingredientGioFreq`가 **라이브 `ingredient-freq.json` 우선 → GIO_FREQ 폴백**으로 읽도록 죽은 배선을 살림. 현재는 무동작(라이브=GIO 동일값·골든 그린).
  - ⚠️ **아직 매일 자동 갱신 안 됨.** `build-ingredient-freq.py`는 어디서도 자동 실행 안 함(크론/Actions 없음·2026-06-13 수동 1회). 새벽 2시(UTC 17:00) coach 크론은 `warmGraphFromSql`(그래프 SQL 워밍)만 함. Vercel 크론은 TS 라우트만 때려 **.py를 직접 못 돌림**. ingredient-freq.json은 빌드타임 import라 갱신 시 **재배포** 필요(그래프 같은 런타임 warm 경로 없음).
  - ⚠️ **불변식 충돌:** `I-01-9`가 `public/ingredient-freq.json ≡ GIO_FREQ` 완전일치를 강제 + 데이터세션 핸드오프가 freq 스크립트/GIO_FREQ/ingredient-freq.json **고정**을 명시. 즉 재집계로 파일을 키우면 I-01-9가 깨짐 → **리밸런싱 활성화는 데이터세션 owner 합의 사안**(GIO_FREQ 동반 갱신 + I-01-9 완화 + 러너[Actions/TS포팅] + 재배포 or 런타임 warm).
- **빈도 역할 분리:** youa-freq=모집단 기준선(고정 레퍼런스·표준식단 등장률) / ingredient-freq=우리 관측(매일 갱신). youa 확장/재생성은 DB(Supabase `learned_menus`) 의존 → 오프라인 불가, 별칭으로 정합 처리.

### J-06 — food-graph 구조적 빈 구멍(검증 결과·degrade 정상)
- pickFoodReco chain/pair가 조용히 실패하는 대표(곁들임/사촌 0): `잡곡·콩·버섯`(포괄어 — 그래프 노드 아님), `연어·단호박·검은콩`(pairs 0), `멸치`(bridge 0). 전부 `dish`/`plain` 폴백으로 안전 degrade(괴식 0).
- food-graph.json은 야간 SQL→JSON 재생성물이라 **수기 편집 금지**(덮어씀). 보강은 생성 파이프(gen-food-graph.py/SQL)에서. 여기선 소비 로직 degrade로 흡수 + 본 문서로 추적.
