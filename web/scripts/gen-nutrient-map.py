#!/usr/bin/env python3
"""
gen-nutrient-map.py — 농진청 국가표준식품성분표 10.4 → 식재료별 영양소 정밀 매핑 생성.

각 식재료를 농진청 원물(생것 우선)에 매칭하고, 100g당 값이 KDRI 1일 권장의 15%(=공급원) 이상인
영양소를 그 식재료의 '커버 영양소'로 본다. 결과 → web/lib/nutrient-map.generated.json
(런타임 nutrientsOf가 이 정밀맵을 우선 사용 → 빗대기/미매핑 최소화. 불소·콜린·크롬은 농진청 미수록=제외)

실행: cd web && python3 scripts/gen-nutrient-map.py
원천: 01_참고자료/D_농진청성분DB (또는 ~/Downloads). 임계값(0.15)은 튜닝 가능.
"""
import json, re, os, sys
import openpyxl

XLSX_CANDIDATES = [
    os.path.expanduser('~/Desktop/편식극복키트/01_참고자료/D_농진청성분DB/국가표준식품성분표_10개정판_DB10.4.xlsx'),
    os.path.expanduser('~/Downloads/식품성분표(10개정판).xlsx'),
]
XLSX = next((p for p in XLSX_CANDIDATES if os.path.exists(p)), None)
if not XLSX: sys.exit('농진청 엑셀을 찾을 수 없음: ' + ' | '.join(XLSX_CANDIDATES))

# 내부 라벨 → (농진청 col, KDRI 1일 권장(농진청 단위와 동일 단위))
NUTRIENTS = {
  '단백질':(7,20.0),'탄수화물':(10,130.0),'식이섬유':(18,10.0),'수분':(6,1000.0),
  '칼슘':(21,500.0),'철':(22,6.0),'마그네슘':(23,70.0),'인':(24,450.0),'칼륨':(25,1500.0),
  '아연':(27,3.0),'구리':(28,0.29),'망간':(29,1.5),'셀레늄':(30,23.0),'몰리브덴':(31,10.0),'요오드':(32,70.0),
  '비타민A':(33,250.0),'비타민B1':(36,0.5),'비타민B2':(37,0.5),'니아신':(39,6.0),'판토텐산':(42,2.0),
  '비타민B6':(43,0.6),'비오틴':(45,9.0),'엽산':(46,150.0),'비타민B12':(49,0.9),'비타민C':(50,40.0),
  '비타민D':(51,5.0),'비타민E':(54,5.0),'비타민K':(63,25.0),'리놀레산':(118,6.0),'α-리놀렌산':(119,0.6),
}
EPA_COL, DHA_COL, OMEGA3_KDRI = 125, 128, 0.15  # EPA+DHA g, KDRI 150mg
THRESH = 0.15  # 공급원 기준 = 1일 권장의 15%

def num(v):
    try: return float(v)
    except: return 0.0

# 정확 타깃 — 퍼지매칭이 틀리는 핵심 식재료는 농진청 식품명을 명시(완전일치 사용)
EXPLICIT_TARGET = {
  '소고기':'소고기, 수입산, 목심(목심살), 생것','쇠고기':'소고기, 수입산, 목심(목심살), 생것',
  '콩(대두)':'대두, 노란색, 말린것','대두':'대두, 노란색, 말린것','검은콩':'대두, 검은색, 서리태, 말린것',
  '식용유':'콩기름','콩기름':'콩기름','들깨':'들깨, 말린것','아몬드':'아몬드, 볶은것',
}
# 흔한 별칭(우리 표준명 → 농진청 표기 핵심어)
ALIAS = {'계란':'달걀','달걀':'달걀','돼지고기':'돼지','닭고기':'닭','메추리알':'메추리알',
  '파스타':'스파게티면','고추가루':'고춧가루','레몬 과즙':'레몬',
  '시래기':'무청, 시래기','요거트':'요구르트','요구르트':'요구르트'}
