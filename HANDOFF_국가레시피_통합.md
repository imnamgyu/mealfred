# 핸드오프: 신규 6개 데이터 원천을 음식 추천 2축 네트워크에 통합

> **📌 작성 직후 갱신(2026-06-14, commit 2682137)** — 본문에 "교차채널 노이즈 필터 미구현·오염 출고 중"이라 적힌 부분(top ⚠️#1, 원칙6, (D)5, (F) ❌교차채널)은 **이미 구현·배포 완료**다: `gen-food-graph.py` 식판 병합에서 과일(cat='과일') 쌍 116개를 차단 → `food-graph.json`의 과일×주메뉴 strong 11→0(잔존 `딸기+빵`=레시피 출처, 정상), pair 468→**451**·식판 신규 106→**89**·승급 37→**35**, 회귀 테스트 갱신·835 그린. 그 부분은 "구현됨"으로 읽어라. **단 새 식단표/끼니묶음 원천은 여전히 같은 필터를 타야 하고, 유제품(우유·치즈)×끼니 교차채널은 아직 미적용이니 추가 시 협의.** 아래 본문 수치(pair 468·신규106·승급37·합643)는 451/89/35/626로 갱신됐다.

너는 밀프레드 음식 추천 네트워크에 6개 신규 데이터 원천을 정규화·통합하는 엔지니어다. 직전 세션에서 네트워크를 **2축(레시피 동시출현 + NEIS 식판 공통출현)**으로 재설계했다. 이 문서가 단일 진실원이다. 아래 규칙대로 정확히 일하고, 내 소유 파일과 충돌하지 마라.

> **⚠️ 먼저 읽어라 — 옆 세션이 막아야 할 순서(심각도순)**
> 1. **교차채널 노이즈 필터는 코드에 미구현이고, `food-graph.json`에 이미 `소고기+포도·두부+포도·닭고기+바나나·바나나+소고기·두부+토마토·닭고기+포도`가 strong tray pair로 오염 출고 중이다(실측 확인).** 식단표/끼니묶음 원천은 내가 필터를 먼저 구현하기 전까지 식판축에 절대 넣지 마라.
> 2. **dedup 전략 전무** → 6개 원천 표준 한식 겹침 → src별+교차 fingerprint dedup 필수(안 하면 lift 부풀림).
> 3. **비한식 silent 드롭** → 드롭률 리포트 후, 도감 확장 전엔 비한식 src를 FILES 등록 금지.
> 4. **`_추가.json` 영점 기여의 진짜 원인 = `amount:"45.0g"` 문자열 키**(g 없음이 아님) → 정규화 단계에서 순수 숫자 g로 변환.
> 5. **freq·kit-dish-matrix는 gen-food-graph와 별개 파이프라인** → 옆 세션이 건드리지 말 것, dish/freq 반영은 내가 별도 재생성.

---

## (A) 현 2축 네트워크 — 파일·함수·스키마 (정찰·실측 검증 완료)

모든 경로의 WEB 루트 = `/Users/ing/Desktop/dev/web/landing_page/deploy/web`. 아래 파일경로는 이 루트 기준 상대.

### 빌드 파이프라인

- **레시피축(식재료↔식재료)**: `scripts/gen-food-graph.py` → `lib/food-graph.json`
  - BASE=`/Users/ing/Desktop/편식극복키트/01_참고자료/B_레시피DB`, FILES=**하드코딩 화이트리스트 6개**(`gen-food-graph.py:20-24`): `아동기_레시피DB.json`,`유아기_월별식단_레시피DB.json`,`유아기_레시피DB.json`,`유아기_레시피DB_추가.json`,`영아기_레시피DB.json`,`영아기_레시피DB_추가.json`. **자동 글롭 없음 — FILES에 안 적으면 안 읽힘.**
  - 로딩: `json.load` → list면 그대로, dict면 `d.get('recipes')` 또는 첫 list값. dict 원소만 채택.
  - 도감 노드 소스: `public/ingredients-light.json`의 `nm`(top-level 키 `['ingredients']`, **실측 210행**).
  - `norm(raw)`: `head = re.split(r'[,_(]', raw)[0].strip().replace(' ','')`. 도감 정확일치 **또는 도감명이 head에 substring 포함**(잔멸치→멸치). 실패=None 드롭. **gen-food-graph의 norm은 REMAP/LEXICON을 쓰지 않음**(분해기와 다름 — 아래 X-2 주의).
  - 메인 게이트: `total=sum(amount_g)`; 각 ing의 `share=amt/total`. 채택=`amt>=8 OR share>=0.15 OR (idx<=1 AND amt>=3)`. SEASONING·양파 skip. `mains<2`면 레시피 통째 skip. **실측 recipes_used=2269**.
  - pair: mains sorted 후 2-combinations → `co[(a,b)]++`, `node_recipes[nm]++`. `MIN_CO=4`, 노드별 `TOPK=14`.
  - lift: `N=n_used`; `lift = round(c*N/(na*nb), 2)`. 1.0=우연, >1=실제 연관. `LIFT_STRONG=1.2`, `LIFT_MED=1.0`.
  - strength: `c>=15→3, c>=7→2, else 1`. grade: `strength>=2 AND lift>=1.2→strong`; `strength>=2 AND lift>=1.0→medium`; else `weak`. (떡+달걀 lift0.72→weak, 밥+달걀 lift0.75→weak = 흔한 식재료 우연동시출현 차단이 설계 의도.)
  - pair 스키마: `{a,b,kind:'pair',strength,lift,grade,count,basis:'같이 쓰는 레시피 {c}개'}`.
  - bridge: `BRIDGE_SEED`=수기 큐레이션 사촌(맛·식감·색 닮음, 동시출현으로 안 잡히는 대체재). 양끝 도감set·a≠b만. 스키마: `{a,b,kind:'bridge',strength:3,verified:true,basis:'맛·식감이 닮은 사촌'}` — **lift/count/grade 없음**. **실측 bridges=175**.

- **식판축(NEIS 트레이 공통출현) — upgrade-only 병합**: `pull-neis-tray.py` → `/tmp/neis-trays.json` → `gen-neis-tray-cooccur.py` → `/tmp/neis-tray-pairs.json` → gen-food-graph가 병합.
  - tray 파일 키=`'a|b'`(a<b 정렬, 도감명) `{c,na,nb,lift,grade}`. `GRANK={weak:0,medium:1,strong:2}`. 양끝 도감set·a≠b만.
  - 병합 순서(중요): gen-food-graph는 GRANK 비교 **이전에** 매칭되는 기존 edge에 `e['tray']=tg`를 **무조건 set**한다. 그 다음 `GRANK[tg]>GRANK[e.grade]`일 때만 `e.grade=tg`(**강등 금지**), tg=='strong'&strength<2면 strength=2, `n_tray_up++`(실측 37).
  - 기존 edge 없고 tg=='strong'이면 새 pair edge 추가(`strength:3,grade:strong,src:'tray',tray:'strong',basis:'같은 끼니 식단 {c}회'`), `n_tray_new++`(실측 106). **medium/weak tray-only 쌍은 버려짐.**
  - ⭐**`tray` 필드 보유 edge 수(실측 210) ≠ 승급 edge 수(37) ≠ tray-only 신규(106)**. `e['tray']=tg`는 GRANK 비교 전 무조건 set이라, "tray 필드 = 승급"이 아니다. 재생성 후 카운트 해석 시 혼동 금지.
  - tray 파일 없으면 조용히 base(레시피만)로 진행 → tray_up=0/tray_new=0(아래 M-3 함정).
  - `gen-neis-tray-cooccur.py`: `MIN_CO=8`, `LIFT_STRONG=1.2/LIFT_MED=1.0`, `C_STRONG=15/C_MED=8`. `lift=round(c*N/(na*nb),3)`. 출력 키 `'a|b'`·`{c,na,nb,lift,grade}`. (저빈도 우연 lift폭주 차단, 고등어|살구 c6 제거.)
  - 분해기 decode: `gen-neis-boost.py`(decode 55–76행, 휴리스틱 `not any(s in m for s in ('닭갈비양념',))`)와 `gen-neis-tray-cooccur.py`(decode 53–65행, `'닭갈비양념' not in m`)는 **동일 로직·동치이나 byte-identical 복붙이 아니다(tray판이 압축 재작성)**. REMAP/LEXICON 블록은 두 파일 동일(`REMAP={쌀:멥쌀,콩:콩(대두),떡:멥쌀떡,요거트:요구르트,느타리:느타리버섯}`). 한쪽만 고치면 두 축이 어긋난다 — **둘 다 내 소유, 건드리지 마라.**
  - 휴리스틱: 최장일치 SURF 정렬·SCAN[surf]·SPICE skip·used_spans 겹침 skip; '닭' 있고 닭고기 미발견&닭갈비양념 아니면 닭고기 추가; '밥|죽|미음'에 멥쌀/현미/보리 없으면 멥쌀 추가. LEXICON 예: 소세지→소시지,달걀→계란,삼겹살/제육→돼지고기,불고기/너비아니→소고기,동태/북어/코다리→명태,방울토마토→토마토,쇠고기미역국→미역,유부→두부, **멥쌀/쌀밥/백미→쌀**. SPICE=도감 grade=='향신료'+마늘·파·생강·고추·참깨·들깨.

- **음식×식재료 매트릭스(dish 채널)**: `lib/kit-dish-matrix.json`. **LLM 채점 워크플로 산출물(`scored_at:2026-06-02` 고정 — gen-food-graph가 갱신 안 함)**. top keys=`[dishes,cells,ingredients,meta,scores]`. dishes=32 카테고리, scores=dish→ing→0~3(LLM 정성), cells=dish→ing→count(동시출현). **meta.recipes_used=3410**. dish(볶음밥/카레/짜파게티)는 food-graph 노드 아님 — 채널 분리.

### 소비측 계약(TS)

- `lib/foodGraph.ts`: `RawEdge`(15행) = `{a,b,kind:'pair'|'bridge',strength,basis,count?,lift?,grade?,verified?,tray?,src?}`. `PAIR_MIN_STRENGTH=2`(19행). `strongPairsOf(nm)`(49행): `kind==='pair' && (grade?grade==='strong':strength>=2)`. `verifiedCousinsOf(nm)`(54행): `kind==='bridge' && (verified===undefined||verified===true)`. **모든 추천 소비자가 raw `neighborsOf` 대신 이 두 헬퍼만 사용**(coachRecos·coachMaterials·comboMatrix·comboGuard). `coachRecos.ts:66`이 strongPairsOf를 소비 → 오염 tray edge가 그대로 추천에 노출됨(아래 C-1).
- `lib/comboMatrix.ts`: `scoreCombo`(31–43행) 4단 — (1)scores[dish][ing] 0~3, **단 score===2 && cells<CELLS_MIN(8)이면 1로 강등** (2)pair: strongPairsOf 교집합 (3)cells>0이면 1 (4)none=0. `CELLS_MIN=8`(28행). `isComboOk(dish,ing,thr=2)`(46행). (떡+달걀 cells4<8→차단; 국+당근 cells49·볶음밥+당근 score3 유지.)
- 도감 canon=`public/ingredients-light.json` 210개, 전부 `nm` 보유. **모든 산출물 키가 nm 210집합의 부분집합이어야 함**(테스트 I-01-1 차집합 0). ⚠️**도감엔 `쌀`·`콩`·`떡` 없고 `멥쌀`·`콩(대두)`·`멥쌀떡`만 있다(실측).**
- freq 단일진실원: `public/ingredient-freq.json` ≡ `lib/coachMaterials.ts` GIO_FREQ(22–26행). I-01-9가 freq·pct 완전일치 강제. **단 freq는 gen-food-graph가 아니라 별도 스크립트가 만든다(아래 M-1).**

### 설계 원칙·교훈(절대 준수)
1. 궁합은 raw count가 아니라 **lift=c·N/(na·nb)** 로 우연 보정(떡+달걀 사고).
2. LLM 정성의견(kit-matrix score)은 **실제 동시출현(cells)이 받쳐줄 때만** 인정(CELLS_MIN).
3. 새 축은 **upgrade-only 병합(강등 금지)**: 메뉴명에 안 적힌 숨은 채소 누락 ≠ 안 어울림.
4. **보수적 기본값: 미수록 조합=통과 아니라 금지.**
5. 모든 식재료는 **도감 표준명(canon)으로 매핑, 캐논 밖 드롭(환각 0), 향신료/양념 제외.**
6. **교차채널 노이즈**: 간식채널(과일·유제품)×끼니 단백질/곡물의 같은-끼니 동시출현은 곁들임 궁합 아님. ⚠️**이 필터는 현재 코드에 미구현이고 이미 오염 출고 중**(아래 C-1).

---

## (B) 신규 6개 원천 → 축/산출물 매핑

| # | 원천 | 권위 | 주 투입 축/산출물 | 접근법(키/파싱/g) |
|---|------|------|------------------|------------------|
| 1 | **큐넷 조리기능사 공개문제** (q-net.or.kr) | ⭐⭐⭐ | **레시피축**(한식33→food-graph) + **cuisine 태그**(양식·중식·일식~70과제) + **정량 g 메인/곁들임** | PDF→텍스트(pdfplumber). '지급재료 (g)' 표=정확 정량 → `amount_g` 그대로. 비한식은 cuisine 메타 부여(도감 비한식 확장 후 노드화·아래 H-3) |
| 2 | **농진청 전통향토음식DB** (농식품올바로/공공데이터포털) | ⭐⭐⭐ | **레시피축 정본**(한식 궁합 권위 최상) | 공공데이터포털 CSV/XLS 또는 올바로 다운로드. 3,248개·지역·식품유형. 재료 컬럼 파싱→co-occurrence. **g 없으면 존재-기여 모드**(amount_g 누락=pair 기여 0) |
| 3 | **한식진흥원 정밀레시피** (hansik.or.kr/data.go.kr) | ⭐⭐ | **레시피축**(한식 표준 정량) + cuisine='한식' | data.go.kr 파일/OpenAPI. 정량 g 있음 → amount_g 채움. 외국어표기 800은 무시(노드는 도감 nm으로만) |
| 4 | **식약처 조리식품레시피** COOKRCP01 OpenAPI | ⭐⭐ | **영양/나트륨 레이어(보존만)** + 보조 레시피축(존재-기여) | **무료키 필요**(data.go.kr 신청). JSON/XML. 1,000+. 재료문 파싱→co-occurrence. ⚠️**영양 필드명(나트륨·열량·재료문)은 실제 API 응답 스키마로 직접 재확인하라 — 제공 파일로 미검증.** g 파싱은 자유텍스트라 부정확 → **존재-기여만**(아래 H-4) |
| 5 | **농정원 레시피 기본+재료** OpenAPI(15057205·15058981) | ⭐⭐ | **레시피축**(co-occurrence 최적 — 재료 개별항목 분리) | **무료키 필요**. 두 API 조인(기본↔재료). 재료 행별 분리라 파싱 간단. g/분량 컬럼 있으면 amount_g 채움(문자열 단위면 변환·아래 X-1) |
| 6 | **KADX 농식품 빅데이터거래소** 무료 레시피 | ⭐ | **레시피축 보조 코퍼스** | KADX 무료 다운로드. 형식 제각각 → 정규화 어댑터. 권위 최하(크라우드급), **단독 신규 strong edge 생성 금지**(아래 H-2) |

핵심:
- **대부분 레시피축(한 음식 안 동시출현) 보강** → 합산 MIN_CO=4를 더 빨리·견고히 넘겨 lift 신뢰도 상승(단 dedup 선행·아래 H-1).
- **식약처(#4)만 영양/나트륨 수치 보존**(소비 설계는 내가).
- **큐넷(#1) 비한식 과제만 cuisine 태그** → 양식/중식/일식 식재료의 도감 확장 트리거(아래 H-3).

---

## (C) 정규화 출력 계약 — gen-food-graph.py가 흡수하는 단일 형식

신규 코퍼스 각각을 **개별 .json 파일**로 내놓되, gen-food-graph가 즉시 읽는 레시피 스키마를 그대로 따른다.

### 1) 파일 위치 + FILES 등록
- 위치: `/Users/ing/Desktop/편식극복키트/01_참고자료/B_레시피DB/` 아래 새 파일. 명명: `src_qnet.json`·`src_nongchon.json`(농진청)·`src_hansik.json`·`src_mfds.json`(식약처)·`src_nipa.json`(농정원)·`src_kadx.json`.
- **`scripts/gen-food-graph.py:20-24` FILES 리스트에 파일명 추가**(자동 글롭 없음). 내 소유 파일 — (E) 절차로 조율.

### 2) 최상위 형식
`list[recipe]` 또는 `{"recipes":[...]}`(dict면 첫 list값). dict 원소만 채택.

### 3) 레시피 객체(pair가 잡히는 유일한 load-bearing 필드는 `ingredients`)
```json
{
  "name": "음식명(권장)",
  "src": "qnet|nongchon|hansik|mfds|nipa|kadx",
  "authority": 3,
  "cuisine": "한식|양식|중식|일식",
  "ingredients": [
    {"name": "<도감 nm으로 캐논화한 식재료명>", "amount_g": 80},
    {"name": "...", "amount_g": 30}
  ],
  "nutrition": {"na_mg": 480, "kcal": 320},
  "fingerprint": "<dedup용: 음식명정규화 + 정렬된 메인식재료 집합>"
}
```
- `ingredients`만 현 gen-food-graph가 소비. `name`/`amount_g` 외 필드(`src`/`authority`/`cuisine`/`nutrition`/`fingerprint`)는 **현 코드가 무시하나 있어도 무방** — (D)의 권위 가중·영양·dedup을 내가 흡수할 때 쓸 메타이니 **반드시 채워라**.
- `ingredient.name`은 콤마/괄호/언더스코어 수식어 허용. norm()이 head 추출 후 도감 정확일치/substring 매칭. **head가 도감 nm과 일치하거나 그 nm을 포함해야 노드로 산다.** 실패=조용히 드롭(silent — 아래 H-3·X-2).

### 4) ⭐ amount_g는 반드시 **순수 숫자(g)** — 문자열/단위 금지
None/0/문자열이면 게이트(`amt>=8 OR share>=0.15 OR (idx<=1 AND amt>=3)`) 전부 실패 → 메인 0 → 레시피 통째 skip.
- ⚠️**`_추가.json` 영점 기여의 진짜 원인은 'g 없음'이 아니라 필드명/타입이다(실측 확인): 그들은 `{"name":"갈치, 생것","amount":"45.0g"}` 문자열을 쓰고, 현 코드는 `ing.get('amount_g',0)` 숫자만 읽는다.** 신규 공공 API도 `"480mg"`·`"2큰술"`·`"45.0g"`를 줄 게 확실하다.
- 너의 정규화 단계에서 단위·문자열을 파싱해 `amount_g`(순수 숫자 g)로 변환하라. 비-g 단위(큰술·컵·개)는 표준 환산표로 g 추정, **추정 불가는 amount_g 생략 + 존재-기여 모드 표시**(amount_g 누락 = pair 기여 0임을 명심).

### 5) 도감 canon 매핑 의무 — **입력 단계에서 정확명으로 캐논화**(substring 추측 의존 금지)
- 노드 = `public/ingredients-light.json`의 `nm`(210). **신규 식재료를 노드로 만들려면 먼저 도감에 nm 추가**(7파이프라인 경유 — `/mealfred-food-mapping` Part C, 인터넷 조사+영유아 안전 스크린). 레시피만 넣고 도감에 없으면 norm()=None 드롭.
- ⚠️**gen-food-graph의 norm은 REMAP/LEXICON을 안 쓰고, 도감 substring 매칭을 정렬 없이 돌린다** → 짧은 도감명이 먼저 걸려 오매핑('파'가 '파인애플'·'파프리카'에, '김'이 '김치'에). tray 분해기는 최장일치지만 gen-food-graph norm은 아니다. 신규 코퍼스는 표기가 다양해 오매핑이 터진다.
- 따라서 **`ingredient.name` head를 도감 정확명(nm)으로 미리 정규화해 넣어라.** 구체 매핑은 도감 nm 실재 여부를 보고 결정(실측 기준):
  - `쌀`·`콩`·`떡` **도감에 없음** → `쌀,멥쌀,…`→`멥쌀`, `콩`→`콩(대두)`, `떡`→`멥쌀떡`(분해기 REMAP과 동일 방향).
  - `닭가슴살`·`닭다리`→`닭고기`, `삼겹살`·`제육`→`돼지고기`, `너비아니`→`소고기` 등.
- **향신료/양념·양파 제외**(SEASONING set + 양파는 허브 노이즈). 캐논 밖·SPICE(grade='향신료')는 넣지 마라(어차피 드롭).

### 6) 출처 태그·권위 가중·fingerprint(제안 — 내가 흡수)
각 레시피에 `src`+`authority`(국가표준 3=농진청·큐넷·한식진흥원 / 공공 2=식약처·농정원 / 크라우드 1=KADX) + `fingerprint`(dedup용·아래 H-1) 부여. 현 gen-food-graph는 무시하지만 (D) 흡수 시 쓸 메타다.

---

## (D) 아키텍처 발전 제안(설계만 — 내가 구현, 너는 데이터 형태만 준비)

너는 **데이터 정규화/수집**까지만 하고, 아래 엔진 변경은 **내가 소유 파일에서 구현**한다. 다만 네 출력이 아래를 가능케 하도록 메타를 갖춰라.

1. **권위 가중 — lift에 직접 곱하지 마라**: lift는 base-rate 보정 통계량이라 권위 가중과 차원이 다르다. 가중 카운트를 lift 공식에 넣으면 "흔한 식재료 우연 차단"(떡+달걀 방지 설계)이 깨진다. 권위는 별도 축으로 분리한다 — **너는 `authority`(3/2/1)만 정확히 채우고, 엔진은 내가 '권위≥2 원천에서 최소 1회 관측'을 strong 승격 게이트로** 건다(KADX-only 약신호 단독 strong 금지). 가중 합산은 보조 신뢰도로만. **lift 임계(1.2/1.0)·공식 변경 금지.**
2. **정량 g 기반 메인/곁들임 분리**: 큐넷 '지급재료 g'로 메인 vs 곁들임 구분 강화. g 있는 원천 우선. → 너는 `amount_g` 정확히(문자열→숫자 변환·위 X-1).
3. **영양·저염 레이어 — 보존만, 산출물 만들지 마라**: 식약처 영양은 **음식 단위 수치**라 식재료 노드에 직접 못 붙인다(식재료 귀속·저염 점수 소비 설계는 내가). 너는 `src_mfds.json.nutrition`에 음식별 `na_mg·kcal`만 원형 보존하고, **`recipe-nutrition.json`을 산출하지 마라**(소비처 미정 = dead-end write 위험, period_summaries 전례). 영양 수치는 src_mfds.json 안에만.
4. **비한식 식재료 도감 확장 — 리포트만, 직접 등재 금지**: 양식/중식/일식 과제(큐넷)의 도감 미수록 식재료(특정 향신·치즈·면류)는 **도감 미수록 식재료 목록 + 드롭률을 내게 텍스트로 리포트**(추가 보류, 내가 7파이프라인 안전 스크린 후 등재). cuisine 태그는 dish 채널 또는 향후 cuisine 레이어로.
5. **교차채널 노이즈 필터 — 현재 미구현, 내가 먼저 구현**: 신규 원천이 '식단표/끼니 묶음'이면 식판축 노이즈 필터(과일·유제품×단백질/곡물 same-tray 쌍 컷)를 거쳐야 하나 **그 필터가 아직 없다(아래 C-1)**. 레시피(한 그릇) 동시출현은 OK지만 식판/끼니류는 보류.

---

## (E) 충돌 방지 · 작업 분담

### 내가 소유(직접 수정 금지 — 요청으로 조율)
- **빌드 스크립트**: `scripts/gen-food-graph.py`(FILES 포함)·`scripts/gen-neis-tray-cooccur.py`·`scripts/pull-neis-tray.py`·`scripts/gen-neis-boost.py`·`scripts/build-foods-recipes.py`·`scripts/build-ingredient-freq.py`
- **소비측 TS**: `lib/foodGraph.ts`·`lib/comboMatrix.ts`·`lib/coachRecos.ts`·`lib/coachMaterials.ts`·`lib/coach.ts`(SNACK_CHANNEL 부근)(+ 연쇄 import: `lib/comboGuard.ts`·`lib/coachFacts.ts`·`lib/coachCompare.ts`·`lib/replayB.ts`·`lib/affinity.ts`)
- **데이터 산출물**: `lib/food-graph.json`·`lib/kit-dish-matrix.json`·`public/ingredients-light.json`·`public/ingredient-freq.json`·`public/ingredient-recipes.json`·`lib/coachMaterials.ts` GIO_FREQ
- **테스트**: `tests/coach-data.test.ts`·`tests/coach-tray-cooccur.test.ts`
- **라우트(읽기)**: `app/api/coach/route.ts`·`app/api/cron/coach/route.ts`·`app/foods/[slug]/page.tsx`·`app/admin/food-graph/page.tsx`

### 네가 소유(만들/고침)
- **신규 정규화 코퍼스 .json**(`/Users/ing/Desktop/편식극복키트/01_참고자료/B_레시피DB/src_*.json`)
- **신규 수집·파서 스크립트**(별도 디렉터리 권장 `scripts/ingest/`): `fetch_qnet.py`·`parse_qnet_pdf.py`·`fetch_nongchon.py`·`fetch_mfds.py`(COOKRCP01)·`fetch_nipa.py`(15057205/15058981 조인)·`fetch_kadx.py`. 무료키는 `.env`(키 커밋 금지).
- **리포트(파일 말고 텍스트로 내게)**: ①도감 미수록 비한식 식재료 + 드롭률 ②dedup 전/후 카운트(부풀림 규모) ③분해기 LEXICON 보강 후보.
- (선택) 식약처 영양은 `src_mfds.json.nutrition`에만 보존(별도 JSON 산출 금지).

### freq·kit-matrix는 별개 — 절대 건드리지 마라(M-1·M-2)
- **freq는 gen-food-graph가 아니라** `build-foods-recipes.py`·`build-ingredient-freq.py`가 만든다(실측). 이 둘의 FILES는 gen-food-graph FILES와 **다르다**(`아동기_레시피DB.json`+`유아기_월별식단_레시피DB.json` 2개만). `build-ingredient-freq.py`의 pct는 권위표(MEASURED) 고정 — 재산출 안 함. I-01-9가 `ingredient-freq ≡ GIO_FREQ` 완전일치 강제. **신규 코퍼스의 freq 반영 여부는 내가 결정** — 너는 freq 스크립트·GIO_FREQ·ingredient-freq.json을 건드리지 마라(그래프만 늘리고 freq 그대로면 I-01-9는 안 깨지나 코퍼스가 어긋나므로 통합 시작 전 나와 합의).
- **kit-dish-matrix `cells`·`scores`는 LLM 워크플로 산출물(2026-06-02 고정), gen-food-graph가 갱신 안 함.** 신규 코퍼스가 음식×식재료 동시출현을 늘려도 cells 불변 → CELLS_MIN(8) 게이트가 새 조합을 계속 차단("실증됐는데 추천 안 늘어남"). dish 채널 반영이 필요하면 `/mealfred-food-mapping` Part B 매트릭스 재생성을 내게 별도 요청 — 너의 src 추가만으론 dish 채널 안 움직인다.

### 재생성 절차(원자적 — 단일 세션이 한 커밋으로)
1. 신규 `src_*.json` 생성·검증: ①amount 문자열→숫자 g 변환 ②head 도감 nm 캐논화 ③src별+교차 fingerprint dedup ④도감 매칭 드롭률 리포트.
2. **나(이 세션)에게 FILES 등록 요청** → `gen-food-graph.py:20-24`에 파일명 추가(비한식은 도감 확장 완료 전 등록 금지).
3. **식판축 먼저 복원**: `/tmp/neis-tray-pairs.json` 존재 확인 → 없으면 `pull-neis-tray.py`→`gen-neis-tray-cooccur.py`로 생성(없으면 tray_up=0/new=0으로 식판축 통째 빠진 채 재생성돼 I-05-4 깨짐).
4. `python3 scripts/gen-food-graph.py` 재생성(CWD 무관·절대경로 하드코딩).
5. **카운트 증가분의 출처 분해 후 테스트 드리프트 갱신(의무)**:
   - 카운트가 바뀌면 출처를 분해해 보고 — (정상)레시피 동시출현 증가 vs (오염)식판 교차채널 strong. **과일×단백질 strong이 새로 늘면 expect 고치지 말고 C-1 노이즈 필터부터.**
   - I-05-4: pair `toBe(468)` · bridge `toBe(175)` · `edges.length toBe(643)`. **주석에 `468=362(레시피)+106(식판 strong 신규)` split이 하드코딩돼 있음 — 새 합계로 무지성 교체 금지(오염 tray-strong을 그린으로 승인할 위험).**
   - I-05-5: `nodes.length toBe(192)`.
   - ⚠️**bridge `toBe(175)`도 도감 확장 시 변동 가능**: 신규 식재료 등재 시 그동안 양끝 도감 미수록으로 드롭되던 BRIDGE_SEED 쌍이 되살아나 bridge가 의도치 않게 증가할 수 있다. pair만 변동으로 가정 금지.
   - (tray 테스트 `coach-tray-cooccur.test.ts`는 `toBeGreaterThan(0)`만 검사 — 카운트 갱신 불필요)
6. **의미 회귀(expect 고치지 말고 데이터 점검)**: I-05-6(미역 pair에 당근 없음)·I-04-1(미역국+당근 score 1<2 차단)·I-04-8(당근+시금치 strong / 당근+두부 lift0.58 약신호 차단). 비타민A채소 배열 회귀 = **I-07-8(원본 풀배열 `['단호박','당근','시금치','근대']` 불변)** + **I-03-3(원본 선두 `[0]==='단호박'`)** + **I-03-1/I-03-6b(RANKED `['당근','시금치','근대','단호박']` freq 내림차순)**. (※ 풀배열은 I-07-8이지 I-03-3이 아니다 — ID 혼동 주의.) 깨지면 데이터가 잘못된 것.
7. `npm run test`(vitest prebuild 게이트) green 확인 후 **JSON+테스트 expect를 한 커밋**으로. (freq·GIO_FREQ는 위 정책상 미변경.)

⚠️ **데이터 재생성은 단일 세션이 원자적으로.** 네 작업은 **(1) src_*.json 정규화·수집·검증·dedup·드롭률 리포트까지** 자체 완료하고, **(2) FILES 등록+재생성+테스트 갱신은 나와 동기화**해서 한 번에 커밋한다.

---

## (F) 하지 말 것

- ❌ **환각 금지**: 도감 nm에 없는 식재료를 노드로 넣지 마라(입력부터 캐논화·silent 드롭은 안 보임). 비한식 신규 식재료는 **리포트만**, 도감 추가는 내 7파이프라인.
- ❌ **raw count로 강함 판정 금지**: 추천 강도는 grade='strong'(strongPairsOf)이고 grade는 **lift 보정**으로 정해진다. count 큰 것 ≠ 강함. lift 임계(strong 1.2/med 1.0)·공식 임의 변경 금지.
- ❌ **권위 가중을 lift에 직접 곱하지 말 것**: base-rate 보정이 깨진다. `authority` 메타만 채우고 승격 게이트는 내가.
- ❌ **dedup 없이 그래프 기대 금지**: 6원천 표준 한식 겹침 → 같은 잡채 4번이면 당근+시금치 co가 4로 부풀어 MIN_CO를 가짜로 넘고 lift 보정 무력화. fingerprint dedup + 권위 높은 1건만.
- ❌ **강등 금지**: 식판/끼니류 새 축은 upgrade-only. 기존 strong을 medium/weak로 내리지 마라. 메뉴에 안 적힌 식재료 누락을 '안 어울림'으로 해석 금지.
- ❌ **임의 조합 생성 금지**: 미수록 조합은 통과 아니라 금지(보수적 기본값). LLM이 그럴듯하게 만든 조합을 cells 실증 없이 score 2+로 넣지 마라(CELLS_MIN 게이트 우회 금지).
- ❌ **캐논 밖·향신료/양념 투입 금지**: SEASONING(마늘·파·소금·간장·설탕·참기름·고추장·된장·꿀·밀가루·물·육수·버터 등)·양파·SPICE(grade='향신료')는 메인 노드에서 제외.
- ❌ **교차채널 노이즈 통과 금지 — 그리고 이 필터는 아직 코드에 없다**: `food-graph.json`에 이미 `소고기+포도·두부+포도·닭고기+바나나·바나나+소고기·두부+토마토·닭고기+포도`가 strong tray pair로 오염 출고 중이다(실측·`coachRecos.ts:66`이 소비). 학교 식판은 후식 과일이 매끼 단백질과 함께 올라 lift>1.2라 **lift 게이트로 안 걸러진다**. **신규 식단표/끼니묶음 원천은 (a)내가 `gen-neis-tray-cooccur.py`에 SNACK_CHANNEL(과일·유제품)×끼니 단백질/곡물 same-tray 드롭 필터를 추가하고 (b)기존 오염 6쌍을 0건 회귀 테스트로 고정한 뒤** 합류시킨다. 그 전엔 식판축에 절대 넣지 마라(레시피 한 그릇 원천만 우선).
- ❌ **amount 문자열로 그래프 기대 금지**: `_추가.json`이 `amount:"45.0g"`라 영점 기여다. 정규화에서 순수 숫자 `amount_g`로 변환하거나 존재-기여 모드로 표시.
- ❌ **내 소유 파일 직접 수정 금지**: gen-food-graph.py FILES·food-graph.json·foodGraph.ts·comboMatrix.ts·테스트·GIO_FREQ·freq 스크립트·kit-dish-matrix는 내가 원자적으로. 너는 src_*.json과 ingest 스크립트만.
- ❌ **두 분해기 한쪽만 수정 금지**: `gen-neis-boost.py`와 `gen-neis-tray-cooccur.py`의 decode/LEXICON/REMAP/SPICE는 동치(byte 복붙 아닌 압축 재작성)라 한쪽만 고치면 두 축이 어긋난다(둘 다 내 소유 — 건드리지 말고 LEXICON 보강 후보만 리포트).
- ❌ **freq·kit-matrix 건드리지 말 것**: 별개 파이프라인. dish/freq 반영은 내가 별도 재생성.

---

작업 시작 순서 권장: (1) 무료키 발급(#4 식약처·#5 농정원) → (2) **g 정량 있는 #1 큐넷·#3 한식진흥원부터 정규화**(amount 문자열→숫자·도감 nm 캐논화·dedup, 즉시 그래프 기여) → (3) #2 농진청·#4 식약처·#6 KADX는 존재-기여/권위 가중 모드로 내게 협의(KADX 단독 strong 금지) → (4) 식약처 영양은 src_mfds.json에 보존만(별도 JSON·소비설계 금지) → (5) 비한식 도감 확장 + 드롭률 리포트 → (6) **식단표/끼니묶음 원천은 노이즈 필터 구현 후 마지막**. 각 단계 src_*.json 검증·드롭률 리포트 후 나와 동기화해 원자적 재생성. dish 채널·freq 반영이 필요하면 별도 재생성을 내게 요청.