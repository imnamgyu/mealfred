#!/usr/bin/env python3
"""gen-kit-matrix.py — 골고루 키트 '음식×식재료' 이분 매트릭스.

질문: 키트로 보낸 식재료 X를 '어떤 음식에 더하면 되나?' (김치찌개에 모짜렐라 ❌)
근거: 우리 레시피 코퍼스(음식→재료) — 음식 형태(archetype)별로 그 안에 실제로 들어가는 재료만.
  cell(음식, 식재료) = 그 archetype 레시피 중 해당 식재료가 '메인'으로 든 레시피 수.
  0 = 그 음식엔 안 들어감(추천 금지). 큰 값 = 자연스러운 조합.

출력 → web/lib/kit-dish-matrix.json
재생성: python3 scripts/gen-kit-matrix.py
"""
import json, re
from collections import defaultdict

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
SEASONING = set('마늘 파 대파 쪽파 실파 소금 간장 진간장 설탕 흑설탕 물엿 조청 고춧가루 참깨 깨소금 참기름 들기름 콩기름 식용유 카놀라유 포도씨유 올리브유 후추 후춧가루 식초 맛술 미림 청주 정종 생강 고추장 된장 쌈장 춘장 올리고당 꿀 전분 녹말 감자전분 밀가루 부침가루 튀김가루 빵가루 케첩 마요네즈 굴소스 액젓 멸치액젓 까나리액젓 새우젓 고추 청양고추 홍고추 풋고추 깨 들깨 미원 다시다 식소다 베이킹파우더 이스트 물 육수 버터 마가린 양파'.split())

def norm(raw):
    head = re.split(r'[,_(]', raw)[0].strip().replace(' ', '')
    if head in 도감set:
        return head
    for nm in 도감:
        if nm in head:
            return nm
    return None

# 음식 archetype — 부모가 떠올리는 조리 형태/대표 음식. (label, [이름에 들면 이 형태], emoji). 위→아래 우선(구체→일반).
ARCH = [
    ('볶음밥', ['볶음밥'], '🍚'), ('비빔밥', ['비빔밥'], '🍚'), ('주먹밥', ['주먹밥'], '🍙'),
    ('김밥', ['김밥'], '🍙'), ('덮밥', ['덮밥', '국밥'], '🍚'), ('카레', ['카레'], '🍛'),
    ('죽·미음', ['죽', '미음', '리조또', '오트밀'], '🥣'),
    ('미역국', ['미역국'], '🍲'), ('김치찌개', ['김치찌개'], '🍲'),
    ('된장국·찌개', ['된장국', '된장찌개', '청국장', '강된장'], '🍲'), ('순두부', ['순두부'], '🍲'),
    ('계란찜', ['계란찜', '달걀찜', '알찜'], '🥚'), ('계란말이', ['계란말이', '달걀말이'], '🥚'),
    ('국', ['국'], '🍲'), ('찌개·전골', ['찌개', '전골'], '🍲'), ('탕', ['탕'], '🍲'),
    ('찜', ['찜'], '♨️'), ('조림', ['조림'], '🥘'), ('볶음', ['볶음'], '🍳'),
    ('무침·나물', ['무침', '나물', '생채', '겉절이'], '🥗'), ('전·부침', ['전', '부침', '부각', '적'], '🟤'),
    ('구이', ['구이'], '🔥'), ('잡채', ['잡채'], '🍜'),
    ('국수·면', ['국수', '파스타', '스파게티', '우동', '수제비', '라면', '쌀국수'], '🍜'),
    ('떡', ['떡국', '떡볶이', '떡'], '🍡'), ('만두', ['만두'], '🥟'),
    ('샐러드', ['샐러드'], '🥗'),
    ('빵·토스트', ['토스트', '샌드위치', '베이글', '머핀', '핫케이크', '팬케이크', '파이', '와플'], '🍞'),
    ('그라탕·수프', ['그라탕', '수프', '스프', '도리아', '리조또'], '🧀'),
    ('음료·스무디', ['스무디', '쉐이크', '주스', '라떼', '에이드'], '🥤'),
    ('요거트·간식', ['요거트', '푸딩', '젤리', '요거트볼'], '🍮'), ('쌈', ['쌈'], '🥬'),
]

def clean(name):
    n = (name or '').strip()
    n = re.sub(r'^\([^)]*\)', '', n)       # 선두 (간식)/(고춧가루제외) 등 제거
    n = re.sub(r'\([^)]*\)$', '', n)       # 말미 (경남) 등 제거
    return n.replace(' ', '')

def archetype_of(name):
    n = clean(name)
    for label, keys, em in ARCH:
        for k in keys:
            if k in n:
                return label
    return None

ARCH_META = {label: em for label, _, em in ARCH}
cells = defaultdict(lambda: defaultdict(int))   # arch -> ing -> count
arch_n = defaultdict(int)
ing_total = defaultdict(int)
matched = 0
for r in recipes:
    arch = archetype_of(r.get('name', ''))
    if not arch:
        continue
    ings = r.get('ingredients', [])
    total = sum(i.get('amount_g', 0) or 0 for i in ings) or 1
    mains = set()
    for idx, ing in enumerate(ings):
        nm = norm(ing.get('name', ''))
        if not nm or nm in SEASONING:
            continue
        amt = ing.get('amount_g', 0) or 0
        share = amt / total
        if not (amt >= 8 or share >= 0.15 or (idx <= 1 and amt >= 3)):
            continue
        mains.add(nm)
    if not mains:
        continue
    matched += 1
    arch_n[arch] += 1
    for nm in mains:
        cells[arch][nm] += 1
        ing_total[nm] += 1

dishes = [{'key': label, 'em': ARCH_META[label], 'n': arch_n[label]} for label, _, _ in ARCH if arch_n[label] > 0]
out = {
    'dishes': dishes,
    'cells': {a: dict(sorted(c.items(), key=lambda x: -x[1])) for a, c in cells.items()},
    'ingredients': sorted(ing_total.keys()),
    'meta': {'recipes_used': matched, 'recipes_total': len(recipes), 'dish_count': len(dishes)},
}
json.dump(out, open(f'{WEB}/lib/kit-dish-matrix.json', 'w'), ensure_ascii=False, separators=(',', ':'))

# 리포트
print(f'레시피 {len(recipes)} 중 형태매칭+메인있음 {matched}')
print(f'음식 archetype {len(dishes)}개 · 등장 식재료 {len(ing_total)}종')
print('\n[검수] 음식별 대표 재료(top):')
for a in ['볶음밥', '미역국', '김치찌개', '계란찜', '무침·나물', '조림', '죽·미음', '그라탕·수프', '카레']:
    top = sorted(cells[a].items(), key=lambda x: -x[1])[:8]
    print(f'  {a}({arch_n[a]}): ' + ' · '.join(f'{n}({c})' for n, c in top))
print('\n[검수] 치즈가 들어가는 음식(있으면):', ' · '.join(f'{a}({cells[a]["치즈"]})' for a in cells if cells[a].get('치즈')))
print('[검수] 김치찌개에 치즈?', cells['김치찌개'].get('치즈', 0), '(0이어야 정상)')
print('[검수] 톳이 들어가는 음식:', ' · '.join(f'{a}({cells[a]["톳"]})' for a in cells if cells[a].get('톳')) or '없음')
print('[검수] 브로콜리가 들어가는 음식:', ' · '.join(f'{a}({cells[a]["브로콜리"]})' for a in cells if cells[a].get('브로콜리')) or '없음')
