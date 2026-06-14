#!/usr/bin/env python3
"""
밀프레드 식재료 아이콘 147종 일괄 생성 (Draw Things HTTP API)
사용법:
  1. Draw Things 앱 실행
  2. Settings → HTTP API Server → Enable (포트 7860)
  3. python3 scripts/generate-icons.py
"""

import json
import os
import time
import urllib.request
import urllib.error
import sys

POOL_PATH = os.path.join(os.path.dirname(__file__), '..', 'data_ingredient_pool_enriched.json')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'web', 'public', 'icons')
API_URL = 'http://127.0.0.1:7860/sdapi/v1/txt2img'

# 카테고리별 색상 힌트 (자연스러운 색감)
CAT_COLOR = {
    '잎채소': 'green leafy',
    '뿌리채소': 'orange and brown root',
    '열매채소': 'colorful fruit vegetable',
    '곡물_탄수': 'golden grain',
    '콩_콩제품': 'beige and white soy',
    '생선': 'silver-blue fish',
    '고기': 'red and pink meat',
    '계란': 'cream and white egg',
    '유제품': 'white dairy',
    '버섯': 'brown mushroom',
    '과일': 'colorful fruit',
    '갑각_조개': 'orange-pink shellfish',
    '견과_씨앗': 'brown nut',
    '기타채소': 'green vegetable',
    '해조류': 'dark green seaweed',
    '향신_허브': 'green herb',
    '발효식품': 'red fermented',
    '가공식품': 'processed food',
}

# 한글→영문 식재료명 매핑 (DALL-E/SD용)
KO_TO_EN = {
    '멸치':'dried anchovy','달걀':'egg','계란':'egg','메추리알':'quail egg',
    '당근':'carrot','무':'white radish daikon','감자':'potato','고구마':'sweet potato',
    '시금치':'spinach','배추':'napa cabbage','양배추':'green cabbage','상추':'lettuce',
    '쑥갓':'crown daisy','양상추':'iceberg lettuce','미나리':'water parsley',
    '근대':'swiss chard','청경채':'bok choy','아욱':'mallow leaves','들깻잎':'perilla leaf',
    '토마토':'tomato','호박':'pumpkin','애호박':'zucchini','오이':'cucumber',
    '가지':'eggplant','파프리카':'bell pepper','피망':'green pepper',
    '양파':'onion','마늘':'garlic','파':'green onion scallion','부추':'chive',
    '두부':'tofu','콩나물':'soybean sprout','숙주나물':'mung bean sprout',
    '콩(대두)':'soybean','땅콩':'peanut',
    '소고기':'beef','돼지고기':'pork','닭고기':'chicken','오리고기':'duck meat',
    '우유':'milk glass','치즈':'cheese','요구르트':'yogurt','버터':'butter','크림':'cream',
    '사과':'apple','딸기':'strawberry','포도':'grape','배':'korean pear','바나나':'banana',
    '키위':'kiwi','귤':'mandarin tangerine','수박':'watermelon','참외':'korean melon',
    '블루베리':'blueberry','복숭아':'peach','감':'persimmon','자몽':'grapefruit',
    '레몬':'lemon','오렌지':'orange','망고':'mango','파인애플':'pineapple',
    '멥쌀':'white rice','밀':'wheat','빵':'bread','찹쌀':'glutinous rice',
    '옥수수':'corn','보리':'barley','현미':'brown rice',
    '멥쌀떡':'rice cake','국수':'noodle','통밀':'whole wheat',
    '느타리버섯':'oyster mushroom','표고버섯':'shiitake mushroom',
    '팽이버섯':'enoki mushroom','양송이버섯':'button mushroom',
    '큰느타리버섯(새송이버섯)':'king oyster mushroom',
    '새우':'shrimp','바지락':'clam','홍합':'mussel','게맛살':'crab stick',
    '굴 소스':'oyster','조개':'shellfish','꼬막':'cockle','전복':'abalone',
    '아몬드':'almond','호두':'walnut','참깨':'sesame seed',
    '들깨':'perilla seed','해바라기씨':'sunflower seed',
    '다시마':'kelp','김':'dried seaweed nori','미역':'wakame seaweed',
    '매생이':'green laver','파래':'sea lettuce',
    '고등어':'mackerel','연어':'salmon','갈치':'hairtail cutlassfish',
    '삼치':'spanish mackerel','명태':'pollock','대구':'cod',
    '가자미':'flatfish flounder','조기':'yellow croaker',
    '오징어':'squid','참치':'tuna','장어':'eel','꽁치':'saury',
    '멸치젓':'anchovy sauce','새우젓':'shrimp paste',
    '생강':'ginger','고추':'red chili pepper','파슬리':'parsley',
    '고추가루':'red pepper flake','마늘 페이스트':'garlic paste',
    '김치':'kimchi','배추김치':'napa kimchi',
    '어묵':'fish cake','햄':'ham','만두':'dumpling','소시지':'sausage','베이컨':'bacon',
    '토마토케찹':'ketchup','연근':'lotus root','우엉':'burdock root',
    '도라지':'bellflower root','더덕':'codonopsis root','순무':'turnip',
    '호박고지':'dried gourd','콩(대두)':'soybean',
    '마늘종':'garlic scape','얼갈이배추':'young napa cabbage',
    '달래':'wild chive','쑥':'mugwort','참나물':'chamnamul',
    '파스타':'pasta','크림':'cream',
}

