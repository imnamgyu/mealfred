#!/usr/bin/env python3
"""gen-food-graph.py — 음식↔식재료 궁합 네트워크(무방향) 생성.

근거(하이브리드 base):
  · pair(궁합/곁들임) = 우리 레시피 코퍼스(B_레시피DB ~4,700)에서 '같은 레시피에 함께 쓰인 횟수'(동시출현).
    → 의견 아님, 증거 기반. basis="같이 쓰는 레시피 N개". (런타임 웹서치 폴백은 별도 — 없는 조합만 채움)
  · bridge(닮음/사촌) = 맛·식감·색이 닮은 대체 사촌. 동시출현으로 안 잡혀서(대체재라 같은 레시피에 거의 같이 안 남)
    고신뢰 큐레이션 시드로 둔다(textbook food-chaining). 롱테일은 웹 폴백.

출력 → web/lib/food-graph.json  { nodes:[...], edges:[{a,b,kind,strength,basis,count?}] }
재생성: python3 scripts/gen-food-graph.py
"""
import json, re
from collections import defaultdict
from itertools import combinations

BASE = '/Users/ing/Desktop/편식극복키트/01_참고자료/B_레시피DB'
WEB = '/Users/ing/Desktop/dev/web/landing_page/deploy/web'

FILES = [
    '아동기_레시피DB.json', '유아기_월별식단_레시피DB.json',
    '유아기_레시피DB.json', '유아기_레시피DB_추가.json',
    '영아기_레시피DB.json', '영아기_레시피DB_추가.json',
]
recipes = []
for f in FILES:
    try:
        d = json.load(open(f'{BASE}/{f}'))
        arr = d if isinstance(d, list) else (d.get('recipes') or next((v for v in d.values() if isinstance(v, list)), []))
        recipes += [r for r in arr if isinstance(r, dict)]
    except Exception as e:
        print('skip', f, e)

도감 = [x['nm'] for x in json.load(open(f'{WEB}/public/ingredients-light.json'))['ingredients']]
도감set = set(도감)

# build-foods-recipes.py와 동일한 양념 블로클리스트 + 표준명 매핑
SEASONING = set('마늘 파 대파 쪽파 실파 소금 간장 진간장 설탕 흑설탕 물엿 조청 고춧가루 참깨 깨소금 참기름 들기름 콩기름 식용유 카놀라유 포도씨유 올리브유 후추 후춧가루 식초 맛술 미림 청주 정종 생강 고추장 된장 쌈장 춘장 올리고당 꿀 전분 녹말 감자전분 밀가루 부침가루 튀김가루 빵가루 케첩 마요네즈 굴소스 액젓 멸치액젓 까나리액젓 새우젓 고추 청양고추 홍고추 풋고추 깨 들깨 미원 다시다 식소다 베이킹파우더 이스트 물 육수 버터 마가린 양파'.split())
# 양파: 거의 모든 레시피에 깔리는 허브성 → pair 허브 노이즈라 제외(브릿지 앵커로도 안 쓰임)

def norm(raw):
    head = re.split(r'[,_(]', raw)[0].strip().replace(' ', '')
    if head in 도감set:
        return head
    for nm in 도감:  # 부분 포함 (잔멸치→멸치)
        if nm in head:
            return nm
    return None

# ── pair: 레시피별 메인 식재료 집합 → 동시출현 카운트 ──
co = defaultdict(int)
node_recipes = defaultdict(int)
n_used = 0
for r in recipes:
    ings = r.get('ingredients', [])
    total = sum(i.get('amount_g', 0) or 0 for i in ings) or 1
    mains = set()
    for idx, ing in enumerate(ings):
        nm = norm(ing.get('name', ''))
        if not nm or nm in SEASONING:
            continue
        amt = ing.get('amount_g', 0) or 0
        share = amt / total
        if not (amt >= 8 or share >= 0.15 or (idx <= 1 and amt >= 3)):
            continue
        mains.add(nm)
    if len(mains) < 2:
        continue
    n_used += 1
    for nm in mains:
        node_recipes[nm] += 1
    for a, b in combinations(sorted(mains), 2):
        co[(a, b)] += 1

