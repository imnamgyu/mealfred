#!/usr/bin/env python3
"""gen-cooking-amounts.py — 식재료별 × 조리방식별 '1회분 그램'(중앙값).

문제: 도감 '어떻게 줄까'가 카테고리 평균이라 같은 잎채소면 상추·시금치·배추가 전부 같은 g(상추 50g 과다).
해법: 우리 레시피 코퍼스(amount_g)에서 식재료마다, 조리방식마다 실제 사용량 중앙값을 뽑는다.
  → 당근 9g·멸치 8g·김 5g처럼 식재료별로 현실적. 트레이스(양념성 <3g)는 제외, 표본 3개 미만은 카테고리 폴백(앱에서).
출력 → web/lib/cooking-amounts.json  { 식재료: { 조리방식: {g, n} } }
재생성: python3 scripts/gen-cooking-amounts.py
"""
import json, re
from collections import defaultdict
from statistics import median

BASE = '/Users/ing/Desktop/편식극복키트/01_참고자료/B_레시피DB'
WEB = '/Users/ing/Desktop/dev/web/landing_page/deploy/web'
FILES = ['아동기_레시피DB.json', '유아기_월별식단_레시피DB.json', '유아기_레시피DB.json',
         '유아기_레시피DB_추가.json', '영아기_레시피DB.json', '영아기_레시피DB_추가.json']

recipes = []
for f in FILES:
    try:
        d = json.load(open(f'{BASE}/{f}'))
        arr = d if isinstance(d, list) else (d.get('recipes') or next((v for v in d.values() if isinstance(v, list)), []))
        recipes += [r for r in arr if isinstance(r, dict)]
    except Exception as e:
        print('skip', f, e)

도감 = [x['nm'] for x in json.load(open(f'{WEB}/public/ingredients-light.json'))['ingredients']]
도감set = set(도감)

def norm(raw):
    head = re.split(r'[,_(]', raw)[0].strip().replace(' ', '')
    if head in 도감set:
        return head
    for nm in 도감:
        if nm in head:
            return nm
    return None

# 레시피명 → cookingMatrix의 8개 조리방식(없으면 None). 구체→일반 순.
METHODS = [
    ('무침·나물', ['무침', '나물', '생채', '겉절이', '샐러드']),
    ('죽', ['죽', '미음', '리조또']),
    ('국·탕', ['국', '탕', '찌개', '전골']),
    ('전·부침', ['전', '부침', '적']),
    ('조림', ['조림']),
    ('볶음', ['볶음']),
    ('구이', ['구이']),
    ('찜', ['찜']),
]

def method_of(name):
    n = re.sub(r'^\([^)]*\)', '', name or '').replace(' ', '')
    for label, keys in METHODS:
        if any(k in n for k in keys):
            return label
    return None

# (식재료, 조리방식) → [amount_g …] (트레이스 <3g 제외 = 양념성 garnish 빼고 '의미있는 분량')
buckets = defaultdict(list)
for r in recipes:
    method = method_of(r.get('name', ''))
    if not method:
        continue
    for ing in r.get('ingredients', []):
        nm = norm(ing.get('name', ''))
        if not nm:
            continue
        amt = ing.get('amount_g', 0) or 0
        if amt < 3:
            continue
        buckets[(nm, method)].append(amt)

out = defaultdict(dict)
for (nm, method), arr in buckets.items():
    if len(arr) < 3:
        continue
    out[nm][method] = {'g': round(median(arr), 1), 'n': len(arr)}

json.dump(out, open(f'{WEB}/lib/cooking-amounts.json', 'w'), ensure_ascii=False, separators=(',', ':'))

# 리포트
print(f'레시피 {len(recipes)} · 식재료별 용량 보유 {len(out)}종 / 도감 {len(도감)}')
print('\n[검수] 잎채소가 식재료별로 달라지나(전엔 다 같았음):')
for nm in ['상추', '시금치', '배추', '양배추', '쑥갓', '미나리', '청경채', '근대']:
    if nm in out:
        print(f'  {nm}:', ' · '.join(f'{m}{v["g"]}g(n{v["n"]})' for m, v in sorted(out[nm].items(), key=lambda x: -x[1]['g'])))
    else:
        print(f'  {nm}: (표본부족 → 카테고리 폴백)')
print('\n[검수] 양념성/소량 식재료:')
for nm in ['당근', '멸치', '김', '마늘', '대파']:
    if nm in out:
        print(f'  {nm}:', ' · '.join(f'{m}{v["g"]}g' for m, v in sorted(out[nm].items(), key=lambda x: -x[1]['g'])))
