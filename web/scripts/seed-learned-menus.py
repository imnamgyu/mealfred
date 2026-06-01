#!/usr/bin/env python3
"""
seed-learned-menus.py — 레시피 DB(~4,400)를 learned_menus(메뉴→표준식재료)로 씨딩.

레시피의 명시적 식재료 리스트를 도감 표준명으로 정규화(build-foods-recipes.py와 동일 norm + 양념 제외)해
menu(정규화키) → ingredients[] 로 만든다. 같은 메뉴명은 식재료 합집합. 빈 배열은 제외(환각 차단 규칙).

  python3 scripts/seed-learned-menus.py            # 생성만(/tmp/learned_seed.json + 샘플, DB 미기록)
  python3 scripts/seed-learned-menus.py --insert   # learned_menus에 bulk upsert(service_role 필요)
"""
import json, re, os, sys, urllib.request, collections

KIT = os.path.expanduser('~/Desktop/편식극복키트/01_참고자료/B_레시피DB')
RECIPE_FILES = ['아동기_레시피DB.json', '유아기_레시피DB.json', '유아기_레시피DB_추가.json',
                '유아기_월별식단_레시피DB.json', '영아기_레시피DB.json', '영아기_레시피DB_추가.json']

도감 = [x['nm'] for x in json.load(open('public/ingredients-light.json', encoding='utf-8'))['ingredients']]
도감set = set(도감)
SEASONING = set('마늘 파 대파 쪽파 실파 소금 간장 진간장 설탕 흑설탕 물엿 조청 고춧가루 참깨 깨소금 참기름 들기름 콩기름 식용유 카놀라유 포도씨유 올리브유 후추 후춧가루 식초 맛술 미림 청주 정종 생강 고추장 된장 쌈장 춘장 올리고당 꿀 전분 녹말 감자전분 밀가루 부침가루 튀김가루 빵가루 케첩 마요네즈 굴소스 액젓 멸치액젓 까나리액젓 새우젓 고추 청양고추 홍고추 풋고추 깨 들깨 미원 다시다 식소다 베이킹파우더 이스트 물 육수 버터 마가린'.split())
PROCESSED = set('소시지 소세지 햄 베이컨 어묵 맛살 게맛살 핫바 너겟 만두 라면 스팸 비엔나 프랑크 떡갈비 미트볼 동그랑땡 시리얼'.split())

def norm(raw):
    head = re.split(r'[,_(]', str(raw))[0].strip().replace(' ', '')
    if not head or head in SEASONING:
        return None
    if head in 도감set:
        return head
    for nm in 도감:  # 부분 포함(잔멸치→멸치)
        if len(nm) >= 2 and nm in head:
            return nm
    return None

def ing_name(it):
    if isinstance(it, str): return it
    if isinstance(it, dict):
        for k in ('raw_name', 'name', '식재료', '재료명'):
            if it.get(k): return it[k]
    return ''

def mkey(name):
    return re.sub(r'\s', '', (name or '').strip())

menus = {}  # key -> {cnt: Counter(식재료별 변종 등장수), n: 변종수}
raw_recipes = 0
for f in RECIPE_FILES:
    p = f'{KIT}/{f}'
    if not os.path.exists(p): continue
    d = json.load(open(p, encoding='utf-8'))
    recipes = d.get('recipes', []) if isinstance(d, dict) else d
    for r in recipes:
        if not isinstance(r, dict): continue
        name = r.get('name') or r.get('메뉴') or ''
        name = re.sub(r'^\s*\([^)]*\)\s*', '', name)   # 선두 주석 제거: (간식)·(가다랑어제외)·(아침) 등 — 실제 식단표엔 없음
        key = mkey(name)
        if not key: continue
        raw_recipes += 1
        ings = [n for n in (norm(ing_name(i)) for i in (r.get('ingredients') or [])) if n]
        if not ings: continue
        m = menus.setdefault(key, {'cnt': collections.Counter(), 'n': 0})
        m['n'] += 1
        for i in set(ings): m['cnt'][i] += 1

seed = []
for k, v in menus.items():
    thr = max(1, round(v['n'] * 0.35))   # 변종 35%+ 등장한 식재료만(단일 변종은 전부) — 일반명 과대union 방지
    ings = sorted([i for i, c in v['cnt'].items() if c >= thr])
    if not ings: continue
    seed.append({'menu': k, 'ingredients': ings, 'processed': any(i in PROCESSED for i in ings), 'source': 'recipe_seed'})
json.dump(seed, open('/tmp/learned_seed.json', 'w', encoding='utf-8'), ensure_ascii=False)

print(f'레시피 {raw_recipes}개 → 고유 메뉴 {len(seed)}개 (빈 식재료 제외)')
avg = round(sum(len(s['ingredients']) for s in seed) / max(1, len(seed)), 1)
print(f'메뉴당 평균 식재료 {avg}개 · processed 메뉴 {sum(1 for s in seed if s["processed"])}개')
print('샘플 10:')
for s in seed[:10]:
    print(f"  {s['menu']} → {'·'.join(s['ingredients'])}{' [가공]' if s['processed'] else ''}")

if '--insert' not in sys.argv:
    print('\n(생성만 완료. --insert로 learned_menus에 bulk upsert)')
    sys.exit(0)

# --- DB bulk upsert (service_role) ---
URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
if not URL or not KEY:
    sys.exit('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요')
endpoint = f'{URL}/rest/v1/learned_menus?on_conflict=menu'
B = 500
ok = 0
for i in range(0, len(seed), B):
    batch = seed[i:i + B]
    body = json.dumps(batch, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(endpoint, data=body, method='POST', headers={
        'apikey': KEY, 'authorization': f'Bearer {KEY}', 'content-type': 'application/json',
        'prefer': 'resolution=ignore-duplicates,return=minimal',   # 기존 실사용 학습은 보존, 신규만 추가
    })
    try:
        urllib.request.urlopen(req, timeout=60); ok += len(batch)
        print(f'  upsert {ok}/{len(seed)}')
    except Exception as e:
        print(f'  ✗ 배치 {i} 실패: {str(e)[:200]}')
print(f'완료: {ok}/{len(seed)} upsert')
