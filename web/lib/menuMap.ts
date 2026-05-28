/**
 * 메뉴명 → 식재료 매핑 (순수 로직, 테스트 가능)
 *
 * 표준 식재료 어휘 = NUTRI_MAP 키(70종, 깨끗한 이름) + EXTRA + 풀 보강.
 * 결정론적 단계: 0차 레시피 사전 → 1차 룰 → 2차 substring 스캔.
 * 3차 LLM은 route.ts에서 처리(이 모듈은 API 키 없이 단독 실행/테스트 가능).
 */
import fs from 'fs';
import path from 'path';
import { NUTRI_MAP } from './nutrition.ts';
import { LEXICON } from './lexicon.ts';

// ── 표준 어휘 ───────────────────────────────────────────────
// 풀에 빠졌지만 흔한 핵심 식재료 보강 (도감 데이터 갭 — 별도 보강 예정)
export const EXTRA = ['브로콜리', '연어', '검은콩', '귀리', '현미', '콜리플라워', '요거트', '아보카도', '오리고기', '조개', '홍합'];

// 표기 변형·별칭 → 대표어는 lib/lexicon.ts(LEXICON)에 일원화 (클라이언트 입력 정규화와 공유).
// 양념·물·육수·기름 등 식재료로 치지 않는 토큰
const EXCLUDE = new Set([
  '물', '참기름', '들기름', '식용유', '소금', '간장', '국간장', '진간장', '설탕', '올리고당',
  '전분', '깨', '통깨', '밀가루', '버터', '식초', '맛술', '후추', '들깨가루', '채소', '분유',
  '멸치육수', '바지락육수', '조개육수', '닭육수', '소고기육수', '다시마육수', '육수',
]);

// 표준 식재료명 집합 = NUTRI_MAP 키 ∪ EXTRA ∪ 풀(정규화)
let POOL_NAMES: string[] = [];
try {
  const fp = path.join(process.cwd(), 'public', 'ingredients-light.json');
  POOL_NAMES = (JSON.parse(fs.readFileSync(fp, 'utf-8')).ingredients as { nm: string }[]).map((x) => x.nm);
} catch { POOL_NAMES = []; }

