#!/usr/bin/env python3
"""gen-corpus-boost.py — NEIS 전수(2회+) + 식약처 레시피(전재료)로 코퍼스 통합 부스트.
출력:
  /tmp/corpus_learned.json  — learned_menus 씨드 [{menu,ingredients,processed,source}]
  /tmp/corpus_pairs.json    — 식재료↔식재료 동시출현 {a|b: count} (식약처=전재료 강신호 + NEIS 디코드 약신호)
  /tmp/corpus_kit.json      — 키트 음식×식재료 evidence {archetype: {ing: count}}
"""
import json, re, os
from collections import defaultdict, Counter
from itertools import combinations

WEB = '/Users/ing/Desktop/dev/web/landing_page/deploy/web'
도감rows = json.load(open(f'{WEB}/public/ingredients-light.json'))['ingredients']
도감 = [x['nm'] for x in 도감rows]; 도감set = set(도감)
SPICE = {x['nm'] for x in 도감rows if x.get('grade') == '향신료'} | set('마늘 파 대파 쪽파 생강 고추 고춧가루 마늘종 참깨 들깨'.split())
SEASONING = set('마늘 파 대파 쪽파 실파 소금 간장 진간장 설탕 흑설탕 물엿 조청 고춧가루 참깨 깨소금 참기름 들기름 콩기름 식용유 카놀라유 포도씨유 올리브유 후추 후춧가루 식초 맛술 미림 청주 정종 생강 고추장 된장 쌈장 춘장 올리고당 꿀 전분 녹말 감자전분 밀가루 부침가루 튀김가루 빵가루 케첩 마요네즈 굴소스 액젓 멸치액젓 까나리액젓 새우젓 깨 들깨 미원 다시다 식소다 베이킹파우더 이스트 물 육수 버터 마가린 양파 생크림 카레 후레이크'.split())
PROC = set('소시지 햄 베이컨 어묵 게맛살 맛살 만두 시리얼'.split())

REMAP = {'쌀': '멥쌀', '콩': '콩(대두)', '떡': '멥쌀떡', '요거트': '요구르트', '느타리': '느타리버섯'}
def to_dogam(std):
    std = REMAP.get(std, std)
    return std if std in 도감set else None
LEXICON = {
    '쇠고기':'소고기','한우':'소고기','우육':'소고기','불고기':'소고기','너비아니':'소고기','떡갈비':'소고기','장조림':'소고기',
    '돈육':'돼지고기','저육':'돼지고기','제육':'돼지고기','삼겹살':'돼지고기','목살':'돼지고기','돼지갈비':'돼지고기','돈갈비':'돼지고기',
    '닭안심':'닭고기','닭가슴살':'닭고기','닭다리':'닭고기','닭살':'닭고기','치킨':'닭고기','찜닭':'닭고기','안동찜닭':'닭고기',
    '달걀':'계란','멥쌀':'쌀','백미':'쌀','쌀밥':'쌀','현미밥':'현미','흑미밥':'현미','잡곡밥':'보리','혼합잡곡밥':'보리',
    '순두부':'두부','연두부':'두부','유부':'두부','잔멸치':'멸치','국물멸치':'멸치','볶음멸치':'멸치','북어':'명태','북어채':'명태','동태':'명태','황태':'명태','코다리':'명태',
    '오리':'오리고기','대하':'새우','왕새우':'새우','새우살':'새우','조갯살':'조개','바지락살':'바지락','홍합살':'홍합',
    '모짜렐라':'치즈','체다치즈':'치즈','슬라이스치즈':'치즈','아기치즈':'치즈','조미김':'김','김자반':'김','구이김':'김','방울토마토':'토마토',
    '알배추':'배추','얼갈이':'배추','숙주':'숙주나물','양송이':'양송이버섯','포항초':'시금치','우리밀':'밀','애느타리':'느타리버섯',
}
SCAN = {}
for surf, std in LEXICON.items():
    d = to_dogam(std)
    if d and len(surf) >= 2: SCAN[surf] = d
for nm in 도감:
    if len(nm) >= 2: SCAN[nm] = nm
SURF = sorted(SCAN.keys(), key=lambda s: -len(s))

def scan_decode(name):
    m = re.sub(r'\s', '', name); found = []; spans = []
    for surf in SURF:
        i = m.find(surf)
        if i < 0 or SCAN[surf] in SPICE: continue
        if any(a <= i < b for a, b in spans): continue
        spans.append((i, i+len(surf)))
        if SCAN[surf] not in found: found.append(SCAN[surf])
    if '닭' in m and '닭고기' not in found: found.append('닭고기')
    if re.search(r'밥|죽|미음', m) and not (set(found) & {'멥쌀','현미','보리'}): found.append('멥쌀')
    return found

