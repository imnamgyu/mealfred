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