MIN_CO = 4
pair_raw = [(a, b, c) for (a, b), c in co.items() if c >= MIN_CO]
# 노드별 top-K 이웃만(허브 폭발 방지)
TOPK = 14
deg_keep = defaultdict(list)
for a, b, c in sorted(pair_raw, key=lambda x: -x[2]):
    deg_keep[a].append((b, c)); deg_keep[b].append((a, c))
keep_pairs = set()
for nd, lst in deg_keep.items():
    for b, c in lst[:TOPK]:
        keep_pairs.add(tuple(sorted((nd, b))))

def pair_strength(c):
    return 3 if c >= 15 else (2 if c >= 7 else 1)

# ⭐ lift(우연 대비 동시출현) — base-rate(흔한 식재료) 보정. lift = c*N / (na*nb). 1.0=우연·>1=실제 연관.
#   raw count strength만으론 흔한 식재료(달걀·밥)가 우연 동시출현으로 '강함' 둔갑(밥+달걀 count51인데 lift0.75=우연 이하).
#   grade='strong'(추천 사용)=strength≥2 AND lift≥1.2 · 'weak'(차단)=strength1 또는 lift<1.0. 떡+달걀 lift 0.72 → weak.
N = n_used or 1
LIFT_STRONG, LIFT_MED = 1.2, 1.0
def pair_lift(a, b, c):
    na, nb = node_recipes[a], node_recipes[b]
    return round(c * N / (na * nb), 2) if na and nb else 0.0
def pair_grade(s, lift):
    if s >= 2 and lift >= LIFT_STRONG: return 'strong'
    if s >= 2 and lift >= LIFT_MED: return 'medium'
    return 'weak'

pair_edges = []
for a, b in sorted(keep_pairs):
    c = co[(a, b)] if (a, b) in co else co[(b, a)]
    s = pair_strength(c); lift = pair_lift(a, b, c)
    pair_edges.append({'a': a, 'b': b, 'kind': 'pair', 'strength': s, 'lift': lift, 'grade': pair_grade(s, lift), 'count': c, 'basis': f'같이 쓰는 레시피 {c}개'})

