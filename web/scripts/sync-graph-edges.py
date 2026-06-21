#!/usr/bin/env python3
# sync-graph-edges.py — food-graph.json(최신·1115) → SQL ingredient_edges 동기화.
#   배경: gen-food-graph가 06-16 재생성(lift/PMI 재설계·식판 tray 축)을 JSON에만 씀 → SQL stale(782·strong276).
#   _migrate_reco는 ignore-duplicates라 기존 엣지 grade 갱신 안 됨 → 여기선 merge-upsert(insert+update) + SQL-only 삭제로 '동일'하게.
#   DRY 기본(읽기만). 실제 쓰기: --execute. 안전가드: JSON 엣지 name→id drop>0이면 삭제 스킵(오삭제 방지).
import os, re, json, sys, urllib.request, urllib.error, uuid
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXEC = '--execute' in sys.argv
env = {}
for line in open(f'{WEB}/.env.local'):
    m = re.match(r'\s*([A-Z_]+)\s*=\s*(.+?)\s*$', line)
    if m: env.setdefault(m.group(1), m.group(2).strip().strip('"'))
URL = env['NEXT_PUBLIC_SUPABASE_URL']; KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def getall(p):
    out = []; off = 0
    while True:
        r = urllib.request.Request(f'{URL}/rest/v1/{p}&offset={off}&limit=1000', headers=H)
        d = json.loads(urllib.request.urlopen(r, timeout=30).read()); out += d
        if len(d) < 1000: break
        off += 1000
    return out

def post(path, rows, prefer):
    ok = 0; fail = 0
    for i in range(0, len(rows), 500):
        b = rows[i:i+500]
        r = urllib.request.Request(f'{URL}/rest/v1/{path}', data=json.dumps(b).encode(), method='POST', headers={**H, 'Prefer': prefer})
        try: urllib.request.urlopen(r, timeout=60); ok += len(b)
        except urllib.error.HTTPError as e: fail += len(b); print('  POST fail', e.code, e.read().decode()[:200])
    return ok, fail

def delete(a, b, kind):
    r = urllib.request.Request(f'{URL}/rest/v1/ingredient_edges?a_id=eq.{a}&b_id=eq.{b}&kind=eq.{kind}', method='DELETE', headers={**H, 'Prefer': 'return=minimal'})
    urllib.request.urlopen(r, timeout=30)

def cnt(t):
    r = urllib.request.Request(f'{URL}/rest/v1/{t}?select=a_id', headers={**H, 'Prefer': 'count=exact', 'Range': '0-0'})
    try: return urllib.request.urlopen(r, timeout=20).headers.get('Content-Range')
    except Exception as ex: return str(ex)

print(f"=== sync-graph-edges {'[EXECUTE]' if EXEC else '[DRY]'} ===")
fg = json.load(open(f'{WEB}/lib/food-graph.json'))['edges']
fg_nodes = set()
for e in fg: fg_nodes.add(e['a']); fg_nodes.add(e['b'])

existing = getall('ingredients?select=id,name,slug')
name2id = {}
for x in existing:
    if x.get('name'): name2id[x['name']] = x['id']
    if x.get('slug'): name2id.setdefault(x['slug'], x['id'])

# gap-fill: food-graph 노드 중 ingredients에 없는 것(엣지 해소용). _migrate_reco 키 shape 답습(PGRST102 회피).
need = sorted(fg_nodes - set(name2id.keys()))
if need:
    ins = [{'id': str(uuid.uuid4()), 'name': nm, 'slug': nm, 'status': 'verified', 'source': 'graph-sync',
            'meta': {'from': 'food-graph'}, 'nutri_per_100g': None, 'emoji': None, 'category': None, 'grade_star': None} for nm in need]
    if EXEC:
        ok, fail = post('ingredients', ins, 'return=minimal,resolution=ignore-duplicates')
        for r in ins: name2id[r['name']] = r['id']
        print(f'gap-fill ingredients: 신규 {len(need)} → ok {ok} fail {fail}')
    else:
        print(f'gap-fill ingredients(dry): 신규 {len(need)} 필요 → {need[:20]}')
else:
    print('gap-fill ingredients: 0 (모든 그래프 노드 이미 존재)')

# JSON 엣지 → 캐논(무방향 a<b 정렬)
jrows = {}; drop = 0; dropped = []
for e in fg:
    ai = name2id.get(e['a']); bi = name2id.get(e['b'])
    if not ai or not bi:
        drop += 1; dropped.append((e['a'], e['b'])); continue
    a, b = (ai, bi) if ai < bi else (bi, ai)
    jrows[(a, b, e['kind'])] = {'a_id': a, 'b_id': b, 'kind': e['kind'], 'count': e.get('count'), 'lift': e.get('lift'),
        'grade': e.get('grade'), 'strength': e.get('strength'), 'src': e.get('src', 'recipe'),
        'basis': e.get('basis'), 'verified': e.get('verified'), 'tray': e.get('tray')}

sql = getall('ingredient_edges?select=a_id,b_id,kind,grade,strength,src,tray')
sqlmap = {(s['a_id'], s['b_id'], s['kind']): s for s in sql}
jkeys = set(jrows.keys()); skeys = set(sqlmap.keys())
to_insert = [jrows[k] for k in jkeys - skeys]
to_delete = list(skeys - jkeys)
to_update = []
for k in jkeys & skeys:
    j = jrows[k]; s = sqlmap[k]
    if j['grade'] != s.get('grade') or j['strength'] != s.get('strength') or j['src'] != s.get('src') or j['tray'] != s.get('tray'):
        to_update.append(j)

print(f'\nJSON 엣지 {len(jrows)} (해소실패 drop {drop}) · SQL 엣지 {len(sqlmap)}')
print(f'  to_insert {len(to_insert)} · to_update(grade/strength/src/tray 변경) {len(to_update)} · to_delete(SQL-only) {len(to_delete)}')
if drop: print(f'  ⚠️ drop>0 → 삭제 스킵(오삭제 방지). 미해소 샘플: {dropped[:10]}')

if EXEC:
    up = to_insert + to_update
    ok, fail = post('ingredient_edges', up, 'resolution=merge-duplicates')
    print(f'  upsert(insert+update) {len(up)} → ok {ok} fail {fail}')
    if drop == 0:
        dok = 0
        for (a, b, kind) in to_delete:
            try: delete(a, b, kind); dok += 1
            except Exception as ex: print('  del fail', ex)
        print(f'  deleted SQL-only {dok}')
    else:
        print('  삭제 스킵(drop>0)')

print('\n=== 검증 ===')
print('SQL ingredient_edges 행수:', cnt('ingredient_edges'), '| JSON 목표', len(jrows))
