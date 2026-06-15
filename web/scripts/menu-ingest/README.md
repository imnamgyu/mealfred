# 영유아 식단 적재 → 도감 재정의 파이프라인 (menu-ingest)

전국 어린이급식관리지원센터 등에서 모은 **영유아 식단 파일**을 받아, 식재료로 분해·정제하고
**영유아 등장 빈도**를 집계해 **도감 등급을 2축(영유아 실측 × 초등 NEIS)으로 재정의**하는 작업.

> 호출법: 식단 파일을 한 폴더에 모은 뒤 → 허브 런북(`/menu-ingest-pipeline.html`) 링크 주면서
> "이 파이프라인 돌려줘" → 아래 3단계 실행.

## 입력 형식 우선순위
| 형식 | 처리 | 권장 |
|---|---|---|
| `.xlsx` (발주량산출서·식단표) / `.csv` | 헤더 자동감지 파싱 | ⭐ 최고 |
| `.zip` (xlsx 묶음) | 내부 xlsx 전부 파싱 | ⭐ |
| `.hwp` | ❌ 직접 불가 → 엑셀로 변환 후 투입 | △ |
| PDF(이미지)·식단표 사진 | ❌ → OCR 별도(Sonnet Vision) 후 csv화 | ▽ |

## 3단계
```bash
# 1) 파싱 + 정제 + 빈도집계 + 2축 도감 재정의안 산출
python parse_and_aggregate.py --in ~/Desktop/menus --out /tmp/menu_out
#    → dogam_redefine.csv (사람 검토용) · promo_candidates.json (승격후보)

# 2) 승격후보 안전스크린 — 멀티에이전트 워크플로
#    Workflow: dogam-promotion-safety-screen (promo_candidates.json 투입)
#    각 후보: 분류(원물/가공/음료/양념/국물) + 영유아 2~6세 안전(질식·한방·나트륨) + 적대검증
#    → screen_result.json (result.promoted = 승격확정)

# 3) SQL 반영 (롤백 스냅샷 자동 저장)
python apply_dogam_redefine.py --redefine /tmp/menu_out/dogam_redefine.csv \
       --promoted screen_result.json          # --dry 로 미리보기
```

## 2축 등급 기준
- **영유아축**(본 수집): 등장률 = 그 식재료가 등장한 파일 비율 → 매일군 ≥70% / 자주 ≥35% / 가끔 ≥10% / 드묾
- **초등축**: SQL `ingredients.elem_count`(NEIS) → 초등매일 ≥300 / 자주 ≥100 / 가끔 ≥10 / 드묾
- **결합등급** = 둘 중 높은 쪽. **연령플래그** = 공통 / 영유아특이 / 초등특이
- 등재 자격 = **단일 원물 식재료** + 영유아 안전 통과(빈출도는 후보선정 기준일 뿐)

## 교훈 / 주의 (하드코딩된 함정)
- **컬럼 어긋남**: 센터마다 XLSX 레이아웃 달라 식재료칸에 숫자/날짜/음식명 샘 → `detect_cols`가 헤더('음식명'/'식재료명')로 컬럼 자동정렬해 해결. 그래도 못 찾으면 표준위치(날짜|구분|음식|식재료) 가정.
- **bare-xlsx vs zip**: 발주량산출서는 bare xlsx인데 PK매직이라 zip로 오인 가능 → `xl/workbook.xml` 유무로 분기.
- **PostgREST 벌크 upsert 금지**: 부분 키 merge-duplicates는 NOT NULL 위반(23502) → 기존행은 **PATCH per row**.
- **롤백**: apply가 `ingredients_snapshot_<날짜>.json` 저장. 복원 = 그 grade_label/grade_star로 PATCH.
- **하향검토는 자동 안 함**: 영유아·초등 둘 다 낮은데 필수/권장인 식재료는 meta 플래그만, 사람 검토.

## 현재 상태 (2026-06-15)
- dietary4u 6센터(강서·중랑·울산동구·동작·강동·노원) 383,607행 = 메뉴 6,121 · 식재료 ~2,000
- 도감 157 2축 재등급 + 승격 12(새송이·치커리·유채·감귤 등) 반영, `ingredients` 393→395
- 미완: 푸드체이닝 적재(learned_menus·ingredient_edges) — 노이즈 정제 후. 하향검토 10 사람 검토.
