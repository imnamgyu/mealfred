#!/usr/bin/env python3
"""pull-neis-tray.py — NEIS 급식 '식판 단위' 수집(공통출현 축 C).

기존 pull-neis-full.py는 메뉴를 flat Counter로 합쳐 '같은 끼니에 함께 차려진' 정보를 버린다.
이 수집기는 한 끼(날짜+학교 1행=식판)의 메뉴 리스트를 한 단위로 보존한다 → 식재료 식판 공통출현 계산용.
초등(우리 앱 타깃) 중식만, 전 17지역 얕은 페이지×최근 1학기 → 수만 식판이면 쌍 lift 통계 수렴.
keyless(open.neis.go.kr/hub, User-Agent만). 증분 저장(중단돼도 /tmp/neis-trays.json 보존).
출력: [["메뉴1","메뉴2",...], ...]  (각 원소=식판 하나의 메뉴명 리스트)
"""
import json, re, os, time, urllib.request, urllib.parse

BASE = 'https://open.neis.go.kr/hub'
REGIONS = ['B10','J10','C10','D10','E10','F10','G10','H10','I10','K10','M10','N10','P10','Q10','R10','S10','T10']
KIND = '초등학교'              # 앱 타깃 = 초등
PAGES = 2                      # 지역당 학교 페이지(pSize 30 × 2 = 최대 60교/지역)
PSIZE = 30
RANGES = [('20240901','20241228'), ('20240304','20240712')]   # 2024 2학기·1학기 중식
ALLERGEN = re.compile(r'\s*\([0-9.\s]+\)'); PAREN = re.compile(r'\s*\([^)]*\)')
OUT = '/tmp/neis-trays.json'

trays = []
if os.path.exists(OUT):
    try: trays = json.load(open(OUT))
    except Exception: trays = []

def get(path, params):
    url = f'{BASE}/{path}?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception:
        return None

def schools(region, page):
    d = get('schoolInfo', {'Type':'json','pIndex':page,'pSize':PSIZE,'ATPT_OFCDC_SC_CODE':region,'SCHUL_KND_SC_NM':KIND})
    if not d or 'schoolInfo' not in d: return []
    return [r['SD_SCHUL_CODE'] for r in d['schoolInfo'][1]['row']]

def meal_trays(region, code, fr, to):
    """한 학교의 기간 중식을 식판(행)별 메뉴 리스트로 반환."""
    d = get('mealServiceDietInfo', {'Type':'json','pSize':400,'ATPT_OFCDC_SC_CODE':region,'SD_SCHUL_CODE':code,
            'MMEAL_SC_CODE':2,'MLSV_FROM_YMD':fr,'MLSV_TO_YMD':to})
    if not d or 'mealServiceDietInfo' not in d: return []
    out = []
    for r in d['mealServiceDietInfo'][1]['row']:
        dishes = []
        for dish in (r.get('DDISH_NM') or '').split('<br/>'):
            nm = PAREN.sub('', ALLERGEN.sub('', dish)).strip()
            nm = re.sub(r'^[*\-·&\s]+', '', nm)
            if nm and len(nm) >= 2:
                dishes.append(nm)
        if len(dishes) >= 2:           # 메뉴 2개 미만 식판은 쌍 계산에 무의미
            out.append(dishes)
    return out

n_school = 0; start = time.time()
for region in REGIONS:
    codes = []
    for p in range(1, PAGES+1):
        codes += schools(region, p); time.sleep(0.15)
    for code in codes:
        for fr, to in RANGES:
            trays += meal_trays(region, code, fr, to); time.sleep(0.13)
        n_school += 1
    json.dump(trays, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))   # 지역마다 증분 저장
    print(f'[{region}] schools={n_school} trays={len(trays)} {time.time()-start:.0f}s', flush=True)

print(f'DONE schools={n_school} trays={len(trays)} -> {OUT}', flush=True)
