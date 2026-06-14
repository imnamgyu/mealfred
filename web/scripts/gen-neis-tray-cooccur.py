#!/usr/bin/env python3
"""gen-neis-tray-cooccur.py — NEIS 식판(/tmp/neis-trays.json)을 식재료 '식판 단위 공통출현'으로 환산.

식판 = 한 끼(날짜+학교) 메뉴 리스트. 각 식판의 메뉴를 도감 식재료로 분해→식판별 식재료 집합→
같은 식판에 함께 오른 식재료 쌍의 lift 계산. 레시피 동시출현(한 음식 안)과 다른 '같은 끼니에 차려짐' 신호.
  lift(a,b) = 공동식판수 · 총식판수 / (a식판수 · b식판수)   (1=우연, >1=실제 함께 차려짐)
출력: /tmp/neis-tray-pairs.json = {meta, pairs:{"a|b":{c,na,nb,lift,grade}}}  (a<b 정렬)
분해기는 gen-neis-boost.py와 동일(도감 substring 스캔·향신료 제외·최장일치). 환각 0.
"""
import json, re, os
from collections import Counter, defaultdict
from itertools import combinations

WEB = '/Users/ing/Desktop/dev/web/landing_page/deploy/web'
TRAYS = '/tmp/neis-trays.json'
OUT = '/tmp/neis-tray-pairs.json'

도감rows = json.load(open(f'{WEB}/public/ingredients-light.json'))['ingredients']
도감 = [x['nm'] for x in 도감rows]
도감set = set(도감)
SPICE = {x['nm'] for x in 도감rows if x.get('grade') == '향신료'} | set('마늘 파 대파 쪽파 생강 고추 고춧가루 마늘종 참깨 들깨'.split())
REMAP = {'쌀': '멥쌀', '콩': '콩(대두)', '떡': '멥쌀떡', '요거트': '요구르트', '느타리': '느타리버섯'}
def to_dogam(std):
    std = REMAP.get(std, std)
    return std if std in 도감set else None

# 핵심 렉시콘(gen-neis-boost.py 발췌·동일)
LEXICON = {
    '소세지':'소시지','쏘세지':'소시지','달걀':'계란','쇠고기':'소고기','한우':'소고기','우육':'소고기',
    '돈육':'돼지고기','저육':'돼지고기','삼겹살':'돼지고기','목살':'돼지고기','돼지목살':'돼지고기',
    '뒷다리살':'돼지고기','앞다리살':'돼지고기','돼지갈비':'돼지고기','돈갈비':'돼지고기','제육':'돼지고기','돈사태':'돼지고기',
    '닭안심':'닭고기','닭가슴살':'닭고기','닭다리':'닭고기','닭다리살':'닭고기','닭정육':'닭고기','닭봉':'닭고기',
    '닭살':'닭고기','닭튀김':'닭고기','순살치킨':'닭고기','안동찜닭':'닭고기','찜닭':'닭고기','치킨':'닭고기',
    '너비아니':'소고기','불고기':'소고기','떡갈비':'소고기','장조림':'소고기',
    '멥쌀':'쌀','백미':'쌀','쌀밥':'쌀','진밥':'쌀','현미밥':'현미','흑미밥':'현미','잡곡밥':'보리','혼합잡곡밥':'보리',
    '기장밥':'기장','차조밥':'조','차수수밥':'수수','보리밥':'보리','찰보리밥':'보리',
    '순두부':'두부','연두부':'두부','잔멸치':'멸치','지리멸':'멸치','국물멸치':'멸치','볶음멸치':'멸치',
    '동태':'명태','북어':'명태','황태':'명태','코다리':'명태','생태':'명태','명태살':'명태',
    '오리':'오리고기','바지락살':'바지락','조갯살':'조개','홍합살':'홍합','대하':'새우','왕새우':'새우','흰다리새우':'새우',
    '아기치즈':'치즈','슬라이스치즈':'치즈','체다치즈':'치즈','모짜렐라':'치즈','모짜렐라치즈':'치즈',
    '생우유':'우유','멸균우유':'우유','조미김':'김','김자반':'김','돌김':'김','파래김':'김',
    '방울토마토':'토마토','대추토마토':'토마토','알배추':'배추','얼갈이':'배추','쇠고기미역국':'미역',
    '쇠고기무국':'무','유부':'두부','우엉조림':'우엉','연근조림':'연근',
}
SCAN = {}
for surf, std in LEXICON.items():
    d = to_dogam(std)
    if d and len(surf) >= 2: SCAN[surf] = d
for nm in 도감:
    if len(nm) >= 2: SCAN[nm] = nm
SURF = sorted(SCAN.keys(), key=lambda s: -len(s))

def decode(name):
    m = re.sub(r'\s', '', name); found = []; used = []
    for surf in SURF:
        idx = m.find(surf)
        if idx < 0: continue
        std = SCAN[surf]
        if std in SPICE: continue
        if any(a <= idx < b for a, b in used): continue
        used.append((idx, idx + len(surf)))
        if std not in found: found.append(std)
    if '닭' in m and '닭고기' not in found and '닭갈비양념' not in m: found.append('닭고기')
    if re.search(r'밥|죽|미음', m) and not any(s in found for s in ('멥쌀','현미','보리')): found.append('멥쌀')
    return found

def tray_ings(dishes):
    """식판 메뉴 리스트 → 식재료 집합(중복 제거)."""
    s = set()
    for d in dishes: s.update(decode(d))
    return s

# ── 메인 ──────────────────────────────────────────────────────────────────────
trays = json.load(open(TRAYS))
freq = Counter(); co = Counter(); N = 0
for dishes in trays:
    ings = tray_ings(dishes)
    if len(ings) < 2: continue
    N += 1
    for ing in ings: freq[ing] += 1
    for a, b in combinations(sorted(ings), 2): co[(a, b)] += 1

MIN_CO = 8                    # 노이즈 컷(공동 8식판 미만 쌍 제외)
LIFT_STRONG, LIFT_MED = 1.2, 1.0
C_STRONG, C_MED = 15, 8       # 등급별 최소 공동출현(저빈도 우연 lift 폭주 차단: 고등어|살구 c6 lift14 제거)
pairs = {}
gc = Counter()
for (a, b), c in co.items():
    if c < MIN_CO: continue
    na, nb = freq[a], freq[b]
    if na == 0 or nb == 0: continue
    lift = round(c * N / (na * nb), 3)
    if lift >= LIFT_STRONG and c >= C_STRONG: grade = 'strong'
    elif lift >= LIFT_MED and c >= C_MED: grade = 'medium'
    else: grade = 'weak'
    pairs[f'{a}|{b}'] = {'c': c, 'na': na, 'nb': nb, 'lift': lift, 'grade': grade}
    gc[grade] += 1

meta = {'trays': N, 'pairs': len(pairs), 'min_co': MIN_CO,
        'grade_strong': gc['strong'], 'grade_medium': gc['medium'], 'grade_weak': gc['weak']}
json.dump({'meta': meta, 'pairs': pairs}, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('meta:', json.dumps(meta, ensure_ascii=False))
# 진단: 떡(멥쌀떡)↔달걀(계란), 흔한 쌍 몇 개
for key in ['멥쌀떡|계란', '계란|멥쌀떡', '감자|당근', '당근|두부', '당근|시금치', '배추|두부']:
    if key in pairs: print(' ', key, pairs[key])
    else:
        a, b = key.split('|'); alt = f'{b}|{a}'
        print(' ', key, pairs.get(alt, f'(없음·co<{MIN_CO} 또는 미출현)'))
