#!/usr/bin/env python3
"""build-ingredient-freq.py — 식재료별 '급식 등장 빈도' + 상위 백분위(topPct) 산출 (WBS EPIC I · I-01).

엔진이 쓰는 freqMap(public/ingredient-recipes.json)은 '식재료→레시피명'(dish 단위)이라
'식재료 자체가 급식에 몇 번 나오나'(빈도 가중 랭킹의 ②급식빈도)를 직접 못 준다.
이 스크립트는 식재료 1개 단위의 등장 빈도와 그 상위 백분위를 산출해
web/lib/ingredient-freq.json(빌드타임 import용) + web/public/ingredient-freq.json(SSG fetch용)으로 출력한다.

집계원 (우선순위):
  ① 1차 = lib 외부 레시피 DB(scripts/build-foods-recipes.py가 쓰는 BASE 경로) 또는
          학습 코퍼스 캐시(learned_menus). 식재료가 등장한 distinct source_months 합산.
  ② 폴백 = public/ingredient-recipes.json의 식재료별 레시피 freq 합산(1차 부재 시 graceful).
  ③ 권위 테이블 = 둘 다 없으면 인계서 실측표(MEASURED) — 항상 결정론 산출 보장.

⚠️ 빌드 산출물은 **결정론**(동일 입력 → byte-identical). idempotent.
사용: python3 scripts/build-ingredient-freq.py [--dry] [--src measured|recipes|recipedb]

설계 메모(인계서 I·점심 사고 교훈):
  - learned_menus(DB ~9,988행)는 이 환경에서 직접 접속 불가하므로, 폴백/권위 경로로 graceful 동작.
  - 산출 식재료명은 **도감 표준명(ingredients-light.json)과 100% 일치** — 도감 교집합만 출력.
  - 0회 식재료(단호박·요거트)는 **미수록**(freq 0을 '상위 100%'로 위장하지 않음 — I-02/I-06 정직성).
"""
import json
import os
import re
import sys
from collections import defaultdict

WEB = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
RECIPES_JSON = os.path.join(WEB, 'public', 'ingredient-recipes.json')
DEX_JSON = os.path.join(WEB, 'public', 'ingredients-light.json')
OUT_PUBLIC = os.path.join(WEB, 'public', 'ingredient-freq.json')
OUT_LIB = os.path.join(WEB, 'lib', 'ingredient-freq.json')
# 1차 소스(레시피 DB) — build-foods-recipes.py와 동일 경로. 없으면 폴백.
RECIPE_DB_BASE = '/Users/ing/Desktop/편식극복키트/01_참고자료/B_레시피DB'
RECIPE_DB_FILES = ['아동기_레시피DB.json', '유아기_월별식단_레시피DB.json']

# 양념 블로클리스트 (build-foods-recipes.py L17 그대로 재사용) — 식재료 빈도에서 제외.
SEASONING = set(
    '마늘 파 대파 쪽파 실파 소금 간장 진간장 설탕 흑설탕 물엿 조청 고춧가루 참깨 깨소금 참기름 들기름 콩기름 '
    '식용유 카놀라유 포도씨유 올리브유 후추 후춧가루 식초 맛술 미림 청주 정종 생강 고추장 된장 쌈장 춘장 '
    '올리고당 꿀 전분 녹말 감자전분 밀가루 부침가루 튀김가루 빵가루 케첩 마요네즈 굴소스 액젓 멸치액젓 까나리액젓 '
    '새우젓 고추 청양고추 홍고추 풋고추 깨 들깨 미원 다시다 식소다 베이킹파우더 이스트 물 육수 버터 마가린'.split()
)

# ③ 권위 테이블 = 인계서 실측표 (learned_menus 1000개 집계 · 전체 분포 대비 상위%).
#    coachMaterials.ts GIO_FREQ와 동일 값(단일 진실원·{freq,pct}). freq 0(단호박·요거트)은 미수록 처리.
#    pct = learned_menus 전체 식재료(~183종) 분포 대비 상위 백분위(스크립트 9개로 재산출 X — 권위표 그대로).
MEASURED = {
    '당근': {'freq': 184, 'pct': 2}, '토마토': {'freq': 42, 'pct': 12},
    '브로콜리': {'freq': 25, 'pct': 18}, '양배추': {'freq': 20, 'pct': 24},
    '치즈': {'freq': 18, 'pct': 27}, '시금치': {'freq': 13, 'pct': 33},
    '근대': {'freq': 11, 'pct': 39}, '단호박': {'freq': 0, 'pct': 100},
    '요거트': {'freq': 0, 'pct': 100},
}


def norm(raw, dex_list, dex_set):
    """도감 표준명으로 통일 (build-foods-recipes.py L21-28 재사용)."""
    head = re.split(r'[,_(]', raw)[0].strip().replace(' ', '')
    if head in dex_set:
        return head
    for nm in dex_list:  # 부분 포함 (잔멸치→멸치)
        if nm in head:
            return nm
    return None


def load_dex():
    data = json.load(open(DEX_JSON, encoding='utf-8'))
    lst = [x['nm'] for x in data['ingredients']]
    return lst, set(lst)


def from_recipe_db(dex_list, dex_set):
    """① 1차 = 레시피 DB. 식재료가 등장한 distinct source_months 합산(밴드 무관 합집합)."""
    files = [os.path.join(RECIPE_DB_BASE, f) for f in RECIPE_DB_FILES]
    if not all(os.path.exists(f) for f in files):
        return None
    recipes = []
    for f in files:
        recipes += json.load(open(f, encoding='utf-8'))
    months = defaultdict(set)  # 식재료 → set(source_month)
    for r in recipes:
        ings = r.get('ingredients', [])
        total = sum(i.get('amount_g', 0) or 0 for i in ings) or 1
        mlist = r.get('source_months', []) or []
        for idx, ing in enumerate(ings):
            nm = norm(ing.get('name', ''), dex_list, dex_set)
            if not nm or nm in SEASONING:
                continue
            amt = ing.get('amount_g', 0) or 0
            share = amt / total
            if not (amt >= 8 or share >= 0.15 or (idx <= 1 and amt >= 3)):
                continue
            for m in mlist:
                months[nm].add(m)
    return {nm: len(ms) for nm, ms in months.items() if ms}


