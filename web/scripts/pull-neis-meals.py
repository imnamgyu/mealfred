#!/usr/bin/env python3
"""pull-neis-meals.py — NEIS 급식 API(keyless)에서 초등 급식 메뉴를 수집.

학교목록(schoolInfo, keyless OK) → 학교별 급식(mealServiceDietInfo, 중식) → 요리명(DDISH_NM) 수집.
알레르기 코드(괄호 숫자) 제거, 디둡+빈도. 출력 → /tmp/neis-menus.json { menu: count }.
영유아·아동 앱이라 '초등학교' 중심(유치원은 표본 적음). 예의: 호출 사이 sleep.
"""
import json, re, time, urllib.request, urllib.parse
from collections import Counter

BASE = 'https://open.neis.go.kr/hub'
# 다양성 위해 여러 시도교육청
REGIONS = ['B10', 'J10', 'C10', 'D10', 'E10', 'G10', 'P10', 'R10', 'S10', 'K10']  # 서울·경기·부산·대구·인천·대전·전북·경북·경남·강원
SCHOOLS_PER_REGION = 18
FROM, TO = '20240304', '20240712'   # 2024 1학기 중식
ALLERGEN = re.compile(r'\s*\([0-9.\s]+\)')   # (5.6.10) 알레르기 코드
PAREN = re.compile(r'\s*\([^)]*\)')

def get(path, params):
    url = f'{BASE}/{path}?' + urllib.parse.urlencode(params)   # 한글 파라미터 인코딩
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})   # 기본 UA 차단 회피
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception:
        return None

def schools(region):
    d = get('schoolInfo', {'Type': 'json', 'pIndex': 1, 'pSize': SCHOOLS_PER_REGION,
                           'ATPT_OFCDC_SC_CODE': region, 'SCHUL_KND_SC_NM': '초등학교'})
    if not d or 'schoolInfo' not in d:
        return []
    return [(region, r['SD_SCHUL_CODE'], r['SCHUL_NM']) for r in d['schoolInfo'][1]['row']]

def meals(region, code):
    d = get('mealServiceDietInfo', {'Type': 'json', 'pIndex': 1, 'pSize': 200,
            'ATPT_OFCDC_SC_CODE': region, 'SD_SCHUL_CODE': code, 'MMEAL_SC_CODE': 2,
            'MLSV_FROM_YMD': FROM, 'MLSV_TO_YMD': TO})
    if not d or 'mealServiceDietInfo' not in d:
        return []
    out = []
    for r in d['mealServiceDietInfo'][1]['row']:
        for dish in (r.get('DDISH_NM') or '').split('<br/>'):
            nm = ALLERGEN.sub('', dish).strip()
            nm = PAREN.sub('', nm).strip()          # 남은 괄호 설명도 제거
            nm = re.sub(r'^[*\-·\s]+', '', nm)
            if nm and len(nm) >= 2:
                out.append(nm)
    return out

counts = Counter()
n_schools = 0
for region in REGIONS:
    for region2, code, name in schools(region):
        ms = meals(region2, code)
        counts.update(ms)
        n_schools += 1
        time.sleep(0.25)
    print(f'{region} 누적 학교 {n_schools} · 고유 메뉴 {len(counts)}', flush=True)
    time.sleep(0.4)

# 학교 급식 메뉴는 공식 표기라 1회도 유효 — 전체 저장(디코딩 단계에서 무매핑은 자연 제외)
clean = {m: c for m, c in counts.items() if c >= 1}
json.dump(clean, open('/tmp/neis-menus.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'\n수집 완료 — 학교 {n_schools} · 고유메뉴 {len(counts)} · 2회+ {len(clean)}')
print('top 30:', ' · '.join(f'{m}({c})' for m, c in counts.most_common(30)))
