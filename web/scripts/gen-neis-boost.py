#!/usr/bin/env python3
"""gen-neis-boost.py — NEIS 급식 메뉴(/tmp/neis-menus.json)를 도감 식재료로 분해해
   ① learned_menus 씨드(/tmp/neis_learned.json) ② 키트 매트릭스 evidence(/tmp/neis_kit.json) 생성.

분해 = 메뉴명 substring 스캔(도감 166명 + 핵심 렉시콘 surface→도감 표준명). 양념/향신료 제외, 최장일치 dedup.
앱 TS 매퍼(menuMapCore)의 offline 실행이 node ESM 마찰로 막혀, 결정론 스캔만 자체 구현(고신뢰 부분집합).
무매핑/단일과일은 자연 제외 → 환각 없음.
"""
import json, re, os, urllib.request
from collections import defaultdict, Counter
from statistics import median

WEB = '/Users/ing/Desktop/dev/web/landing_page/deploy/web'
도감rows = json.load(open(f'{WEB}/public/ingredients-light.json'))['ingredients']
도감 = [x['nm'] for x in 도감rows]
도감set = set(도감)
SPICE = {x['nm'] for x in 도감rows if x.get('grade') == '향신료'} | set('마늘 파 대파 쪽파 생강 고추 고춧가루 마늘종 참깨 들깨'.split())

# 대표어가 도감명이 아니면 도감명으로 보정
REMAP = {'쌀': '멥쌀', '콩': '콩(대두)', '떡': '멥쌀떡', '요거트': '요구르트', '느타리': '느타리버섯'}
def to_dogam(std):
    std = REMAP.get(std, std)
    return std if std in 도감set else None

# 핵심 렉시콘 (surface → 표준, lib/lexicon.ts 발췌). 학교급식에 흔한 표기만.
LEXICON = {
    '소세지': '소시지', '쏘세지': '소시지', '달걀': '계란', '쇠고기': '소고기', '한우': '소고기', '우육': '소고기',
    '돈육': '돼지고기', '저육': '돼지고기', '삼겹살': '돼지고기', '목살': '돼지고기', '돼지목살': '돼지고기',
    '뒷다리살': '돼지고기', '앞다리살': '돼지고기', '돼지갈비': '돼지고기', '돈갈비': '돼지고기', '제육': '돼지고기', '돈사태': '돼지고기',
    '닭안심': '닭고기', '닭가슴살': '닭고기', '닭다리': '닭고기', '닭다리살': '닭고기', '닭정육': '닭고기', '닭봉': '닭고기',
    '닭살': '닭고기', '닭튀김': '닭고기', '순살치킨': '닭고기', '안동찜닭': '닭고기', '찜닭': '닭고기', '치킨': '닭고기',
    '너비아니': '소고기', '불고기': '소고기', '떡갈비': '소고기', '장조림': '소고기',
    '멥쌀': '쌀', '백미': '쌀', '쌀밥': '쌀', '진밥': '쌀', '현미밥': '현미', '흑미밥': '현미', '잡곡밥': '보리', '혼합잡곡밥': '보리',
    '기장밥': '기장', '차조밥': '조', '차수수밥': '수수', '보리밥': '보리', '찰보리밥': '보리',
    '순두부': '두부', '연두부': '두부', '잔멸치': '멸치', '지리멸': '멸치', '국물멸치': '멸치', '볶음멸치': '멸치',
    '동태': '명태', '북어': '명태', '황태': '명태', '코다리': '명태', '생태': '명태', '명태살': '명태',
    '오리': '오리고기', '바지락살': '바지락', '조갯살': '조개', '홍합살': '홍합', '대하': '새우', '왕새우': '새우', '흰다리새우': '새우',
    '아기치즈': '치즈', '슬라이스치즈': '치즈', '체다치즈': '치즈', '모짜렐라': '치즈', '모짜렐라치즈': '치즈',
    '생우유': '우유', '멸균우유': '우유', '조미김': '김', '김자반': '김', '돌김': '김', '파래김': '김',
    '방울토마토': '토마토', '대추토마토': '토마토', '알배추': '배추', '얼갈이': '배추', '쇠고기미역국': '미역',
    '시금치': '시금치', '쇠고기무국': '무', '유부': '두부', '우엉조림': '우엉', '연근조림': '연근',
}

# 스캔 surface→도감명: 렉시콘 먼저, 도감명 self-map 나중(도감명이 우선·단호박 보호)
SCAN = {}
for surf, std in LEXICON.items():
    d = to_dogam(std)
    if d and len(surf) >= 2:
        SCAN[surf] = d