def from_recipes_json(dex_list, dex_set):
    """② 폴백 = public/ingredient-recipes.json의 식재료별 레시피 freq 합산."""
    if not os.path.exists(RECIPES_JSON):
        return None
    raw = json.load(open(RECIPES_JSON, encoding='utf-8'))
    out = {}
    for ing, recs in raw.items():
        nm = ing if ing in dex_set else norm(ing, dex_list, dex_set)
        if not nm or nm in SEASONING:
            continue
        total = sum((r.get('freq', 0) or 0) for r in recs if isinstance(r, dict))
        out[nm] = out.get(nm, 0) + total
    return {k: v for k, v in out.items() if v > 0} or None


def from_measured(dex_set):
    """③ 권위 테이블 = 인계서 실측표(GIO_FREQ 동일). freq>0 · 도감 수록만.
    {freq, pct(전체 분포 상위%)}를 그대로 보존(스크립트 9개로 재산출하지 않음)."""
    return {
        nm: {'freq': v['freq'], 'pct': v['pct']}
        for nm, v in MEASURED.items() if v['freq'] > 0 and nm in dex_set
    }


def with_ranks(freq_by_ing):
    """freq 내림차순 정렬 → rank(동률 같은 rank) → topPct.
    값이 {freq,pct}면 pct를 topPct로 보존(권위표·전체 분포 상위%), int면 rank/total로 산출."""
    def freq_of(v):
        return v['freq'] if isinstance(v, dict) else v
    items = sorted(freq_by_ing.items(), key=lambda kv: (-freq_of(kv[1]), kv[0]))
    total = len(items)
    out = {}
    rank = 0
    prev = None
    for i, (nm, v) in enumerate(items, start=1):
        freq = freq_of(v)
        if freq != prev:  # 동률은 같은 rank(첫 등장 인덱스)
            rank = i
            prev = freq
        if isinstance(v, dict) and 'pct' in v:
            top_pct = v['pct']  # 권위표 — 전체 분포 상위%(9개로 재산출 X)
        else:
            top_pct = max(1, round(rank / total * 100))  # 0% 방지(최소 상위 1%)
        out[nm] = {'freq': freq, 'rank': rank, 'topPct': top_pct}
    return out


def main():
    dry = '--dry' in sys.argv
    src_pref = None
    if '--src' in sys.argv:
        src_pref = sys.argv[sys.argv.index('--src') + 1]

    dex_list, dex_set = load_dex()

    sources = {
        'recipedb': lambda: from_recipe_db(dex_list, dex_set),
        'recipes': lambda: from_recipes_json(dex_list, dex_set),
        'measured': lambda: from_measured(dex_set),
    }
    # 기본 = measured(권위표·GIO_FREQ 단일 진실원·전체 분포 상위% 보존 — 커밋 산출물·테스트 기준).
    #   --src recipedb|recipes = 전체 코퍼스에서 식재료별 빈도 직접 재산출(상위%는 rank/total).
    order = ['measured'] if not src_pref else [src_pref]

    freq_by_ing = None
    used = None
    for key in order:
        freq_by_ing = sources[key]()
        if freq_by_ing:
            used = key
            break
    if not freq_by_ing:  # 어떤 소스도 비면 권위 테이블 강제(결정론 보장)
        freq_by_ing = from_measured(dex_set)
        used = 'measured'

    def freq_of(v):
        return v['freq'] if isinstance(v, dict) else v
    # 도감 교집합만(SEASONING 잔류·오타 0건) + freq>0(0회는 미수록 — 정직성)
    freq_by_ing = {nm: v for nm, v in freq_by_ing.items() if nm in dex_set and freq_of(v) > 0}
    out = with_ranks(freq_by_ing)

    blob = json.dumps(out, ensure_ascii=False, separators=(',', ':'), sort_keys=True)

    # ── 검증 콘솔(인계서 실측표 방향 확인) ────────────────────────────────
    def show(nm):
        v = out.get(nm)
        return f"{nm}=미수록(0회)" if not v else f"{nm} freq={v['freq']} rank={v['rank']} 상위{v['topPct']}%"
    print(f"[build-ingredient-freq] 소스={used} · 식재료 {len(out)}개 / 도감 {len(dex_set)}")
    for nm in ['당근', '근대', '단호박', '치즈', '요거트', '시금치', '토마토']:
        print('  ', show(nm))
    if used == 'measured':
        print("  ↳ 권위표(인계서 실측 learned_menus 1000개·전체 분포 상위%) — coachMaterials GIO_FREQ와 동일.")
        print("  TBD: 전체 코퍼스 재산출은 learned_menus DB가 필요. DB/레시피 DB가 있으면 "
              "`--src recipedb`(레시피 월별 빈도) 또는 `--src recipes`(ingredient-recipes 합산)로 재생성.")

    if dry:
        print("[--dry] 파일 미기록. 산출 미리보기:", blob[:200], '...' if len(blob) > 200 else '')
        return

    for path in (OUT_PUBLIC, OUT_LIB):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(blob)
    print(f"  → {os.path.relpath(OUT_PUBLIC, WEB)} · {os.path.relpath(OUT_LIB, WEB)} 기록 완료")


if __name__ == '__main__':
    main()
