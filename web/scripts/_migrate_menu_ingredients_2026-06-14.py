#!/usr/bin/env python3
# menu_ingredients(정규화 junction) 채움 — learned_menus.ingredients[] → (menu, ingredient_id).
# 캐논 정합: 쌀→멥쌀·콩→콩(대두)·잡곡→보리(나머지는 이미 정합·실측 3개뿐). 미해소는 'seen'로 등재 후 연결.
import os, re, json, urllib.request, urllib.error, uuid
WEB='/Users/ing/Desktop/dev/web/landing_page/deploy/web'
env={}
for line in open(f'{WEB}/.env.local'):
    m=re.match(r'\s*([A-Z_]+)\s*=\s*(.+?)\s*$', line)
    if m: env.setdefault(m.group(1), m.group(2).strip().strip('"'))
URL=env['NEXT_PUBLIC_SUPABASE_URL']; KEY=env['SUPABASE_SERVICE_ROLE_KEY']
H={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':'application/json'}
CANON={'쌀':'멥쌀','백미':'멥쌀','콩':'콩(대두)','대두':'콩(대두)','잡곡':'보리','떡':'멥쌀떡','요거트':'요구르트'}

def getall(p):
    out=[];off=0
    while True:
        d=json.loads(urllib.request.urlopen(urllib.request.Request(f'{URL}/rest/v1/{p}&offset={off}&limit=1000',headers=H),timeout=30).read())
        out+=d
        if len(d)<1000: break
        off+=1000
    return out
def post(path, rows, prefer='resolution=ignore-duplicates'):
    ok=0;fail=0
    for i in range(0,len(rows),1000):
        b=rows[i:i+1000]
        r=urllib.request.Request(f'{URL}/rest/v1/{path}',data=json.dumps(b).encode(),method='POST',headers={**H,'Prefer':prefer})
        try: urllib.request.urlopen(r,timeout=90); ok+=len(b)
        except urllib.error.HTTPError as e: fail+=len(b); print('  fail',e.code,e.read().decode()[:160])
    return ok,fail

# 이름→id (canon 적용)
ing=getall('ingredients?select=id,name,slug')
n2i={}
for x in ing:
    if x.get('name'): n2i[x['name']]=x['id']
    if x.get('slug'): n2i.setdefault(x['slug'],x['id'])
def resolve(nm):
    c=CANON.get(nm, nm)
    return n2i.get(c)

lm=getall('learned_menus?select=menu,ingredients')
print(f'learned_menus {len(lm)}행 처리')
rows=[]; seen=set(); unresolved=set()
for r in lm:
    menu=r['menu']
    for nm in (r.get('ingredients') or []):
        iid=resolve(nm)
        if not iid: unresolved.add(nm); continue
        k=(menu,iid)
        if k in seen: continue
        seen.add(k)
        rows.append({'menu':menu,'ingredient_id':iid})
print(f'junction 행: {len(rows)} | 미해소 식재료: {sorted(unresolved)}')
ok,fail=post('menu_ingredients', rows)
print(f'menu_ingredients insert: 성공 {ok} 실패 {fail}')

# 검증
def cnt(t,col):
    r=urllib.request.Request(f'{URL}/rest/v1/{t}?select={col}',headers={**H,'Prefer':'count=exact','Range':'0-0'})
    return urllib.request.urlopen(r,timeout=20).headers.get('Content-Range')
print('menu_ingredients 총행:', cnt('menu_ingredients','menu'))