def norm_token(raw):
    head = re.split(r'[,_(/]', str(raw))[0].strip().replace(' ', '')
    head = re.sub(r'^[●·*\-]+', '', head)
    if not head or head in SEASONING: return None
    if head in LEXICON: head2 = to_dogam(LEXICON[head]);  return head2 if head2 else None
    if head in 도감set: return head
    for nm in 도감:
        if len(nm) >= 2 and nm in head: return nm
    return None

# 식약처 parts → 식재료 리스트
def parse_mfds_parts(parts):
    txt = re.sub(r'●[^:：]*[:：]', ',', parts or '')   # ●양념: 같은 섹션 헤더 제거
    toks = re.split(r'[,\n]', txt)
    ings = set()
    for t in toks:
        t = t.strip()
        if not t: continue
        nm = norm_token(t)
        if nm and nm not in SEASONING and nm not in SPICE: ings.add(nm)
    return ings

ARCH = [('볶음밥',['볶음밥']),('비빔밥',['비빔밥']),('주먹밥',['주먹밥']),('김밥',['김밥']),('덮밥',['덮밥','국밥','하이라이스','오므라이스']),('카레',['카레']),('죽·미음',['죽','미음','리조또']),('미역국',['미역국']),('김치찌개',['김치찌개']),('된장국·찌개',['된장국','된장찌개','청국장']),('순두부',['순두부']),('계란찜',['계란찜','달걀찜','알찜']),('계란말이',['계란말이','달걀말이']),('국',['국']),('찌개·전골',['찌개','전골']),('탕',['탕']),('찜',['찜']),('조림',['조림']),('볶음',['볶음']),('무침·나물',['무침','나물','생채','겉절이']),('전·부침',['전','부침','적']),('구이',['구이']),('잡채',['잡채']),('국수·면',['국수','파스타','스파게티','우동','수제비','쌀국수']),('떡',['떡국','떡볶이','떡']),('만두',['만두']),('샐러드',['샐러드']),('빵·토스트',['토스트','샌드위치','머핀','핫케이크','와플']),('그라탕·수프',['그라탕','수프','스프','도리아'])]
def archetype(name):
    n = re.sub(r'\s','',name)
    for label, keys in ARCH:
        if any(k in n for k in keys): return label
    return None

learned = {}; pairs = Counter(); kit = defaultdict(Counter)

def add_menu(name, ings, count, source, strong):
    if not ings: return
    key = re.sub(r'\s','',name)
    e = learned.get(key)
    if e: e['ingredients'] = sorted(set(e['ingredients']) | set(ings))
    else: learned[key] = {'menu':key,'ingredients':sorted(ings),'processed':any(i in PROC for i in ings),'source':source}
    a = archetype(name)
    if a:
        for i in ings: kit[a][i] += count
    # 동시출현(궁합): 식약처=전재료 강신호(가중3), NEIS=약신호(1)
    w = 3 if strong else 1
    for x, y in combinations(sorted(ings), 2):
        if x in SPICE or y in SPICE: continue
        pairs[(x, y)] += w * (1 if not strong else 1)

# 1) 식약처 레시피(전재료) — 강신호
mfds = json.load(open('/tmp/mfds-recipes.json'))
for r in mfds:
    ings = parse_mfds_parts(r.get('parts',''))
    add_menu(r.get('name',''), ings, 2, 'mfds_seed', True)
_avg = round(sum(len(parse_mfds_parts(r.get('parts',''))) for r in mfds[:200]) / 200, 1)
print(f'식약처 {len(mfds)} 처리 · 평균재료 {_avg}')

# 2) NEIS 전수(2회+) — 메뉴명 스캔(약신호)
neis = json.load(open('/tmp/neis-full.json'))
neis2 = {m:c for m,c in neis.items() if c>=2}
for name, c in neis2.items():
    add_menu(name, scan_decode(name), c, 'neis_seed', False)

learned_list = list(learned.values())
json.dump(learned_list, open('/tmp/corpus_learned.json','w'), ensure_ascii=False)
json.dump({f'{a}|{b}':v for (a,b),v in pairs.items()}, open('/tmp/corpus_pairs.json','w'), ensure_ascii=False)
json.dump({a:dict(c) for a,c in kit.items()}, open('/tmp/corpus_kit.json','w'), ensure_ascii=False)

print(f'NEIS 2회+ {len(neis2)} 처리')
print(f'→ learned 고유 {len(learned_list)} · 동시출현 쌍 {len(pairs)} · 키트 archetype {len(kit)}')
print('learned 샘플:', ' / '.join(f"{s['menu']}→{'·'.join(s['ingredients'][:3])}" for s in learned_list[:6]))
print('상위 궁합쌍:', ' · '.join(f'{a}-{b}({v})' for (a,b),v in pairs.most_common(10)))