# ── bridge: 고신뢰 사촌 시드(맛·식감·색 닮음). 양끝 모두 도감에 있어야 채택 ──
BRIDGE_SEED = [
    # 포슬·달큰 뿌리/전분
    ('고구마', '단호박'), ('단호박', '감자'), ('감자', '고구마'), ('단호박', '호박'), ('토란', '감자'), ('고구마', '밤'),
    # 고기
    ('닭고기', '돼지고기'), ('돼지고기', '소고기'), ('소고기', '닭고기'), ('닭고기', '오리고기'), ('소고기', '오리고기'),
    # 유제품
    ('우유', '요구르트'), ('요구르트', '치즈'), ('우유', '치즈'), ('치즈', '크림'), ('우유', '크림'),
    # 흰살생선
    ('명태', '대구'), ('대구', '가자미'), ('가자미', '갈치'), ('명태', '갈치'), ('임연수어', '가자미'),
    # 등푸른생선
    ('고등어', '삼치'), ('삼치', '연어'), ('고등어', '연어'), ('가다랑어', '고등어'),
    # 조개·갑각
    ('바지락', '홍합'), ('홍합', '꼬막'), ('꼬막', '조개'), ('조개', '바지락'), ('굴', '홍합'),
    ('새우', '게'), ('게', '게맛살'), ('새우', '게맛살'), ('주꾸미', '낙지'), ('오징어', '낙지'),
    # 부드러운 잎채소
    ('시금치', '근대'), ('근대', '아욱'), ('시금치', '청경채'), ('청경채', '배추'), ('배추', '양배추'),
    ('양배추', '적채'), ('상추', '양상추'), ('케일', '시금치'), ('얼갈이배추', '배추'), ('취나물', '참나물'),
    # 콩류
    ('콩(대두)', '두부'), ('두부', '콩나물'), ('검은콩', '콩(대두)'), ('병아리콩', '렌틸콩'),
    ('렌틸콩', '강낭콩'), ('완두', '강낭콩'), ('팥', '녹두'), ('대두', '검은콩'),
    # 과일 — 아삭/단단
    ('사과', '배'), ('배', '감'), ('포도', '블루베리'), ('수박', '멜론'), ('참외', '멜론'),
    ('귤', '오렌지'), ('오렌지', '레몬'), ('딸기', '토마토'), ('키위', '참외'),
    # 과일 — 부드러움
    ('바나나', '아보카도'), ('복숭아', '감'),
    # 곡물
    ('멥쌀', '찹쌀'), ('현미', '흑미'), ('현미', '귀리'), ('보리', '귀리'), ('기장', '조'), ('조', '수수'),
    ('빵', '호밀빵'), ('국수', '당면'), ('국수', '파스타'), ('파스타', '메밀 국수'), ('멥쌀떡', '찹쌀떡'),
    # 버섯
    ('느타리버섯', '큰느타리버섯(새송이버섯)'), ('표고버섯', '양송이버섯'), ('팽이버섯', '느타리버섯'),
    ('양송이버섯', '느타리버섯'),
    # 해조류
    ('김', '미역'), ('미역', '다시마'), ('다시마', '톳'), ('톳', '매생이'), ('파래', '김'),
    # 열매채소
    ('오이', '애호박'), ('가지', '애호박'), ('피망', '파프리카'), ('브로콜리', '콜리플라워'),
    # 뿌리
    ('무', '순무'), ('무', '게걸무'), ('당근', '비트'), ('우엉', '연근'), ('도라지', '더덕'),
    # 견과
    ('아몬드', '호두'), ('호두', '땅콩'), ('해바라기씨', '아몬드'), ('밤', '땅콩'),
    # 도감 중복·고립 보강(같은 것/거의 같은 것)
    ('계란', '달걀'), ('메추리알', '달걀'), ('멥쌀밥', '멥쌀'), ('전복', '굴'), ('전복', '홍합'),
    ('재첩', '바지락'), ('무순', '무'), ('무시래기', '무'), ('호박고지', '애호박'), ('배추김치', '김치'),
    ('열무', '얼갈이배추'), ('냉이', '달래'), ('쑥', '쑥갓'), ('파인애플', '키위'),
    # ── 확장 사촌 (2026-06 추가 · 적대검증 통과 64쌍) ──
    # 고립 노드 커버
    ('숙주나물', '콩나물'), ('고사리', '취나물'), ('고사리', '무시래기'), ('부추', '마늘종'),
    ('옥수수', '완두'), ('밀', '보리'), ('밀', '귀리'), ('소시지', '햄'), ('햄', '베이컨'), ('어묵', '게맛살'),
    # 포슬·달큰 뿌리/전분 보강
    ('토란', '고구마'), ('돼지감자', '감자'), ('파스닙', '당근'), ('파스닙', '감자'), ('콜라비', '무'), ('콜라비', '순무'),
    # 잎채소·줄기
    ('비름나물', '시금치'), ('곤드레', '취나물'), ('곤드레', '고사리'), ('미나리', '셀러리'), ('두릅', '아스파라거스'),
    ('방울양배추', '양배추'), ('방울양배추', '브로콜리'), ('두릅', '곤드레'),
    # 버섯
    ('만가닥버섯', '느타리버섯'), ('잎새버섯', '느타리버섯'), ('목이버섯', '표고버섯'),
    # 흰살생선
    ('광어', '가자미'), ('우럭', '광어'), ('농어', '우럭'), ('숭어', '농어'),
    # 두족
    ('오징어', '주꾸미'),
    # 콩류
    ('동부콩', '강낭콩'), ('동부콩', '팥'), ('녹두', '동부콩'),
    # 과일
    ('자두', '복숭아'), ('살구', '복숭아'), ('살구', '자두'), ('체리', '포도'), ('라즈베리', '블루베리'), ('라즈베리', '딸기'),
    ('망고', '복숭아'), ('망고', '감'), ('무화과', '감'),
    # 곡물
    ('메밀쌀', '현미'), ('퀴노아', '아마란스'), ('퀴노아', '기장'), ('아마란스', '조'),
    # 견과·씨앗
    ('피스타치오', '아몬드'), ('피스타치오', '호두'), ('호박씨', '해바라기씨'), ('검은깨', '참깨'), ('들깨', '참깨'), ('잣', '호두'),
    # 해조류
    ('모자반', '톳'), ('모자반', '미역'), ('매생이', '파래'),
    # 유제품·유지
    ('두유', '우유'), ('버터', '크림'),
    # 열매채소
    ('애호박', '호박'),
    # 고기·알
    ('양고기', '소고기'), ('칠면조고기', '닭고기'), ('양고기', '돼지고기'), ('계란', '메추리알'),
]
bridge_edges = []
seen_b = set()
for a, b in BRIDGE_SEED:
    if a in 도감set and b in 도감set and a != b:
        key = tuple(sorted((a, b)))
        if key in seen_b:
            continue
        seen_b.add(key)
        # verified=True — 전부 수기 고신뢰 사촌(동일 식품군 근접·괴식 없음). 푸드체이닝 chain 추천에 사용.
        bridge_edges.append({'a': key[0], 'b': key[1], 'kind': 'bridge', 'strength': 3, 'verified': True, 'basis': '맛·식감이 닮은 사촌'})

