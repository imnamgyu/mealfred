#!/usr/bin/env python3
"""merge-youa-baseline.py — 실측 급식 식단 baseline을 youa-freq.json(evid 게이트 소스)에 MAX 병합.

왜: youaReassuranceFor('또래 급식에 자주 나오는 익숙한 재료' 안심절)은 youa-freq.json(dietary4u
표준식단 등장률%)을 게이트(≥50%)로 쓴다. 표준식단엔 단호박 1.4%지만 실측 급식 식단표(143 기관-월)에선
65.7% → 표준식단 단일 소스라 '실제로 흔한 음식'이 안심절을 못 받는다(이사님 지적: 빈도 표기 무시).

병합 = MAX(youa, 실측):
  · 비파괴 — 기존에 흔하던 식재료(youa 높음)는 그대로(실측 표본 표기변동에 강등 안 됨).
  · 표준식단 누락분만 실측이 메움(단호박·애호박·배추김치·대파 등).
입력 = /tmp/sikdan_ocr/_baseline.json (sikdan 집계 산출) · 출력 = lib/youa-freq.json (in-place).
※ 야간 크론이 institution_menu_items로 baseline 갱신 후 이 로직으로 재병합하면 재배포 없이 교정.
사용: python3 scripts/merge-youa-baseline.py [--dry]
"""
import json, os, sys
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = '--dry' in sys.argv
BASE = json.load(open('/tmp/sikdan_ocr/_baseline.json'))
real = {k: v['pct'] for k, v in BASE['ings'].items()}
YF = f'{WEB}/lib/youa-freq.json'
y = json.load(open(YF))
meta = y.pop('_meta', {})
youa = {k: v for k, v in y.items() if isinstance(v, (int, float))}

raised, added = [], []
out = {}
for k, v in youa.items():                      # 기존 키 순서 보존 + MAX
    nv = round(max(v, real.get(k, 0)), 1)
    if k in real and nv > v + 0.05:
        raised.append((k, v, nv))
    out[k] = nv
for k, rv in sorted(real.items(), key=lambda x: -x[1]):   # 실측 전용 키 추가(pct 내림차순)
    if k not in out:
        out[k] = round(rv, 1)
        added.append((k, rv))

meta['source'] = 'dietary4u 영유아 표준식단 등장률% ∪ 실측 OCR 급식 식단 baseline (MAX 병합)'
meta['merged_baseline'] = f"sikdan {BASE['total_km']} 기관-월 · {len(BASE['ings'])}종"
final = {'_meta': meta, **out}

print(f"=== youa-freq MAX 병합 ===")
print(f"기존 {len(youa)}종 + 실측 {len(real)}종 → 최종 {len(out)}종")
print(f"\n[실측으로 상향(게이트 통과 영향)] {len(raised)}종")
for k, o, n in sorted(raised, key=lambda x: -x[2])[:25]:
    flag = '  ⭐50%게이트 신규통과' if o < 50 <= n else ''
    print(f"  {k:12s} {o:5.1f} → {n:5.1f}{flag}")
print(f"\n[실측 전용 신규 추가] {len(added)}종 (상위10): " + ', '.join(f'{k}({v})' for k, v in added[:10]))
if DRY:
    print("\n(--dry: 파일 미기록)")
else:
    with open(YF, 'w') as f:
        json.dump(final, f, ensure_ascii=False, indent=1)
    print(f"\n✅ {YF} 기록 완료")