STYLE = "watercolor illustration style, soft warm beige and peach tones, gentle brush strokes, hand-painted feel, transparent background, no text, centered, cute and friendly, food icon for children nutrition app, 512x512, simple clean composition, single item only"

def get_prompt(name, cat):
    en = KO_TO_EN.get(name, name)
    color = CAT_COLOR.get(cat, '')
    return f"A single {en}, {color}, {STYLE}"

def generate_one(prompt, out_path, retries=2):
    payload = json.dumps({
        "prompt": prompt,
        "negative_prompt": "text, watermark, logo, label, multiple items, background pattern, frame, border, realistic photo, 3d render",
        "steps": 25,
        "width": 512,
        "height": 512,
        "cfg_scale": 7.5,
        "sampler_name": "DPM++ 2M Karras",
        "seed": -1,
    }).encode('utf-8')

    req = urllib.request.Request(API_URL, data=payload, headers={'Content-Type': 'application/json'})

    for attempt in range(retries + 1):
        try:
            resp = urllib.request.urlopen(req, timeout=120)
            data = json.loads(resp.read())
            if 'images' in data and data['images']:
                import base64
                img_data = base64.b64decode(data['images'][0])
                with open(out_path, 'wb') as f:
                    f.write(img_data)
                return True
        except Exception as e:
            if attempt < retries:
                print(f'  재시도 {attempt+1}... ({e})')
                time.sleep(3)
            else:
                print(f'  ❌ 실패: {e}')
                return False
    return False

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(POOL_PATH, 'r') as f:
        pool = json.load(f)['pool']

    # Draw Things API 연결 확인
    try:
        urllib.request.urlopen('http://127.0.0.1:7860/sdapi/v1/options', timeout=5)
    except Exception:
        print('❌ Draw Things HTTP API에 연결할 수 없습니다.')
        print('   Draw Things 앱 실행 → Settings → HTTP API Server → Enable (포트 7860)')
        sys.exit(1)

    print(f'🎨 식재료 아이콘 생성 시작: {len(pool)}종')
    print(f'📁 저장 위치: {OUT_DIR}')
    print()

    done = 0
    skip = 0
    fail = 0

    for i, ing in enumerate(pool):
        name = ing['nm']
        cat = ing.get('cat', '?')
        safe_name = name.replace('/', '_').replace('(', '').replace(')', '')
        out_path = os.path.join(OUT_DIR, f'{safe_name}.png')

        if os.path.exists(out_path):
            skip += 1
            print(f'  ⏭ [{i+1}/{len(pool)}] {name} (이미 존재)')
            continue

        prompt = get_prompt(name, cat)
        print(f'  🖌 [{i+1}/{len(pool)}] {name} ({cat})...')

        if generate_one(prompt, out_path):
            done += 1
            print(f'    ✅ 저장: {safe_name}.png')
        else:
            fail += 1

        time.sleep(1)  # API 과부하 방지

    print()
    print(f'🎉 완료: {done}종 생성 · {skip}종 스킵 · {fail}종 실패')
    print(f'📁 위치: {OUT_DIR}')

if __name__ == '__main__':
    main()
