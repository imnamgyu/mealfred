/**
 * 쿠키 순위표(cookie-rankings.html) 재집계·자동 재주입 — /mealfred-food-mapping 마무리 단계.
 *
 * prod institution_menu_items(OCR 식단표) 라이브 집계 → 식재료/메뉴 등장 순위(카테고리별 top200)
 * → cookie-rankings.html 의 `const R={...}` 데이터 라인을 그 자리에서 교체.
 * 템플릿 파일이 필요 없고 idempotent(데이터 동일하면 diff 0)라, 매핑 사전(menuMapCore/lexicon)·
 * 도감이 바뀌면 이 스크립트만 다시 돌리면 순위표가 최신 매핑 기준으로 리뉴얼된다.
 *
 * 실행: cd web && npx tsx scripts/gen-cookie-rankings.ts
 * 의존: mapMenuLocal(매핑 단일진실) · lib/youa-freq.json(또래 비교) · .env.local(prod 키)
 */
import fs from 'fs';
import path from 'path';
import { mapMenuLocal } from '../lib/menuMap.ts';

const WEB = process.cwd();                                  // 항상 web/ 에서 실행
const HTML = path.join(WEB, '..', 'cookie-rankings.html');  // deploy/cookie-rankings.html

const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(WEB, '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('❌ SUPABASE URL/SERVICE_ROLE_KEY 없음 (.env.local)'); process.exit(1); }
const H: Record<string, string> = { apikey: KEY, authorization: `Bearer ${KEY}` };
async function fetchAll<T = any>(table: string, qs: string): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${table}?${qs}&offset=${off}&limit=1000`, { headers: H });
    const d = await r.json(); if (!Array.isArray(d)) break; out.push(...d); if (d.length < 1000) break;
  }
  return out;
}

const youa = JSON.parse(fs.readFileSync(path.join(WEB, 'lib/youa-freq.json'), 'utf-8'));
const clean = (r: string) => (r || '').replace(/^\s*\([^)]*\)\s*/, '').replace(/\s*[&＆].*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const SET = (s: string) => new Set(s.split(' '));
const G: Record<string, Set<string>> = { 곡물: SET('멥쌀 찹쌀 보리 밀 빵 국수 파스타 당면 시리얼 감자 고구마 옥수수 연근 우엉 도라지 더덕 마 토란 현미 흑미 기장 수수 잡곡 귀리 도토리묵 청포묵 메밀묵 묵'), 콩류: SET('두부 검은콩 콩 콩나물 대두 완두 강낭콩 숙주나물 녹두 병아리콩 렌틸콩'), '고기·계란': SET('소고기 쇠고기 돼지고기 닭고기 오리고기 달걀 계란 메추리알 햄 베이컨 소시지 닭간'), '생선·해산물': SET('고등어 갈치 명태 대구 삼치 가자미 가다랑어 멸치 새우 오징어 게 낙지 바지락 홍합 조개 어묵 게맛살 미역 다시마 김 파래 매생이 임연수어 도미 전복 주꾸미 관자 광어 우럭 꽁치 조기 꼬막 톳 방어'), 유제품: SET('우유 치즈 요구르트 요거트 크림'), 과일: SET('사과 딸기 포도 키위 참외 바나나 귤 배 감 파인애플 오렌지 멜론 복숭아 블루베리 수박 레몬 자두 망고 살구 무화과 체리 석류'), 버섯: SET('양송이버섯 느타리버섯 표고버섯 팽이버섯 새송이버섯 목이버섯 버섯') };
const groupOf = (n: string) => { for (const k in G) if (G[k].has(n)) return k; return '채소'; };
const MERGE: Record<string, string> = { '배추김치': '배추', '감귤': '귤', '쇠고기': '소고기', '달걀': '계란', '요거트': '요구르트' };
const cleanIng = (n: string) => n === '콩(대두)' ? '콩' : (MERGE[n] || n);
const STAPLE_ING = SET('멥쌀 쌀 백미 멥쌀밥 흰밥');
const SEASONING = SET('마늘 파 대파 쪽파 실파 생강 고추 청양고추 홍고추 풋고추 꽈리고추 깨 참깨 들깨 검은깨 통깨 깨소금 흑임자 소금 설탕 간장 양조간장 국간장 된장 고추장 쌈장 춘장 식용유 참기름 들기름 후추 까나리 액젓 멸치액젓 새우젓 굴소스 물엿 올리고당 조청 식초 맛술 미림 전분 녹말 부침가루 빵가루 밀가루 밀 베이킹파우더 마요네즈 케첩 머스타드 고춧가루 카레가루');
const isStapleMenu = (n: string) => /차$|음료|주스|식혜|미숫|보리차/.test(n) || /^(흰밥|백미밥|쌀밥|맨밥|진밥|흰쌀밥|백미)$/.test(n);
const yo = (n: string) => youa[n] ?? youa[n === '계란' ? '달걀' : n] ?? null;

async function main() {
  console.error('fetching institution_menu_items...');
  const rows = await fetchAll<{ menus: string[] | null; institution_menu_id: number }>('institution_menu_items', 'select=menus,institution_menu_id');
  console.error(`  ${rows.length}행`);
  // 기관 유형 조인: institution_menu_id → institution_menus.institution_id → institutions.type
  const band: Record<number, string> = {}; let bandOk = false;
  try {
    const im = await fetchAll<any>('institution_menus', 'select=id,institution_id');
    const inst = await fetchAll<any>('institutions', 'select=id,type,inst_type');
    const typeOf: Record<number, string> = {}; inst.forEach(x => typeOf[x.id] = x.type || x.inst_type || '');
    const im2inst: Record<number, number> = {}; im.forEach(x => im2inst[x.id] = x.institution_id);
    for (const r of rows) { const t = typeOf[im2inst[r.institution_menu_id]] || ''; band[r.institution_menu_id] = /초등|elementary/.test(t) ? 'e' : (t ? 'u' : ''); }
    bandOk = Object.values(band).some(v => v === 'e') && Object.values(band).some(v => v === 'u');
    console.error('  기관유형 조인:', bandOk ? 'OK(유아/초등 분리)' : '실패(전체만 — 수집 식단표 전부 유아)');
  } catch (e) { console.error('  조인 실패', e); }

  const menuFreq: Record<string, number> = {}, menuDisp: Record<string, string> = {};
  const ingFreq: Record<string, number> = {};
  for (const r of rows) {
    for (const raw of (r.menus || [])) {
      const k = clean(raw); if (!k) continue; menuFreq[k] = (menuFreq[k] || 0) + 1; menuDisp[k] = menuDisp[k] || raw;
      for (const ing of (mapMenuLocal(raw)?.ingredients || [])) ingFreq[ing] = (ingFreq[ing] || 0) + 1;
    }
  }

  // 메뉴 정제 가드 + 식재료 이름 별칭(주재료 매칭용)
  const BADD = /육개장|닭개장|매운|고추장|제육|불닭|닭갈비|떡볶이|튀김|돈가스|까스|견과|호두|아몬드|땅콩|장아찌|젓$|짠지/;
  const NAME_ALIAS: Record<string, string[]> = { '계란': ['계란', '달걀'], '소고기': ['소고기', '쇠고기', '한우'], '돼지고기': ['돼지고기', '돈육'], '닭고기': ['닭고기', '닭'], '요구르트': ['요구르트', '요거트'], '고구마': ['고구마'], '감자': ['감자'] };
  const aliasesOf = (x: string) => NAME_ALIAS[x] || [x];

  // 식재료 랭킹 (주식·양념 제외)
  const idict: Record<string, any> = {};
  for (const raw in ingFreq) { const k = cleanIng(raw); if (STAPLE_ING.has(k) || STAPLE_ING.has(raw) || SEASONING.has(k) || SEASONING.has(raw)) continue; if (!idict[k]) idict[k] = { n: k, freq: 0, g: groupOf(k), youa: yo(k) }; idict[k].freq += ingFreq[raw]; }
  let ings = Object.values(idict).sort((a: any, b: any) => b.freq - a.freq);
  const itot = ings.length;
  // 식재료별 '메뉴 이름에 그 재료가 들어간(=주재료)' 메뉴 top3 (이름 시작 우선)
  const ingNames = ings.map((r: any) => r.n as string);
  const ingDishes: Record<string, any[]> = {}; ingNames.forEach(x => ingDishes[x] = []);
  for (const k in menuFreq) { if (isStapleMenu(k) || BADD.test(menuDisp[k])) continue; const disp = menuDisp[k]; for (const X of ingNames) { if (disp === X) continue; const als = aliasesOf(X); if (als.some(a => disp.includes(a))) ingDishes[X].push({ n: disp, f: menuFreq[k], s: als.some(a => disp.startsWith(a)) ? 1 : 0 }); } }
  for (const X in ingDishes) { const seen = new Set<string>(); ingDishes[X] = ingDishes[X].sort((a, b) => b.s - a.s || b.f - a.f).filter(d => seen.has(d.n) ? false : (seen.add(d.n), true)).slice(0, 3).map(d => ({ n: d.n, f: d.f })); }
  ings = ings.slice(0, 200).map((r: any, i: number) => ({ ...r, rank: i + 1, top: Math.max(1, Math.round((i + 1) / itot * 100)), dish: ingDishes[r.n]?.[0]?.n || null, dishes: ingDishes[r.n] || [] }));

  // 메뉴 랭킹: 카테고리별 각 top200
  const menuCat = (n: string, g: string) => {
    if (/김치|깍두기|겉절이|장아찌|단무지|피클/.test(n)) return '밑반찬';
    if (/국$|탕$|찌개$|전골$/.test(n)) return '국류';
    if (g === '과일' || g === '유제품' || /찐고구마|찐감자|군고구마|찐단호박|구운감자|찐옥수수|두유|미숫|선식|떡|빵|케이크|샌드|시루|증편|카스테라|머핀|쿠키|푸딩|젤리|화채|꿀떡|약과|식혜|치즈스틱|핫케이크|와플|또띠아|스콘|마들렌|타르트|파이|도넛|아이스|에이드|쉐이크/.test(n)) return '디저트';
    if (/밥$|죽$|면$|국수|볶음밥|비빔밥|덮밥|리조또|우동|쫄면|수제비|파스타|스파게티|주먹밥|김밥|필라프/.test(n)) return '밥·면';
    if (/멸치|진미채|김구이|구운김|김자반|조미김|미역줄기|파래|매생이|뱅어|잔멸치|건새우|쥐포|어묵볶음|무말랭이|콩자반|메추리알|어묵조림/.test(n)) return '밑반찬';
    if ((g === '고기·계란' || g === '생선·해산물' || g === '콩류') && /구이|조림|볶음|찜|장조림|강정|수육|불고기|제육|너겟|까스|돈가스|동그랑땡|전$|적$|스테이크|함박|미트볼|탕수|데리야끼|마요|튀김|볼$|커틀릿|꼬치|말이|순살|찜닭/.test(n)) return '메인반찬';
    return '밑반찬';
  };
  const mall: any[] = [];
  for (const k in menuFreq) {
    if (isStapleMenu(k)) continue; const ings0 = mapMenuLocal(menuDisp[k])?.ingredients || []; const anchor = ings0.map(cleanIng).find((x: string) => !SEASONING.has(x)) || '';
    const mg = /김치|깍두기|겉절이|장아찌/.test(k) ? '채소' : /밥$|죽$|면$|국수|떡$|빵$|시루|증편|카스테라|샌드|머핀|롤$/.test(k) ? '곡물' : /우유|요구르트|요거트|치즈/.test(k) ? '유제품' : (anchor ? groupOf(anchor) : '채소');
    mall.push({ n: k, freq: menuFreq[k], g: mg, ing: anchor || '—', cat: menuCat(k, mg) });
  }
  const byCat: Record<string, any[]> = {}; for (const m of mall) { (byCat[m.cat] = byCat[m.cat] || []).push(m); }
  let menus: any[] = []; for (const c in byCat) { byCat[c].sort((a, b) => b.freq - a.freq); menus.push(...byCat[c].slice(0, 200)); }
  menus.sort((a, b) => b.freq - a.freq);
  const catCount: Record<string, number> = {}; menus.forEach(m => catCount[m.cat] = (catCount[m.cat] || 0) + 1);
  console.error('메뉴 카테고리별:', JSON.stringify(catCount), '· 총', menus.length);

  // ── cookie-rankings.html 데이터 라인(`const R={...}`) 그 자리 교체 ──
  const data = { ings, menus, bandOk, src: 'institution_menu_items(prod)' };
  const lines = fs.readFileSync(HTML, 'utf-8').split('\n');
  const li = lines.findIndex(l => l.startsWith('const R=') && l.includes('"ings"'));
  if (li < 0) { console.error('❌ cookie-rankings.html 에서 `const R={...}` 데이터 라인을 못 찾음 — 수동 확인 필요'); process.exit(1); }
  const before = lines[li];
  lines[li] = `const R=${JSON.stringify(data)};`;
  fs.writeFileSync(HTML, lines.join('\n'));

  console.log(`\n식재료 ${ings.length} · 메뉴 ${menus.length} · bandOk ${bandOk} · 메뉴고유 ${Object.keys(menuFreq).length} · 식재료고유 ${itot}`);
  console.log(`주입: cookie-rankings.html 데이터 라인(${li + 1}행) ` + (before === lines[li] ? '변화 없음(idempotent) ✅' : '갱신됨 ✅'));
  console.log('\n[식재료 TOP12]'); ings.slice(0, 12).forEach((r: any) => console.log(' ' + String(r.rank).padStart(3), (r.n + '      ').slice(0, 7), 'freq', String(r.freq).padStart(5), '또래', String(r.youa ?? '—').padStart(5), r.g, '· 대표:', r.dish || '—'));
  console.log('\n[메뉴 TOP15]'); menus.slice(0, 15).forEach((r: any, i: number) => console.log(' ' + String(i + 1).padStart(3), (r.n + '          ').slice(0, 12), 'freq', String(r.freq).padStart(4), r.cat, r.g));
}
main().catch(e => { console.error(e); process.exit(1); });
