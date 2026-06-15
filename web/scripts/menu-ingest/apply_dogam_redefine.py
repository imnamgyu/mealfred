#!/usr/bin/env python3
"""
영유아 식단 적재 파이프라인 — 3단계: 도감 재정의안을 SQL ingredients에 반영

입력:  --redefine dogam_redefine.csv   (parse_and_aggregate.py 산출, 사람이 한번 검토)
       --promoted screen_result.json   (안전스크린 워크플로 산출: 승격확정 12 등)
옵션:  --dry  (DB 안 건드리고 변경 미리보기만)

동작:
 1) ingredients 현재 등급 **스냅샷 저장**(롤백용) → ingredients_snapshot_<날짜>.json
 2) 도감 식재료 2축 재등급: meta(youa_pct/youa_grade/combined_grade/age_flag) + 상향·신규는 grade_star/grade_label 갱신
    - **하향검토는 자동변경 안 함**(meta 플래그만) — 사람 검토 필요
 3) 승격확정 식재료를 tier=dogam 으로 추가/승격

교훈(중요):
 - PostgREST 벌크 upsert(merge-duplicates)는 **부분 키면 NOT NULL 위반** → 기존행 수정은 반드시 **PATCH per row**
 - URL 필터에 한글 들어가면 urllib.parse.quote 필요(이모지 grade_star eq 필터는 매칭 안 됨)
"""
import sys, os, re, json, csv, argparse, uuid, urllib.request, urllib.error, urllib.parse
from datetime import date

GSTAR = {'매일군':'⭐⭐⭐','자주군':'⭐⭐','가끔군':'⭐','드물군':'🔸'}
GLABEL = {'매일군':'필수','자주군':'권장','가끔군':None,'드물군':None}
FG = {'잎채소':'vitaminA','꽃채소(십자화과)':'vitaminA','열매채소':'vitaminA',
      '뿌리채소':'other','버섯':'other','과일':'fruit','채소':'vitaminA'}

def load_env():
    web = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    env = {}
    for line in open(os.path.join(web, '.env.local')):
        m = re.match(r'\s*([A-Z_]+)\s*=\s*(.+?)\s*$', line)
        if m: env.setdefault(m.group(1), m.group(2).strip().strip('"'))
    return env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']

URL, KEY = load_env()
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def getall(p):
    out, off = [], 0
    while True:
        d = json.loads(urllib.request.urlopen(urllib.request.Request(
            URL+'/rest/v1/'+urllib.parse.quote(p, safe='/?=&.*->')+f'&offset={off}&limit=1000', headers=H), timeout=40).read())
        out += d
        if len(d) < 1000: break
        off += 1000
    return out

def patch(iid, body):
    try:
        urllib.request.urlopen(urllib.request.Request(URL+f'/rest/v1/ingredients?id=eq.{iid}',
            data=json.dumps(body).encode(), method='PATCH', headers={**H,'Prefer':'return=minimal'}), timeout=30)
        return True
    except urllib.error.HTTPError as e:
        print('  patch fail', e.code, e.read().decode()[:160]); return False

def insert(rows):
    try:
        urllib.request.urlopen(urllib.request.Request(URL+'/rest/v1/ingredients',
            data=json.dumps(rows).encode(), method='POST', headers={**H,'Prefer':'return=minimal'}), timeout=60)
        return len(rows)
    except urllib.error.HTTPError as e:
        print('  insert fail', e.code, e.read().decode()[:160]); return 0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--redefine', required=True)
    ap.add_argument('--promoted', help='안전스크린 워크플로 결과 JSON (result.promoted)')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    cur = getall('ingredients?select=id,name,slug,grade_label,grade_star,food_group,meta')
    n2 = {}
    for x in cur:
        n2[x['name']] = x
        if x.get('slug'): n2.setdefault(x['slug'], x)
    snap = f'ingredients_snapshot_{date.today().isoformat()}.json'
    json.dump(cur, open(snap, 'w'), ensure_ascii=False)
    print(f'스냅샷 저장(롤백용): {snap} ({len(cur)}행)')

    # 도감 2축 재등급
    rows = list(csv.reader(open(a.redefine)))
    secA = [r for r in rows if len(r) >= 10 and r[0] not in ('식재료',) and not r[0].startswith(('도감','【','■'))]
    okA = 0
    for r in secA:
        ing, fg, yp, yg, el, eg, comb, flag, curg, act = r[:10]
        x = n2.get(ing)
        if not x or comb not in GSTAR: continue
        meta = dict(x.get('meta') or {})
        meta.update({'youa_pct': float(yp), 'youa_grade': yg, 'combined_grade': comb,
                     'age_flag': flag, 'redefine': date.today().isoformat()})
        body = {'meta': meta}
        if act.startswith('신규등급') or act.startswith('상향'):
            body['grade_star'] = GSTAR[comb]; body['grade_label'] = GLABEL[comb]
        elif act.startswith('하향검토'):
            meta['review_downgrade'] = comb       # 자동 하향 안 함
        if a.dry: okA += 1
        elif patch(x['id'], body): okA += 1
    print(f'도감 2축 재등급: {okA}/{len(secA)}' + (' (dry)' if a.dry else ''))

    # 승격
    if a.promoted:
        pr = json.load(open(a.promoted))
        promoted = pr.get('promoted') or pr.get('result', {}).get('promoted') or []
        ins, upd = [], 0
        for x in promoted:
            ing = x['ing']; yg = x.get('youa_grade') or yu_from(x); fg = FG.get(x.get('proposed_food_group',''), 'other')
            cook = (x.get('verified') or {}).get('risk_flag', '') or x.get('youa_risk', '')
            meta = {'tier':'dogam','youa_grade':yg,'promoted':date.today().isoformat(),
                    'cook_note': cook if cook not in ('없음','') else ''}
            if ing in n2:
                e = n2[ing]; m2 = dict(e.get('meta') or {}); m2.update(meta)
                if not a.dry: upd += patch(e['id'], {'grade_star':GSTAR.get(yg),'grade_label':GLABEL.get(yg),'meta':m2})
                else: upd += 1
            else:
                ins.append({'id':str(uuid.uuid4()),'name':ing,'slug':ing,'status':'verified','source':'menu-ingest',
                    'food_group':fg,'grade_star':GSTAR.get(yg),'grade_label':GLABEL.get(yg),'meta':{**meta,'from':'영유아표준식단'}})
        n_ins = len(ins) if a.dry else insert(ins) if ins else 0
        print(f'승격: 기존→도감 {upd} · 신규 {n_ins}')

    print('\n완료. 롤백 필요시 스냅샷의 grade_label/grade_star로 PATCH 복원.')

def yu_from(x):
    p = x.get('yu_pct', 0)
    return '매일군' if p>=70 else ('자주군' if p>=35 else ('가끔군' if p>=10 else '드물군'))

if __name__ == '__main__':
    main()
