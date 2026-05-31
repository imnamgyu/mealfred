#!/usr/bin/env python3
"""도감 식재료별 '친해지기 레시피' 생성 — 메인 식재료 빈도순 + 유아/초등/중고 등장.
워크플로우 w24p5o304 룰: 양념 블로클리스트 제외 + (amount_g>=8 OR 비중>=15% OR (idx<=1 & >=3g)).
빈도 = distinct source_months(밴드별). 출력 → web/public/ingredient-recipes.json
"""
import json, re
from collections import defaultdict

BASE = '/Users/ing/Desktop/편식극복키트/01_참고자료/B_레시피DB'
WEB = '/Users/ing/Desktop/dev/web/landing_page/deploy/web'

recipes = json.load(open(f'{BASE}/아동기_레시피DB.json')) + json.load(open(f'{BASE}/유아기_월별식단_레시피DB.json'))
도감 = [x['nm'] for x in json.load(open(f'{WEB}/public/ingredients-light.json'))['ingredients']]
도감set = set(도감)

# 양념/조미료 블로클리스트 (메인 아님). 멸치·다시마는 넣지 않고 per-recipe amount로 판정(육수 vs 볶음 분리).
SEASONING = set('마늘 파 대파 쪽파 실파 소금 간장 진간장 설탕 흑설탕 물엿 조청 고춧가루 참깨 깨소금 참기름 들기름 콩기름 식용유 카놀라유 포도씨유 올리브유 후추 후춧가루 식초 맛술 미림 청주 정종 생강 고추장 된장 쌈장 춘장 올리고당 꿀 전분 녹말 감자전분 밀가루 부침가루 튀김가루 빵가루 케첩 마요네즈 굴소스 액젓 멸치액젓 까나리액젓 새우젓 고추 청양고추 홍고추 풋고추 깨 들깨 미원 다시다 식소다 베이킹파우더 이스트 물 육수 버터 마가린'.split())

BAND = {'만3-5세(유아)': '유아', '만6-11세': '초등', '만12-18세': '중고'}

def norm(raw):
    head = re.split(r'[,_(]', raw)[0].strip().replace(' ', '')
    if head in 도감set:
        return head
    for nm in 도감:        # 부분 포함 (잔멸치→멸치)
        if nm in head:
            return nm
    return None

# 식재료 → 레시피명 → {유아/초등/중고: set(months), share: max}
data = defaultdict(lambda: defaultdict(lambda: {'유아': set(), '초등': set(), '중고': set(), 'share': 0.0}))
for r in recipes:
    ings = r.get('ingredients', [])
    total = sum(i.get('amount_g', 0) or 0 for i in ings) or 1
    band = BAND.get(r.get('age_group'), '초등')
    months = r.get('source_months', []) or []
    for idx, ing in enumerate(ings):
        nm = norm(ing.get('name', ''))
        if not nm or nm in SEASONING:
            continue
        amt = ing.get('amount_g', 0) or 0
        share = amt / total
        if not (amt >= 8 or share >= 0.15 or (idx <= 1 and amt >= 3)):
            continue
        rec = data[nm][r['name']]
        for m in months:
            rec[band].add(m)
        rec['share'] = max(rec['share'], share)

out = {}
for nm, recs in data.items():
    items = []
    for rname, v in recs.items():
        u, e, h = len(v['유아']), len(v['초등']), len(v['중고'])
        freq = len(v['유아'] | v['초등'] | v['중고'])
        share = v['share']
        rank = freq * (1 if share >= 0.12 else 0.3)   # 부재료성 채소(낮은 비중) 후순위
        items.append({'name': rname, 'freq': freq, 'u': u, 'e': e, 'h': h, 'share': round(share, 2), '_r': rank})
    items.sort(key=lambda x: (-x['_r'], -x['freq']))
    top = [{k: t[k] for k in ('name', 'freq', 'u', 'e', 'h', 'share')} for t in items[:4]]
    if top:
        out[nm] = top

json.dump(out, open(f'{WEB}/public/ingredient-recipes.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('레시피 보유 식재료:', len(out), '/ 도감', len(도감), f'({round(len(out)/len(도감)*100)}%)')
for nm in ['당근', '두부', '시금치', '멸치', '소고기', '브로콜리', '가지']:
    if nm in out:
        print(f"  {nm} →", ' | '.join(f"{t['name']}(월{t['freq']}·유{t['u']}초{t['e']}중{t['h']}·{int(t['share']*100)}%)" for t in out[nm][:3]))
