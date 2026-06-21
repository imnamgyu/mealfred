#!/usr/bin/env python3
# sikdan-ocr-batch.py — 식단표.zip(155개 사진/PDF) → /api/ocr(Clova+Claude) → 메뉴 텍스트 추출.
#   PDF는 pdftoppm로 래스터화(150dpi·앞 3p). 결과 /tmp/sikdan_ocr/NN.json(구·유형·월·is_menu·text·items).
#   재개 가능(이미 한 건 스킵). 다음 단계(decompose+집계→youa-freq)는 별도.
import zipfile, os, subprocess, json, urllib.request, time
SRC='/Users/ing/Downloads/식단표.zip'
EXT_DIR='/tmp/sikdan'; OUTDIR='/tmp/sikdan_ocr'; RASTER='/tmp/sikdan_png'
os.makedirs(OUTDIR, exist_ok=True); os.makedirs(RASTER, exist_ok=True)
OCR_URL='https://app.mealfred.com/api/ocr'
def log(m):
    print(m, flush=True)
    with open(f'{OUTDIR}/_progress.log','a') as f: f.write(m+'\n')
# manifest: zip index → 한글경로 → 추출파일
z=zipfile.ZipFile(SRC); man=[]
for i,info in enumerate(z.infolist()):
    if info.is_dir(): continue
    try: name=info.filename.encode('cp437').decode('cp949')
    except Exception: name=info.filename
    ext=os.path.splitext(name)[1].lower()
    if ext not in ('.jpg','.jpeg','.png','.pdf'): continue
    p=f"{EXT_DIR}/{i:02d}{ext}"
    if os.path.exists(p): man.append((i,p,name,ext))
def ocr_image(imgpath):
    with open(imgpath,'rb') as f: data=f.read()
    b='----sikdan'+str(int(time.time()*1000))
    ct='image/png' if imgpath.lower().endswith('.png') else 'image/jpeg'
    fn=os.path.basename(imgpath)
    body=(f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="{fn}"\r\nContent-Type: {ct}\r\n\r\n').encode()+data+f'\r\n--{b}--\r\n'.encode()
    req=urllib.request.Request(OCR_URL, data=body, headers={'Content-Type':f'multipart/form-data; boundary={b}'}, method='POST')
    with urllib.request.urlopen(req, timeout=300) as r: return json.loads(r.read())
log(f'=== sikdan OCR batch 시작: {len(man)}개 ===')
done=0; menus_ok=0
for (i,p,name,ext) in man:
    out=f'{OUTDIR}/{i:02d}.json'
    if os.path.exists(out): done+=1; continue
    parts=name.split('/'); gu=parts[1] if len(parts)>1 else ''; typ=parts[2] if len(parts)>2 else ''
    if ext=='.pdf':
        base=f'{RASTER}/{i:02d}'
        subprocess.run(['pdftoppm','-png','-r','150','-f','1','-l','3', p, base], check=False, capture_output=True)
        imgs=sorted(f'{RASTER}/{x}' for x in os.listdir(RASTER) if x.startswith(f'{i:02d}-') and x.endswith('.png'))
    else:
        imgs=[p]
    pages=[]
    for img in imgs:
        try:
            # 10MB 초과면 스킵(엔드포인트 거부) — 보통 150dpi는 OK
            if os.path.getsize(img) > 10*1024*1024: pages.append({'img':os.path.basename(img),'error':'>10MB skip'}); continue
            r=ocr_image(img)
            pages.append({'img':os.path.basename(img),'is_menu':r.get('is_menu'),'text':r.get('text',''),'items':r.get('items',[])})
        except Exception as e:
            pages.append({'img':os.path.basename(img),'error':str(e)[:120]})
    nm=sum(1 for pg in pages if pg.get('is_menu'))
    if nm: menus_ok+=1
    json.dump({'idx':i,'name':name,'gu':gu,'type':typ,'ext':ext,'pages':pages}, open(out,'w'), ensure_ascii=False)
    done+=1
    log(f'[{done}/{len(man)}] {gu}/{typ} {os.path.basename(name)[:30]} → {len(pages)}p · menu {nm}')
log(f'=== DONE: {done}개 처리 · 식단 인식 {menus_ok}개 ===')
