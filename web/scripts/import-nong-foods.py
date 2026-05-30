#!/usr/bin/env python3
"""
import-nong-foods.py — 농진청 국가표준식품성분표 10.4(3,272식품) → Supabase public.nong_foods 적재.

각 식품: code(DB색인)·name(원형)·food_group·rep(대표 식재료=첫 토큰, 부위 정규화)·
nutrients(100g당 19종 jsonb)·covers(1일 KDRI 15%↑ 공급 영양소). service_role 업서트(멱등, on_conflict=code).
실행: cd web && python3 scripts/import-nong-foods.py   (먼저 sql/2026-05-31_nong_foods.sql DDL 필요)
"""
import json, os, re, sys, urllib.request, urllib.error
import openpyxl

XLSX = next((p for p in [
    os.path.expanduser('~/Desktop/편식극복키트/01_참고자료/D_농진청성분DB/국가표준식품성분표_10개정판_DB10.4.xlsx'),
    os.path.expanduser('~/Downloads/식품성분표(10개정판).xlsx'),
] if os.path.exists(p)), None)
if not XLSX: sys.exit('농진청 엑셀 없음')

# .env.local에서 Supabase URL·service key
env = {}
for fn in ['.env.local', '.env']:
    if os.path.exists(fn):
        for line in open(fn):
            m = re.match(r'\s*([A-Z_]+)\s*=\s*(.+?)\s*$', line)
            if m: env.setdefault(m.group(1), m.group(2).strip().strip('"'))
URL = env.get('NEXT_PUBLIC_SUPABASE_URL'); KEY = env.get('SUPABASE_SERVICE_ROLE_KEY')
if not URL or not KEY: sys.exit('env에 SUPABASE URL/SERVICE_ROLE_KEY 없음')

COL = {'energy_kcal':5,'water_g':6,'protein_g':7,'fat_g':8,'carb_g':10,'sugar_g':11,'fiber_g':18,
'calcium_mg':21,'iron_mg':22,'magnesium_mg':23,'phosphorus_mg':24,'potassium_mg':25,'sodium_mg':26,
'zinc_mg':27,'selenium_ug':30,'vitA_ug':33,'vitB12_ug':49,'vitC_mg':50,'vitD_ug':51}
# 커버(15%) 판정 — 라벨:(col, KDRI 1일)
KDRI = {'단백질':(7,20.0),'탄수화물':(10,130.0),'식이섬유':(18,10.0),'칼슘':(21,500.0),'철':(22,6.0),
'마그네슘':(23,70.0),'인':(24,450.0),'칼륨':(25,1500.0),'아연':(27,3.0),'구리':(28,0.29),'망간':(29,1.5),
'셀레늄':(30,23.0),'몰리브덴':(31,10.0),'요오드':(32,70.0),'비타민A':(33,250.0),'비타민B1':(36,0.5),
'비타민B2':(37,0.5),'니아신':(39,6.0),'판토텐산':(42,2.0),'비타민B6':(43,0.6),'비오틴':(45,9.0),
'엽산':(46,150.0),'비타민B12':(49,0.9),'비타민C':(50,40.0),'비타민D':(51,5.0),'비타민E':(54,5.0),'비타민K':(63,25.0)}

def num(v):
    try: return round(float(v),3)
    except: return None

wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
ws = wb['국가표준식품성분 Database 10.4']; itr = ws.iter_rows(values_only=True); next(itr); next(itr)
rows = []
seen = set()
for r in itr:
    if not r or not r[3]: continue
    name = str(r[3]).strip()
    code = str(r[0]).strip() if r[0] not in (None, '') else name
    if code in seen: code = f'{code}#{len(rows)}'   # 색인 중복 방지
    seen.add(code)
    rep = re.split(r'[,(]', name)[0].strip()
    nutrients = {k: num(r[c]) for k, c in COL.items()}
    covers = [l for l,(c,k) in KDRI.items() if (num(r[c]) or 0) >= 0.15*k]
    if (num(r[125]) or 0) + (num(r[128]) or 0) >= 0.15*0.15: covers.append('오메가3')
    rows.append({'code':code,'name':name,'food_group':str(r[2]) if r[2] else None,'rep':rep,'nutrients':nutrients,'covers':covers})

print(f'준비: {len(rows)}식품 (대표 식재료 {len(set(x["rep"] for x in rows))}종)')

# 배치 업서트
endpoint = f'{URL}/rest/v1/nong_foods?on_conflict=code'
ok = 0
for i in range(0, len(rows), 500):
    batch = rows[i:i+500]
    data = json.dumps(batch, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(endpoint, data=data, method='POST', headers={
        'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'})
    try:
        urllib.request.urlopen(req); ok += len(batch); print(f'  업서트 {ok}/{len(rows)}')
    except urllib.error.HTTPError as e:
        print('HTTPError', e.code, e.read().decode()[:300]); sys.exit(1)
print(f'✅ 완료 {ok}식품 → nong_foods')
