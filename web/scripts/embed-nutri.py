#!/usr/bin/env python3
"""
embed-nutri.py — 도감 상세 KDRI 바(.nutri per-100g)를 .nutri 없는 풀 항목에만 채움(gap-fill).
농진청 10.4에서 gen-nutrient-map.py와 동일 매칭(EXPLICIT_TARGET/ALIAS/생것우선·가공회피)으로 100g당 값 추출.
기존 .nutri 보유 항목은 건드리지 않음. 실행: cd web && python3 scripts/embed-nutri.py
"""
import json, re, os, sys
import openpyxl

XLSX = next((p for p in [
    os.path.expanduser('~/Desktop/편식극복키트/01_참고자료/D_농진청성분DB/국가표준식품성분표_10개정판_DB10.4.xlsx'),
    os.path.expanduser('~/Downloads/식품성분표(10개정판).xlsx'),
] if os.path.exists(p)), None)
if not XLSX: sys.exit('농진청 엑셀 없음')

NUTRI_COLS = {  # .nutri 필드 → 농진청 컬럼 인덱스(헤더 확인됨)
    'energy_kcal': 5, 'water_g': 6, 'protein_g': 7, 'fat_g': 8, 'carb_g': 10, 'sugar_g': 11, 'fiber_g': 18,
    'calcium_mg': 21, 'iron_mg': 22, 'magnesium_mg': 23, 'phosphorus_mg': 24, 'potassium_mg': 25, 'sodium_mg': 26,
    'zinc_mg': 27, 'selenium_ug': 30, 'vitA_ug': 33, 'vitB12_ug': 49, 'vitC_mg': 50, 'vitD_ug': 51,
}
EXPLICIT_TARGET = {
    '소고기': '소고기, 수입산, 목심(목심살), 생것', '쇠고기': '소고기, 수입산, 목심(목심살), 생것',
    '콩(대두)': '대두, 노란색, 말린것', '대두': '대두, 노란색, 말린것', '검은콩': '대두, 검은색, 서리태, 말린것',
    '식용유': '콩기름', '콩기름': '콩기름', '들깨': '들깨, 말린것', '아몬드': '아몬드, 볶은것', '우유': '우유',
}
ALIAS = {'계란': '달걀', '달걀': '달걀', '돼지고기': '돼지', '닭고기': '닭', '메추리알': '메추리알',
    '파스타': '스파게티면', '고추가루': '고춧가루', '레몬 과즙': '레몬',
    '시래기': '무청, 시래기', '무시래기': '무청', '호박고지': '애호박', '배추김치': '김치',
    '요거트': '요구르트', '요구르트': '요구르트', '적채': '양배추', '검은깨': '참깨'}
PROC = ('음료', '소스', '절임', '단무지', '육수', '튀김', '과자', '빵', '케이크', '스프', '시리얼', '젓', '장아찌', '통조림', '주스', '케첩', '샐러드', '피자', '말랭이', '조미', '볶음', '유', '분말', '가루')

def num(v):
    try: return round(float(v), 2)
    except: return 0.0

wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
ws = wb['국가표준식품성분 Database 10.4']; itr = ws.iter_rows(values_only=True); next(itr); next(itr)
rows = [r for r in itr if r and r[3]]
by_name = {str(r[3]): r for r in rows}
def first_token(nm): return re.split(r'[ ,(]', str(nm))[0]

def match(nm):
    if nm in EXPLICIT_TARGET and EXPLICIT_TARGET[nm] in by_name: return by_name[EXPLICIT_TARGET[nm]]
    core = re.split(r'[ ,(]', ALIAS.get(nm, nm))[0]
    cands = []
    for r in rows:
        fn = str(r[3])
        if core and core in fn:
            proc = any(p in fn for p in PROC); raw = '생것' in fn
            cands.append((0 if raw and not proc else (1 if not proc else 2), -1 if first_token(fn) == core else 0, r))
    if not cands: return None
    cands.sort(key=lambda x: (x[0], x[1])); return cands[0][2]

enr = json.load(open('../data_ingredient_pool_enriched.json', encoding='utf-8'))
filled, miss = 0, []
for p in enr['pool']:
    if p.get('nutri') and p['nutri'].get('protein_g') is not None: continue  # 이미 있음 — 보존
    r = match(p['nm'])
    if not r: miss.append(p['nm']); continue
    p['nutri'] = {k: num(r[c]) for k, c in NUTRI_COLS.items()}
    p['nong_name'] = str(r[3]); p['source'] = '농진청 v10.4'
    filled += 1
json.dump(enr, open('../data_ingredient_pool_enriched.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(f'.nutri 채움: {filled}종 · 미매칭: {", ".join(miss) or "없음"}')