for nm in 도감:
    if len(nm) >= 2:
        SCAN[nm] = nm   # 도감명 self-map이 렉시콘을 덮어씀(단호박→단호박 보호)
SURF = sorted(SCAN.keys(), key=lambda s: -len(s))   # 최장일치 우선

def decode(name):
    m = re.sub(r'\s', '', name)
    found = []
    used_spans = []
    for surf in SURF:
        idx = m.find(surf)
        if idx < 0:
            continue
        std = SCAN[surf]
        if std in SPICE:
            continue
        # 더 긴 surface에 이미 먹힌 구간이면 스킵(최장일치)
        if any(a <= idx < b for a, b in used_spans):
            continue
        used_spans.append((idx, idx + len(surf)))
        if std not in found:
            found.append(std)
    if '닭' in m and '닭고기' not in found and not any(s in m for s in ('닭갈비양념',)):
        found.append('닭고기')
    if re.search(r'밥|죽|미음', m) and '멥쌀' not in found and '현미' not in found and '보리' not in found:
        found.append('멥쌀')
    return found

# 음식 archetype (gen-kit-matrix.py와 동일 셋)
ARCH = [
    ('볶음밥', ['볶음밥']), ('비빔밥', ['비빔밥']), ('주먹밥', ['주먹밥']), ('김밥', ['김밥']),
    ('덮밥', ['덮밥', '국밥', '하이라이스', '오므라이스']), ('카레', ['카레']), ('죽·미음', ['죽', '미음', '리조또']),
    ('미역국', ['미역국']), ('김치찌개', ['김치찌개']), ('된장국·찌개', ['된장국', '된장찌개', '청국장']), ('순두부', ['순두부']),
    ('계란찜', ['계란찜', '달걀찜', '알찜']), ('계란말이', ['계란말이', '달걀말이']),
    ('국', ['국']), ('찌개·전골', ['찌개', '전골']), ('탕', ['탕']), ('찜', ['찜']), ('조림', ['조림']), ('볶음', ['볶음']),
    ('무침·나물', ['무침', '나물', '생채', '겉절이']), ('전·부침', ['전', '부침', '적']), ('구이', ['구이']), ('잡채', ['잡채']),
    ('국수·면', ['국수', '파스타', '스파게티', '우동', '수제비', '쌀국수', '비빔면']), ('떡', ['떡국', '떡볶이', '떡']), ('만두', ['만두']),
    ('샐러드', ['샐러드']), ('빵·토스트', ['토스트', '샌드위치', '머핀', '핫케이크', '와플']), ('그라탕·수프', ['그라탕', '수프', '스프', '도리아']),
]
def archetype(name):
    n = re.sub(r'\s', '', name)
    for label, keys in ARCH:
        if any(k in n for k in keys):
            return label
    return None

neis = json.load(open('/tmp/neis-menus.json'))
learned = []          # {menu, ingredients, processed, source}
kit_ev = defaultdict(Counter)   # archetype -> ingredient -> count
PROC = set('소시지 햄 베이컨 어묵 게맛살 맛살 만두 시리얼'.split())
mapped = 0
for name, cnt in neis.items():
    ings = decode(name)
    if not ings:
        continue
    mapped += 1
    learned.append({'menu': re.sub(r'\s', '', name), 'ingredients': sorted(ings),
                    'processed': any(i in PROC for i in ings), 'source': 'neis_seed'})
    a = archetype(name)
    if a:
        for i in ings:
            kit_ev[a][i] += cnt

# learned 중복키 합집합
byk = {}
for s in learned:
    e = byk.get(s['menu'])
    if e:
        e['ingredients'] = sorted(set(e['ingredients']) | set(s['ingredients']))
        e['processed'] = e['processed'] or s['processed']
    else:
        byk[s['menu']] = s
learned = list(byk.values())

json.dump(learned, open('/tmp/neis_learned.json', 'w'), ensure_ascii=False)
json.dump({a: dict(c) for a, c in kit_ev.items()}, open('/tmp/neis_kit.json', 'w'), ensure_ascii=False)

print(f'NEIS 메뉴 {len(neis)} → 분해성공 {mapped} · learned 고유 {len(learned)} · 키트 archetype {len(kit_ev)}')
print('learned 샘플 14:')
for s in learned[:14]:
    print(f"  {s['menu']} → {'·'.join(s['ingredients'])}")
print('\n키트 evidence 샘플:')
for a in ['무침·나물', '국', '볶음', '조림', '찜']:
    if a in kit_ev:
        print(f"  {a}:", ' · '.join(f'{i}({c})' for i, c in kit_ev[a].most_common(8)))
