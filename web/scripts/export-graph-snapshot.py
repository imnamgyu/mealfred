#!/usr/bin/env python3
"""export-graph-snapshot.py — SQL 추천 네트워크 → 'JSON 스냅샷'(기존 shape) export.

배경: 추천 네트워크가 SQL(ingredients·ingredient_edges·dish_ingredient_stats)로 이관됐다.
  하지만 클라/SSG 동기 경로(도감 PersonalBridge 등)는 SQL을 직접 못 읽으므로, SQL을 기존 JSON과
  '동일 shape'으로 export해 정적 스냅샷으로 서빙한다. graphSource가 이 스냅샷을 읽으면 소비 함수 무변경.

출력(기존 파일 덮어쓰기 — shape 동일):
  - lib/food-graph.json       {nodes, edges:[{a,b,kind,strength,lift,grade,count,src,verified,tray,basis}]}  (a/b=이름)
  - lib/kit-dish-matrix.json 의 cells/scores  (dish×ingredient, 이름)
  ※ ingredients-light.json은 도감 큐레이션이라 별도(enrich 파이프라인 소관) — 여기선 그래프만.

실행: cd web && python3 scripts/export-graph-snapshot.py   (.env.local의 service_role 필요)
크론화: 야간 1회(부모 입력·스크래핑이 SQL에 누적되면 스냅샷이 따라감).
검증(2026-06-14): SQL 626 edges = 기존 JSON 626, 차이 0.
"""
import os, re, json, urllib.request
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(f'{WEB}/.env.local'):
    m = re.match(r'\s*([A-Z_]+)\s*=\s*(.+?)\s*$', line)
    if m: env.setdefault(m.group(1), m.group(2).strip().strip('"'))
URL = env['NEXT_PUBLIC_SUPABASE_URL']; KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}

def getall(p):
    out = []; off = 0
    while True:
        d = json.loads(urllib.request.urlopen(urllib.request.Request(f'{URL}/rest/v1/{p}&offset={off}&limit=1000', headers=H), timeout=30).read())
        out += d
        if len(d) < 1000: break
        off += 1000
    return out

id2n = {x['id']: x['name'] for x in getall('ingredients?select=id,name')}

# ── food-graph.json (ingredient_edges → 이름 기반 RawEdge) ──
edges = getall('ingredient_edges?select=a_id,b_id,kind,count,lift,grade,strength,src,basis,verified,tray')
out_edges = []; nodes = set()
for e in edges:
    a = id2n.get(e['a_id']); b = id2n.get(e['b_id'])
    if not a or not b: continue
    nodes.add(a); nodes.add(b)
    row = {'a': a, 'b': b, 'kind': e['kind'], 'strength': e['strength'], 'basis': e.get('basis')}
    for k in ['count', 'lift', 'grade', 'verified', 'tray', 'src']:
        if e.get(k) is not None: row[k] = e[k]
    out_edges.append(row)
fg = {'nodes': sorted(nodes), 'edges': out_edges, 'meta': {'source': 'sql-snapshot', 'edges': len(out_edges)}}
json.dump(fg, open(f'{WEB}/lib/food-graph.json', 'w'), ensure_ascii=False)
print(f'food-graph.json ← {len(out_edges)} edges, {len(nodes)} nodes (SQL 스냅샷)')

# ── kit-dish-matrix.json cells/scores (dish_ingredient_stats → 이름) ──
stats = getall('dish_ingredient_stats?select=dish,ingredient_id,count,score')
cells = {}; scores = {}
for s in stats:
    ing = id2n.get(s['ingredient_id'])
    if not ing: continue
    if s['count'] and s['count'] > 0:               # count=0(score-only 보충행)은 cells에 안 씀 — 원본 kit-matrix cells와 byte-동등 유지
        cells.setdefault(s['dish'], {})[ing] = s['count']
    if s.get('score') is not None: scores.setdefault(s['dish'], {})[ing] = s['score']
try:
    kit = json.load(open(f'{WEB}/lib/kit-dish-matrix.json'))
except Exception:
    kit = {}
kit['cells'] = cells; kit['scores'] = scores
kit.setdefault('meta', {})['source'] = 'sql-snapshot'
json.dump(kit, open(f'{WEB}/lib/kit-dish-matrix.json', 'w'), ensure_ascii=False)
print(f'kit-dish-matrix.json ← cells {len(cells)} dishes, scores {len(scores)} dishes (SQL 스냅샷)')
print('완료. (shape 동일 → graphSource/소비함수/테스트 무영향)')