# bridge가 pair와 겹치면 둘 다 둔다(관계 종류가 다름) — UI에서 우선순위로 처리
edges = bridge_edges + pair_edges
nodes = sorted({e['a'] for e in edges} | {e['b'] for e in edges})

_gc = {'strong': 0, 'medium': 0, 'weak': 0}
for e in pair_edges:
    _gc[e['grade']] += 1
graph = {'nodes': nodes, 'edges': edges,
         'meta': {'pairs': len(pair_edges), 'bridges': len(bridge_edges),
                  'recipes_used': n_used, 'total_recipes': n_used, 'min_co': MIN_CO, 'topk': TOPK,
                  'grade_strong': _gc['strong'], 'grade_medium': _gc['medium'], 'grade_weak': _gc['weak'], 'lift_strong': LIFT_STRONG, 'lift_med': LIFT_MED}}
json.dump(graph, open(f'{WEB}/lib/food-graph.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'pair grades: strong {_gc["strong"]} · medium {_gc["medium"]} · weak {_gc["weak"]}')

# ── 리포트 ──
missing_bridge = [(a, b) for a, b in BRIDGE_SEED if a not in 도감set or b not in 도감set]
print(f'레시피 {len(recipes)} 중 사용(메인 2+) {n_used}')
print(f'pair {len(pair_edges)} · bridge {len(bridge_edges)} · 노드 {len(nodes)}/{len(도감)}')
if missing_bridge:
    print('⚠ 도감에 없는 bridge 양끝(스킵됨):', missing_bridge)
deg = defaultdict(int)
for e in edges:
    deg[e['a']] += 1; deg[e['b']] += 1
iso = [n for n in 도감 if n not in SEASONING and deg.get(n, 0) == 0]
print(f'고립 노드 {len(iso)}:', ' '.join(iso[:40]))
print('\n[샘플] 잘 먹는 앵커별 pair 이웃(궁합):')
for anchor in ['멥쌀', '달걀', '치즈', '고구마', '닭고기', '두부']:
    nb = sorted([(e['b'] if e['a'] == anchor else e['a'], e['count']) for e in pair_edges if anchor in (e['a'], e['b'])], key=lambda x: -x[1])[:8]
    print(f'  {anchor}:', ' · '.join(f'{n}({c})' for n, c in nb))
print('\n[샘플] bridge 사촌:')
for anchor in ['고구마', '닭고기', '명태', '시금치', '사과']:
    nb = [(e['b'] if e['a'] == anchor else e['a']) for e in bridge_edges if anchor in (e['a'], e['b'])]
    print(f'  {anchor}:', ' · '.join(nb))
