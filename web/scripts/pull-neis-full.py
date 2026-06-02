#!/usr/bin/env python3
"""pull-neis-full.py — NEIS 급식 전국 전수(가능한 최대) 수집. 증분 저장으로 레이트리밋 안전.
기존 /tmp/neis-ceiling.json·neis-menus.json 병합 출발 → 전 17지역 × 초·중·고 × 깊은 페이지 ×
2023~2024 1·2학기 중식. 매 (지역,학년급)마다 /tmp/neis-full.json 저장(중단돼도 보존).
"""
import json, re, os, time, urllib.request, urllib.parse
from collections import Counter

BASE = 'https://open.neis.go.kr/hub'
REGIONS = ['B10','J10','C10','D10','E10','F10','G10','H10','I10','K10','M10','N10','P10','Q10','R10','S10','T10']
KINDS = ['초등학교', '중학교', '고등학교']
PAGES = 4               # schoolInfo 페이지 (pSize 30 × 4 = 지역·학년급당 최대 120교)
PSIZE = 30
RANGES = [('20240304','20240712'),('20240901','20241228'),('20230302','20230714'),('20230901','20231228')]
ALLERGEN = re.compile(r'\s*\([0-9.\s]+\)'); PAREN = re.compile(r'\s*\([^)]*\)')
OUT = '/tmp/neis-full.json'

counts = Counter()
for f in ('/tmp/neis-ceiling.json', '/tmp/neis-menus.json', OUT):   # 기존 결과 병합 출발
    if os.path.exists(f):
        try: counts.update(json.load(open(f)))
        except Exception: pass

def get(path, params):
    url = f'{BASE}/{path}?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception:
        return None

def schools(region, kind, page):
    d = get('schoolInfo', {'Type':'json','pIndex':page,'pSize':PSIZE,'ATPT_OFCDC_SC_CODE':region,'SCHUL_KND_SC_NM':kind})
    if not d or 'schoolInfo' not in d: return []
    return [(region, r['SD_SCHUL_CODE']) for r in d['schoolInfo'][1]['row']]

def meals(region, code, fr, to):
    d = get('mealServiceDietInfo', {'Type':'json','pSize':400,'ATPT_OFCDC_SC_CODE':region,'SD_SCHUL_CODE':code,
            'MMEAL_SC_CODE':2,'MLSV_FROM_YMD':fr,'MLSV_TO_YMD':to})
    if not d or 'mealServiceDietInfo' not in d: return []
    out = []
    for r in d['mealServiceDietInfo'][1]['row']:
        for dish in (r.get('DDISH_NM') or '').split('<br/>'):
            nm = PAREN.sub('', ALLERGEN.sub('', dish)).strip()
            nm = re.sub(r'^[*\-·&\s]+', '', nm)
            if nm and len(nm) >= 2: out.append(nm)
    return out

n_school = 0; start = time.time()
for region in REGIONS:
    for kind in KINDS:
        codes = []
        for p in range(1, PAGES+1):
            codes += schools(region, kind, p); time.sleep(0.15)
        for region2, code in codes:
            for fr, to in RANGES:
                counts.update(meals(region2, code, fr, to)); time.sleep(0.13)
            n_school += 1
        json.dump(dict(counts), open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))   # 증분 저장
        print(f'{region}/{kind} · 누적학교 {n_school} · 누적고유 {len(counts)} · 2회+ {sum(1 for c in counts.values() if c>=2)} · {int(time.time()-start)}s', flush=True)

print(f'\n전수 완료 — 학교 {n_school} · 고유 {len(counts)} · 2회+ {sum(1 for c in counts.values() if c>=2)} · 5회+ {sum(1 for c in counts.values() if c>=5)}')
