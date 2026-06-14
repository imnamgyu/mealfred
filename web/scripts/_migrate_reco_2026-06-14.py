#!/usr/bin/env python3
# 추천 네트워크 이관(클린 파트): ingredients 갭채움(food-graph 노드∪JSON 도감) → ingredient_edges → dish_ingredient_stats.
# menu_ingredients(junction)는 캐논 불일치 위험이라 별도(여기서 제외).
import os, re, json, urllib.request, urllib.error, uuid, time
WEB='/Users/ing/Desktop/dev/web/landing_page/deploy/web'
env={}
for line in open(f'{WEB}/.env.local'):
    m=re.match(r'\s*([A-Z_]+)\s*=\s*(.+?)\s*$', line)
    if m: env.setdefault(m.group(1), m.group(2).strip().strip('"'))
URL=env['NEXT_PUBLIC_SUPABASE_URL']; KEY=env['SUPABASE_SERVICE_ROLE_KEY']
H={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':'application/json'}

def getall(p):
    out=[]; off=0
    while True:
        r=urllib.request.Request(f'{URL}/rest/v1/{p}&offset={off}&limit=1000', headers=H)
        d=json.loads(urllib.request.urlopen(r,timeout=30).read()); out+=d
        if len(d)<1000: break
        off+=1000
    return out
def post(path, rows, prefer='resolution=ignore-duplicates'):
    if not rows: return 0,0
    ok=0; fail=0
    for i in range(0,len(rows),500):
        batch=rows[i:i+500]
        r=urllib.request.Request(f'{URL}/rest/v1/{path}', data=json.dumps(batch).encode(), method='POST',
            headers={**H,'Prefer':prefer})
        try: urllib.request.urlopen(r,timeout=60); ok+=len(batch)
        except urllib.error.HTTPError as e:
            fail+=len(batch); print('  POST fail', path, e.code, e.read().decode()[:200])
    return ok,fail

# ── 데이터 로드 ──
fg=json.load(open(f'{WEB}/lib/food-graph.json'))['edges']
kit=json.load(open(f'{WEB}/lib/kit-dish-matrix.json'))
json_nm=[x['nm'] for x in json.load(open(f'{WEB}/public/ingredients-light.json'))['ingredients']]
json_nm_set=set(json_nm)
try:
    pool=json.load(open(f'{WEB}/../data_ingredient_pool_enriched.json'))
    pool=pool.get('pool') or pool.get('ingredients') or pool
    ENR={x['nm']:x for x in pool}
except Exception as e:
    ENR={}; print('enriched pool skip', e)

fg_nodes=set()
for e in fg: fg_nodes.add(e['a']); fg_nodes.add(e['b'])

# ── 기존 ingredients 맵 ──
existing=getall('ingredients?select=id,name,slug')
name2id={}
for x in existing:
    if x.get('name'): name2id[x['name']]=x['id']
    if x.get('slug'): name2id.setdefault(x['slug'], x['id'])
print(f'기존 ingredients {len(existing)}개')

# ── 1) 미커버 식재료 등재(food-graph 노드 ∪ JSON 도감) ──
need = (fg_nodes | json_nm_set) - set(name2id.keys())
ins=[]
for nm in sorted(need):
    en=ENR.get(nm, {})
    ins.append({'id':str(uuid.uuid4()), 'name':nm, 'slug':nm, 'status':'verified', 'source':'migration',
         'meta':{'tier':'dogam' if nm in json_nm_set else 'seen', 'from':'food-graph' if nm in fg_nodes else 'json'},
         'nutri_per_100g': en.get('nutri'),          # 키 고정(PGRST102: 모든 객체 키 동일 필요) — 없으면 None
         'emoji': en.get('em'),
         'category': en.get('cat'),
         'grade_star': en.get('grade')})   # grade_label은 SQL CHECK 어휘 불일치('가끔')라 제외 — enrich가 채움
ok,fail=post('ingredients', ins, prefer='return=minimal')
print(f'식재료 등재: 신규 {len(need)} → 성공 {ok} 실패 {fail}')
for r in ins: name2id[r['name']]=r['id']   # 새 id 맵 반영

# ── 2) ingredient_edges (food-graph → SQL) ──
edges=[]; drop=0; seen=set()
for e in fg:
    ai=name2id.get(e['a']); bi=name2id.get(e['b'])
    if not ai or not bi: drop+=1; continue
    a,b=(ai,bi) if ai<bi else (bi,ai)   # 무방향 정렬(uuid 문자열)
    key=(a,b,e['kind'])
    if key in seen: continue
    seen.add(key)
    edges.append({'a_id':a,'b_id':b,'kind':e['kind'],'count':e.get('count'),'lift':e.get('lift'),
        'grade':e.get('grade'),'strength':e.get('strength'),'src':e.get('src','recipe'),
        'basis':e.get('basis'),'verified':e.get('verified'),'tray':e.get('tray')})
ok,fail=post('ingredient_edges', edges)
print(f'ingredient_edges: {len(edges)} → 성공 {ok} 실패 {fail} (노드 미매칭 drop {drop})')

# ── 3) dish_ingredient_stats (kit-dish-matrix → SQL) ──
cells=kit.get('cells',{}); scores=kit.get('scores',{})
stats=[]; sdrop=0; sseen=set()
for dish, ings in cells.items():
    for ing, cnt in ings.items():
        iid=name2id.get(ing)
        if not iid: sdrop+=1; continue
        k=(dish,iid)
        if k in sseen: continue
        sseen.add(k)
        sc=scores.get(dish,{}).get(ing)
        stats.append({'dish':dish,'ingredient_id':iid,'count':cnt,'score':sc})
ok,fail=post('dish_ingredient_stats', stats)
print(f'dish_ingredient_stats: {len(stats)} → 성공 {ok} 실패 {fail} (미매칭 drop {sdrop})')

# ── 최종 카운트 ──
def cnt(t):
    r=urllib.request.Request(f'{URL}/rest/v1/{t}?select=id&limit=0',headers={**H,'Prefer':'count=exact','Range':'0-0'})
    try: return urllib.request.urlopen(r,timeout=20).headers.get('Content-Range')
    except: return '?'
print('\n=== 최종 행수 ===')
for t in ['ingredients','ingredient_edges','dish_ingredient_stats','menu_ingredients']:
    print(' ', t, cnt(t))
