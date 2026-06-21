#!/usr/bin/env python3
# sikdan-learn.py — OCR된 식단(/tmp/sikdan_ocr/*.json)을 (기관,월) 멱등 dedup으로 집계:
#   ① 등장률(youa-freq baseline): 식재료가 등장한 (기관-월) 수 / 전체 (기관-월)
#   ② 공출현: 같은 끼니(date+slot)에 함께 나온 식재료 쌍
# 멱등: 영속 ledger(/tmp/sikdan_ocr/_ledger.json)에 (기관-월) 키 기록 → 같은 키 재입력해도 1회만.
# DRY(기본): 결과만 출력. (야간 크론은 이 로직으로 ingredient_edges/youa-freq에 write — 추후.)
import json, os, re, glob, itertools
OCR='/tmp/sikdan_ocr'; LEDGER=f'{OCR}/_ledger.json'
WEB=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DICT=json.load(open(f'{WEB}/lib/menu-dict.json'))
CANON={'쌀':'멥쌀','백미':'멥쌀','쌀밥':'멥쌀','멥쌀밥':'멥쌀','누룽지':'멥쌀','잡곡':'보리','떡':'멥쌀떡',
  '콩':'콩(대두)','대두':'콩(대두)','요거트':'요구르트','달걀':'계란','쇠고기':'소고기','큰느타리버섯':'새송이버섯',
  '대멸치':'멸치','중멸치':'멸치','잔멸치':'멸치'}
SEASON=set('소금 물 설탕 간장 진간장 국간장 참기름 들기름 식용유 카놀라유 후추 고춧가루 깨소금 참깨 들깨 깨 마늘 다진마늘 생강 식초 맛술 미림 물엿 올리고당 꿀 케첩 마요네즈 다시다 미원 멸치액젓 액젓 전분 밀가루 부침가루 튀김가루 카레가루 된장 고추장 쌈장 청국장 버터 마가린 향신료'.split())
def canon(x):
    x=x.strip()
    return CANON.get(x,x)
# 식재료 어휘(메뉴 스캔용) = menu-dict 값 ∪ 도감
VOCAB=set()
for ings in DICT.values():
    for x in ings: VOCAB.add(x)
try:
    for it in json.load(open(f'{WEB}/public/ingredients-light.json')).get('ingredients',[]): VOCAB.add(it['nm'])
except Exception: pass
VOCAB={canon(v) for v in VOCAB if v not in SEASON}
VOCAB_BY_LEN=sorted(VOCAB, key=len, reverse=True)
DICT_KEYS=sorted(DICT.keys(), key=len, reverse=True)
def decompose(menu):
    m=re.sub(r'[\s()/]','',menu)
    if not m: return []
    if m in DICT: return [canon(x) for x in DICT[m] if x not in SEASON]
    out=set()
    for k in DICT_KEYS:                       # 사전 키가 메뉴에 포함
        if len(k)>=3 and k in m:
            for x in DICT[k]:
                if x not in SEASON: out.add(canon(x))
    for v in VOCAB_BY_LEN:                     # 어휘 스캔(식재료명이 메뉴에 직접 등장)
        if len(v)>=2 and v in m: out.add(v)
    return list(out)
def parse_ym(name):
    yr=re.search(r'(20\d2|2\d)\D*년?\D*?(\d{1,2})\s*월', name) or None
    m=re.search(r'(\d{1,2})\s*월', name)
    y=re.search(r'(20\d{2})', name)
    mon=int(m.group(1)) if m else 0
    year=int(y.group(1)) if y else (2025 if mon>=7 else 2026)   # 7~12월=2025·1~6월=2026 가정(이 컬렉션 기준)
    return f'{year}-{mon:02d}' if mon else 'NA'

ledger=json.load(open(LEDGER)) if os.path.exists(LEDGER) else {'keys':{}}
new=0; dup=0; unmapped=set(); total_menus=0; mapped_menus=0
for f in sorted(glob.glob(f'{OCR}/[0-9]*.json')):
    d=json.load(open(f))
    gu=d.get('gu',''); typ=d.get('type',''); ym=parse_ym(d.get('name',''))
    key=f'{gu}/{typ}/{ym}'                       # (기관,월) 멱등 키
    if key in ledger['keys']: dup+=1; continue   # 이미 집계 → 스킵(중복 카운팅 방지)
    meals={}; allings=set()
    for pg in d.get('pages',[]):
        if not pg.get('is_menu'): continue
        for it in pg.get('items',[]):
            menu=(it.get('menu') or '').strip()
            if not menu: continue
            total_menus+=1
            ings=decompose(menu)
            if ings: mapped_menus+=1
            else: unmapped.add(menu)
            mealkey=f"{it.get('date')}|{it.get('slot')}"
            meals.setdefault(mealkey,set()).update(ings)
            allings.update(ings)
    if not allings: continue
    ledger['keys'][key]={'ings':sorted(allings),'meals':[sorted(s) for s in meals.values() if s]}
    new+=1
json.dump(ledger, open(LEDGER,'w'), ensure_ascii=False)

# ── 집계 ──
keys=ledger['keys']; total=len(keys)
freq={}; cooc={}
for k,v in keys.items():
    for ing in set(v['ings']): freq[ing]=freq.get(ing,0)+1     # 등장률 분자(기관-월 단위)
    for meal in v['meals']:
        for a,b in itertools.combinations(sorted(set(meal)),2):
            cooc[(a,b)]=cooc.get((a,b),0)+1
print(f'=== sikdan-learn (DRY·멱등) ===')
print(f'이번 run: 신규 (기관-월) {new} · 중복 스킵 {dup}  →  누적 (기관-월) = {total}')
print(f'메뉴 분해 커버리지: {mapped_menus}/{total_menus} ({100*mapped_menus//max(1,total_menus)}%) · 미매핑 {len(unmapped)}종')
print(f'\n[① 등장률 TOP20] (등장 기관-월 수 / {total})')
for ing,c in sorted(freq.items(), key=lambda x:-x[1])[:20]:
    print(f'  {ing:12s} {c:3d}/{total}  ({100*c//total}%)')
print(f'\n[② 공출현(같은 끼니) TOP15]')
for (a,b),c in sorted(cooc.items(), key=lambda x:-x[1])[:15]:
    print(f'  {a} + {b}  ×{c}')
print(f'\n[미매핑 메뉴 샘플 15]')
print('  '+' · '.join(list(unmapped)[:15]))