function cleanName(raw: string): string {
  const t = raw.replace(/\s*\(.*$/, '').trim();   // '쌀 (백미' / '쌀 (백미)' → '쌀'
  return LEXICON[t] || t;
}
export const CANON_VOCAB = new Set<string>([
  ...Object.keys(NUTRI_MAP).map((n) => LEXICON[n] || n),
  ...EXTRA,
  ...POOL_NAMES.map(cleanName).filter((n) => n.length >= 2 && !EXCLUDE.has(n)),
]);

/** 토큰 → 표준 식재료명. 양념·물·모호어는 null. */
export function canon(raw: string): string | null {
  let t = (raw || '').replace(/\s*약간$/, '').replace(/^약간의\s*/, '').trim();
  if (!t || /또는/.test(t) || t === '채소') return null;   // 'A 또는 B', 뭉뚱그린 채소 제외
  t = cleanName(t);
  if (EXCLUDE.has(t)) return null;
  return t;
}

// ── substring 스캔 ──────────────────────────────────────────
// 스캔 대상 표면형(메뉴 텍스트에 등장) → 표준명. 표준 어휘 + 별칭 표면형.
const SCAN_TOKENS: [string, string][] = (() => {
  const m = new Map<string, string>();
  for (const n of CANON_VOCAB) if (n.length >= 2) m.set(n, n);
  for (const [surface, real] of Object.entries(LEXICON)) if (surface.length >= 2) m.set(surface, real);
  // 메뉴에 흔한 표면형 추가
  [['표고', '표고버섯'], ['느타리', '느타리버섯'], ['팽이', '버섯'], ['새송이', '버섯'],
   ['닭다리', '닭고기'], ['닭', '닭고기'], ['계란', '계란'], ['달걀', '계란']].forEach(([s, r]) => {
    if (CANON_VOCAB.has(r) || r === '계란' || r.endsWith('버섯')) m.set(s, r);
  });
  return [...m.entries()].sort((a, b) => b[0].length - a[0].length); // 긴 표면형 우선
})();

export function scanIngredients(menu: string): string[] {
  const found = new Set<string>();
  for (const [surface, real] of SCAN_TOKENS) {
    if (surface.length >= 2 && menu.includes(surface)) found.add(real);
  }
  // 밥/죽/미음 곡물 보정 (쌀이 표준 어휘에 있으므로 정상 동작)
  if (/밥|죽|미음/.test(menu)) found.add('쌀');

  // 겹침 오탐 제거: 더 긴 매칭 표면형에 완전히 포함된 짧은 표준명 제거
  const arr = [...found];
  return arr.filter((short) => {
    const longSurface = SCAN_TOKENS.find(([s, r]) => r !== short && s.includes(short) && menu.includes(s));
    if (!longSurface) return true;
    return menu.split(longSurface[0]).join('').includes(short);
  });
}

// ── 레시피 사전 (tier-0, 생성물) ────────────────────────────
let MENU_DICT: Record<string, string[]> = {};
try {
  const dp = path.join(process.cwd(), 'lib', 'menu-dict.json');
  MENU_DICT = JSON.parse(fs.readFileSync(dp, 'utf-8'));
} catch { MENU_DICT = {}; }

// ── 흔한 메뉴 룰 (사전 보강 + 사람이 검수한 일반 메뉴) ──────
export const MENU_MAP: Record<string, { ing: string[]; processed?: boolean }> = {
  '야채볶음밥': { ing: ['쌀','당근','양파','계란','대파'] },
  '볶음밥': { ing: ['쌀','계란','양파','당근','대파'] },
  '김치볶음밥': { ing: ['쌀','김치','계란','대파'] },
  '소세지볶음': { ing: ['소시지','양파','피망'], processed: true },
  '소시지볶음': { ing: ['소시지','양파','피망'], processed: true },
  '불고기': { ing: ['소고기','양파','대파','마늘'] },
  '제육볶음': { ing: ['돼지고기','양파','대파','마늘','고추'] },
  '된장찌개': { ing: ['된장','두부','양파','대파','호박'] },
  '김치찌개': { ing: ['김치','돼지고기','두부','대파'] },
  '미역국': { ing: ['미역','소고기','마늘'] },
  '소고기무국': { ing: ['소고기','무','대파','마늘'] },
  '계란찜': { ing: ['계란','대파'] },
  '계란말이': { ing: ['계란','당근','대파'] },
  '닭볶음탕': { ing: ['닭고기','감자','당근','양파','대파'] },
  '카레라이스': { ing: ['감자','당근','양파','돼지고기','쌀'] },
  '카레': { ing: ['감자','당근','양파'] },
  '짜장밥': { ing: ['돼지고기','양파','감자','호박','쌀'] },
  '잡채': { ing: ['당면','당근','양파','시금치','소고기'] },
  '비빔밥': { ing: ['쌀','당근','시금치','콩나물','계란','소고기'] },
  '두부조림': { ing: ['두부','양파','대파','마늘'] },
  '시금치나물': { ing: ['시금치','마늘'] },
  '콩나물무침': { ing: ['콩나물','마늘'] },
  '돈가스': { ing: ['돼지고기','계란','양배추'], processed: true },
  '스파게티': { ing: ['토마토','양파','마늘'] },
  '오므라이스': { ing: ['계란','양파','당근','쌀'] },
  '만두국': { ing: ['만두','대파','계란'], processed: true },
  '떡국': { ing: ['소고기','대파','계란'] },
  '김밥': { ing: ['쌀','당근','시금치','계란','오이'] },
  '주먹밥': { ing: ['쌀','계란','당근'] },
  '김': { ing: ['김'] }, '김자반': { ing: ['김'] }, '조미김': { ing: ['김'] },
  '멸치볶음': { ing: ['멸치'] }, '잔멸치볶음': { ing: ['멸치'] },
  '어묵볶음': { ing: ['어묵','양파'], processed: true }, '어묵국': { ing: ['어묵','무','대파'], processed: true },
  '콩나물국': { ing: ['콩나물','대파','마늘'] }, '북엇국': { ing: ['명태','계란','대파'] },
  '두부부침': { ing: ['두부'] }, '두부구이': { ing: ['두부'] },
  '갈치조림': { ing: ['갈치','무','양파'] }, '고등어조림': { ing: ['고등어','무','양파'] },
  '무생채': { ing: ['무'] }, '오이무침': { ing: ['오이'] }, '깍두기': { ing: ['무'] },
  '배추김치': { ing: ['김치'] }, '나물': { ing: ['시금치'] }, '근대나물': { ing: ['근대'] },
  '브로콜리무침': { ing: ['브로콜리'] }, '단호박찜': { ing: ['호박'] }, '단호박': { ing: ['호박'] },
  '옥수수': { ing: ['옥수수'] }, '감자조림': { ing: ['감자','양파'] }, '감자볶음': { ing: ['감자','양파'] },
  '시금치된장국': { ing: ['시금치','된장','두부','대파'] }, '시금치국': { ing: ['시금치'] },
  '생선구이': { ing: ['갈치'] }, '고등어구이': { ing: ['고등어'] }, '연어': { ing: ['연어'] }, '연어스테이크': { ing: ['연어'] },
  '삼치': { ing: ['삼치'] }, '삼치구이': { ing: ['삼치'] }, '삼치조림': { ing: ['삼치','무'] },
  '고등어': { ing: ['고등어'] }, '갈치': { ing: ['갈치'] }, '갈치구이': { ing: ['갈치'] },
  '조기': { ing: ['조기'] }, '조기구이': { ing: ['조기'] }, '명태': { ing: ['명태'] }, '동태': { ing: ['명태'] },
  '가자미': { ing: ['가자미'] }, '가자미구이': { ing: ['가자미'] }, '임연수': { ing: ['임연수'] }, '임연수구이': { ing: ['임연수'] },
  '연어구이': { ing: ['연어'] }, '멸치': { ing: ['멸치'] }, '새우구이': { ing: ['새우'] }, '오징어': { ing: ['오징어'] },
  '닭가슴살': { ing: ['닭고기'] }, '소고기': { ing: ['소고기'] }, '돼지고기': { ing: ['돼지고기'] }, '닭고기': { ing: ['닭고기'] },
  '소고기구이': { ing: ['소고기'] }, '닭갈비': { ing: ['닭고기','양배추','고구마','대파'] }, '삼겹살': { ing: ['돼지고기'] },
  '구운계란': { ing: ['계란'] }, '삶은계란': { ing: ['계란'] }, '계란후라이': { ing: ['계란'] },
  '요거트': { ing: ['요거트'] }, '요구르트': { ing: ['요거트'] }, '치즈': { ing: ['치즈'] }, '우유': { ing: ['우유'] },
  '사과': { ing: ['사과'] }, '바나나': { ing: ['바나나'] }, '딸기': { ing: ['딸기'] }, '귤': { ing: ['귤'] },
  '블루베리': { ing: ['블루베리'] }, '키위': { ing: ['키위'] }, '토마토': { ing: ['토마토'] }, '방울토마토': { ing: ['토마토'] },
  '흰밥': { ing: ['쌀'] }, '쌀밥': { ing: ['쌀'] }, '잡곡밥': { ing: ['잡곡','쌀'] }, '현미밥': { ing: ['현미'] },
  '밥': { ing: ['쌀'] }, '진밥': { ing: ['쌀'] }, '죽': { ing: ['쌀'] }, '미음': { ing: ['쌀'] }, '누룽지': { ing: ['쌀'] },
  '식빵': { ing: ['빵'] }, '토스트': { ing: ['빵'] }, '국수': { ing: ['국수'] }, '라면': { ing: ['라면'], processed: true },
  '짜파게티': { ing: ['국수','짜장'], processed: true }, '짜장면': { ing: ['국수','양파','감자','돼지고기'] },
  // ── /mealfred-food-mapping 실데이터 튜닝 반영 ──
  '피자': { ing: ['빵','치즈','토마토'], processed: true }, '떡갈비': { ing: ['소고기','양파','대파'] },
  '탕평채': { ing: ['소고기','숙주나물','계란','김'] },
};

// 부분일치용 키 — 다(多)식재료 요리키만(2개+), 2글자 이상, 길이 내림차순.
// 단일 식재료 키(고등어·감자…)는 부분일치에서 제외 — 복합 메뉴("고등어 감자죽")에서 스캔을 가로막지 않게.
const PARTIAL_KEYS = Object.keys(MENU_MAP)
  .filter((k) => k.length >= 2 && MENU_MAP[k].ing.length >= 2)
  .sort((a, b) => b.length - a.length);

export type MapResult = { ingredients: string[]; processed: boolean; source: 'dict' | 'rule' | 'scan' };

function dedupCanon(arr: string[]): string[] {
  const out: string[] = [];
  for (const x of arr) { const c = canon(x); if (c && !out.includes(c)) out.push(c); }
  return out;
}

/** 결정론적 매핑(사전 → 룰 → 스캔). 모두 비면 null → 호출부 LLM 폴백. */
export function mapMenuLocal(menu: string, opts?: { skipDict?: boolean }): MapResult | null {
  const m = menu.trim().replace(/\s/g, '');
  // 0) 레시피 사전 정확 일치
  if (!opts?.skipDict && MENU_DICT[m]) return { ingredients: dedupCanon(MENU_DICT[m]), processed: false, source: 'dict' };
  // 1) 룰 정확 일치
  if (MENU_MAP[m]) return { ingredients: dedupCanon(MENU_MAP[m].ing), processed: !!MENU_MAP[m].processed, source: 'rule' };
  // 1b) 룰 부분 일치 (긴 키 우선)
  for (const key of PARTIAL_KEYS) {
    if (m.includes(key)) return { ingredients: dedupCanon(MENU_MAP[key].ing), processed: !!MENU_MAP[key].processed, source: 'rule' };
  }
  // 2) substring 스캔
  const scanned = dedupCanon(scanIngredients(m));
  if (scanned.length) return { ingredients: scanned, processed: false, source: 'scan' };
  return null;
}