PROC = ('음료','소스','절임','단무지','육수','튀김','과자','빵','케이크','스프','시리얼','젓','장아찌','통조림','주스','케첩','샐러드','피자','말랭이','조미','볶음','유','분말','가루')

def load_pool_names():
    names=set()
    # 표준명: nutrition.ts NUTRI_MAP 키
    try:
        t=open('lib/nutrition.ts',encoding='utf-8').read()
        block=re.search(r'NUTRI_MAP[^{]*\{(.*?)\n\};', t, re.S)
        if block:
            for m in re.finditer(r"'([^']+)'\s*:", block.group(1)): names.add(m.group(1))
    except Exception as e: print('NUTRI_MAP 추출 실패', e)
    # 풀: ingredients-light.json
    for p in ['public/ingredients-light.json','../data_ingredient_pool_enriched.json']:
        try:
            d=json.load(open(p,encoding='utf-8'))
            arr=d.get('ingredients') if isinstance(d,dict) else d
            if isinstance(d,dict) and not arr:
                arr=next((v for v in d.values() if isinstance(v,list)),[])
            for it in arr:
                if isinstance(it,dict) and it.get('nm'): names.add(it['nm'])
        except Exception: pass
    return sorted(names)

def main():
    wb=openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws=wb['국가표준식품성분 Database 10.4']; itr=ws.iter_rows(values_only=True); next(itr); next(itr)
    rows=[r for r in itr if r and r[3]]
    def first_token(nm): return re.split(r'[ ,(]', str(nm))[0]

    by_name={str(r[3]):r for r in rows}
    names=load_pool_names()
    out={}; report={'matched':0,'low':0,'miss':0,'explicit':0}
    for nm in names:
        # 0) 정확 타깃 우선
        if nm in EXPLICIT_TARGET and EXPLICIT_TARGET[nm] in by_name:
            r=by_name[EXPLICIT_TARGET[nm]]; fn=EXPLICIT_TARGET[nm]
            covered=[l for l,(c,k) in NUTRIENTS.items() if num(r[c])>=THRESH*k]
            if (num(r[EPA_COL])+num(r[DHA_COL]))>=THRESH*OMEGA3_KDRI: covered.append('오메가3')
            out[nm]={'nong':fn,'conf':'high','n':covered}; report['explicit']+=1; continue
        core=ALIAS.get(nm, nm)
        core=re.split(r'[ ,(]', core)[0]
        # 후보: 식품명에 core 포함, 가공어 회피, '생것' 우선
        cands=[]
        for r in rows:
            fn=str(r[3])
            if core and core in fn:
                proc=any(p in fn for p in PROC)
                raw='생것' in fn
                cands.append((0 if raw and not proc else (1 if not proc else 2), -1 if first_token(fn)==core else 0, fn, r))
        if not cands:
            report['miss']+=1; continue
        cands.sort(key=lambda x:(x[0],x[1]))
        conf='high' if cands[0][0]==0 else ('mid' if cands[0][0]==1 else 'low')
        if conf=='low': report['low']+=1
        else: report['matched']+=1
        _,_,fn,r=cands[0]
        covered=[]
        for label,(col,kdri) in NUTRIENTS.items():
            if num(r[col]) >= THRESH*kdri: covered.append(label)
        if (num(r[EPA_COL])+num(r[DHA_COL])) >= THRESH*OMEGA3_KDRI: covered.append('오메가3')
        out[nm]={'nong':fn,'conf':conf,'n':covered}
    json.dump(out, open('lib/nutrient-map.generated.json','w',encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'생성 {len(out)}종 → lib/nutrient-map.generated.json')
    print(f'  매칭 high/mid {report["matched"]} · low(검수요) {report["low"]} · 미매칭 {report["miss"]}')
    print('  예시:', {k:out[k]['n'][:6] for k in list(out)[:4]})

if __name__=='__main__': main()
