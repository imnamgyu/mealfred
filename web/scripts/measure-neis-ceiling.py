#!/usr/bin/env python3
"""measure-neis-ceiling.py — NEIS 고유 급식메뉴 '가져올 수 있는 천장' 실측.
전 17개 교육청 × 초·중·고 × 더 많은 학교 × 2개 학기를 폴링하며 누적 고유메뉴 포화곡선을 출력.
배치마다 '누적 고유 / 이번 신규 / 학교당 신규율'을 찍어 포화 추세를 본다. (keyless·예의 sleep)
출력 → /tmp/neis-ceiling.json { menu: freq }
"""
import json, re, time, urllib.request, urllib.parse
from collections import Counter

BASE = 'https://open.neis.go.kr/hub'
REGIONS = ['B10','J10','C10','D10','E10','F10','G10','H10','I10','K10','M10','N10','P10','Q10','R10','S10','T10']
KINDS = ['초등학교', '중학교', '고등학교']
SCHOOLS_PER = 14            # 지역·학교급당
RANGES = [('20240304','20240712'), ('20240901','20241228')]   # 1·2학기 중식
ALLERGEN = re.compile(r'\s*\([0-9.\s]+\)'); PAREN = re.compile(r'\s*\([^)]*\)')

def get(path, params):
    url = f'{BASE}/{path}?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception:
        return None

def schools(region, kind):
    d = get('schoolInfo', {'Type': 'json', 'pSize': SCHOOLS_PER, 'ATPT_OFCDC_SC_CODE': region, 'SCHUL_KND_SC_NM': kind})
    if not d or 'schoolInfo' not in d: return []
    return [(region, r['SD_SCHUL_CODE']) for r in d['schoolInfo'][1]['row']]

def meals(region, code, fr, to):
    d = get('mealServiceDietInfo', {'Type': 'json', 'pSize': 300, 'ATPT_OFCDC_SC_CODE': region,
            'SD_SCHUL_CODE': code, 'MMEAL_SC_CODE': 2, 'MLSV_FROM_YMD': fr, 'MLSV_TO_YMD': to})
    if not d or 'mealServiceDietInfo' not in d: return []
    out = []
    for r in d['mealServiceDietInfo'][1]['row']:
        for dish in (r.get('DDISH_NM') or '').split('<br/>'):
            nm = PAREN.sub('', ALLERGEN.sub('', dish)).strip()
            nm = re.sub(r'^[*\-·&\s]+', '', nm)
            if nm and len(nm) >= 2: out.append(nm)
    return out

counts = Counter(); n_school = 0; prev = 0
for region in REGIONS:
    for kind in KINDS:
        for reg, code in schools(region, kind):
            for fr, to in RANGES:
                counts.update(meals(reg, code, fr, to))
                time.sleep(0.18)
            n_school += 1
    cur = len(counts); new = cur - prev; prev = cur
    rate = round(new / max(1, SCHOOLS_PER * len(KINDS)), 1)
    print(f'{region} 완료 · 누적학교 {n_school} · 누적고유 {cur} · 이번신규 +{new} · 학교당신규 {rate}', flush=True)

json.dump(dict(counts), open('/tmp/neis-ceiling.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'\n총 학교 {n_school} · 고유메뉴 {len(counts)} · 2회+ {sum(1 for c in counts.values() if c>=2)} · 5회+ {sum(1 for c in counts.values() if c>=5)}')
print('상위20:', ' · '.join(f'{m}({c})' for m, c in counts.most_common(20)))
