/**
 * lib/letterBlocks.ts — v3 조립식 편지 블록 스키마·렌더러·검수 규칙 (WBS C-01·C-02·C-03)
 *
 * 편지 표면의 유한화 본체. 블록 = 사전 작성+적대 검수된 한국어 문장 뭉치(1~3문장, lib/letter-blocks.json).
 * 이 파일이 ①타입(C-01) ②슬롯 렌더러+조사 처리(C-02) ③검수 체크리스트의 기계 규칙(C-03 — 제작 프롬프트와
 * 린터 tests/blocks.test.ts(C-19)의 공통 소스)을 모두 정의한다. 전부 순수 함수·LLM 0콜.
 *
 * 원칙(v3 정본 §4): 숫자·사실은 블록 원문에 못 박지 않고 {fact}·{next} 슬롯으로만 유입된다 —
 * 린트는 슬롯 치환 '전' 원문에 적용(슬롯 값은 코드가 별도 가드: 사실카드=coachFacts·next=레지스트리).
 */
import { UNIT_IDS, type UnitId } from './curriculumUnits';
import { letterSimilarity, letterDeterministicBad } from './coach';
import BLOCKS_JSON from './letter-blocks.json';

// ── C-01 — 타입 ───────────────────────────────────────────────────────────────
export const UNIT_STAGES = ['intro', 'why', 'how', 'observe', 'obstacle', 'advance', 'praise', 'pivot'] as const;
export type UnitStage = (typeof UNIT_STAGES)[number];
export const COMMON_STAGES = ['plateau', 'celebrate', 'lowdata', 'graduate', 'pivot-bridge', 'opener-weekday'] as const;
export type CommonStage = (typeof COMMON_STAGES)[number];
export type BlockStage = UnitStage | CommonStage;
export const SLOT_KEYS = ['name', 'fact', 'next', 'food'] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];
export type BlockTone = 'warm' | 'praise' | 'empathy';

export type LetterBlock = {
  id: string;                       // `${unit}.${stage}.${variant}` (예: table-stage.intro.2)
  unit: UnitId | 'common';
  stage: BlockStage;
  variant: number;
  text: string;                     // 슬롯 토큰 {name}{fact}{next}{food} + 조사 토큰 {이가}{은는}{을를}{과와}{으로}
  slots: SlotKey[];                 // text가 쓰는 슬롯 선언(무결성 린트)
  tone: BlockTone;
  minStep?: number;                 // 이 블록이 유효한 최소 사다리 단(기본 0=무관)
  requires?: SlotKey[];             // 조립 조건 — 이 슬롯이 채워질 수 없으면 선택 불가(예: observe는 fact 필수)
  forbids?: string[];               // 조립 컨텍스트 플래그(avoidTags)와 교집합이면 선택 제외(예: 'push' — F-03 채근 캡)
};

export function loadBlocks(): LetterBlock[] {
  return ((BLOCKS_JSON as { blocks: LetterBlock[] }).blocks || []);
}

// ── C-02 — 조사 처리 + 슬롯 렌더러 ─────────────────────────────────────────────
const JOSA_PAIRS: Record<string, [string, string]> = {
  '이가': ['이', '가'], '은는': ['은', '는'], '을를': ['을', '를'], '과와': ['과', '와'], '으로': ['으로', '로'],
};
/** 받침 유무로 조사 선택. 한글 음절이 아니면 모음형(가/는/를/와/로)으로 — progressNote '아침를' 사고의 일반해. */
export function josa(word: string, pair: keyof typeof JOSA_PAIRS): string {
  const [withBat, noBat] = JOSA_PAIRS[pair];
  const ch = (word || '').trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return noBat;
  const bat = (code - 0xac00) % 28;
  if (bat === 0) return noBat;
  if (pair === '으로' && bat === 8) return noBat;   // ㄹ 받침 + (으)로 → '로'
  return withBat;
}

export type RenderCtx = Partial<Record<SlotKey, string | null>>;
const SLOT_TOKEN_RE = /\{(name|fact|next|food)\}/g;
const JOSA_TOKEN_RE = /\{(이가|은는|을를|과와|으로)\}/g;
/** 이름 뒤 조사 — 받침 이름은 호칭 '이'를 붙인다(아린→아린이가·아린이는, 지호→지호가). */
function nameJosa(name: string, pair: keyof typeof JOSA_PAIRS): string {
  const [, noBat] = JOSA_PAIRS[pair];
  const ch = (name || '').trim().slice(-1);
  const code = ch.charCodeAt(0);
  const hasBat = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 > 0;
  if (pair === '으로') return hasBat ? '이로' : '로';
  return hasBat ? `이${noBat}` : noBat;
}
/**
 * 블록 1개를 문자열로 렌더 — 선언 슬롯 중 미충족이 있으면 null(조립기가 다른 변형 선택).
 * 단일 패스 치환(슬롯 값 안의 토큰은 재치환하지 않음 — 이중 치환 금지) 후 조사 토큰을 직전 글자로 해석.
 * {name} 바로 뒤의 조사는 이름 규칙(받침→'이'+조사)으로 — "아린이가/지호가" (C-02 유즈케이스).
 */
export function renderBlock(block: LetterBlock, ctx: RenderCtx): string | null {
  for (const s of block.slots || []) {
    const v = ctx[s];
    if (v == null || !String(v).trim()) return null;
  }
  let out = '';
  let last = 0;
  const text = block.text || '';
  const nameEnds = new Set<number>();   // {name} 치환값이 끝난 위치(직후 조사 토큰 = 이름 규칙)
  SLOT_TOKEN_RE.lastIndex = 0;
  for (let m = SLOT_TOKEN_RE.exec(text); m; m = SLOT_TOKEN_RE.exec(text)) {
    const key = m[1] as SlotKey;
    if (!(block.slots || []).includes(key)) return null;   // 미선언 토큰 = 무결성 위반(린트가 막지만 방어)
    out += text.slice(last, m.index) + String(ctx[key]).trim();
    if (key === 'name') nameEnds.add(out.length);
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  out = out.replace(JOSA_TOKEN_RE, (_t, pair, idx: number) =>
    nameEnds.has(idx)
      ? nameJosa(out.slice(0, idx), pair as keyof typeof JOSA_PAIRS)
      : josa(out.slice(0, idx), pair as keyof typeof JOSA_PAIRS));
  return /\{[a-z가-힣]+\}/.test(out) ? null : out;
}

// ── C-03 — 블록 검수 체크리스트(기계 규칙) ──────────────────────────────────────
// 이 목록이 제작 프롬프트(C-04 워크플로)와 린터(C-19)의 공통 소스다 — 기준 이중화 금지.
// 적용 대상 = 슬롯 치환 '전' 원문(숫자·사실·음식명은 슬롯으로만 유입되는 게 규약이므로).
export type BlockRule = { re: RegExp; why: string; applies?: (b: LetterBlock) => boolean };
export const BLOCK_FORBID: BlockRule[] = [
  { re: /[0-9０-９%]/, why: '숫자 리터럴 금지 — 횟수·통계는 {fact}·{next} 슬롯으로만' },
  { re: /체중|몸무게|다이어트|비만|BMI|칼로리/, why: '체중·수치 단어 금지(유아 민감)' },
  { re: /진단|처방|치료(?!사)|증상|결핍|영양제|장애(?!물)/, why: '의학 단어 금지(코치는 의사가 아님)' },
  { re: /점수|등급|미션|과제|챌린지|숙제|목표|수업|진도|커리큘럼/, why: "점수·'미션·수업' 류 내부 개념 노출 금지(§13)" },
  { re: /맵|매운|고추|불닭|까스|너겟|핫도그|튀김|소시지|어묵|과자|사탕|초콜릿|젤리|탄산/, why: '매운·튀김·초가공 권유 금지' },
  { re: /항상|매일|맨날|날마다|계속|(^|\s)늘\s/, why: "빈도 단정어 금지 — 시계열 라벨은 {fact} 슬롯이 가져온다" },   // '늘'은 어절 시작일 때만('오늘 ' 오탐 — 픽스처가 적발)
  { re: /한\s?입만|다\s?먹어야|안\s?먹으면/, why: '압박 문구는 예시·인용으로도 금지(따라 말할 위험)' },
  { re: /해야\s?(해요|합니다|돼요)|먹여야|반드시|혼내|다그치|왜\s?안/, why: '지시·압박 어조 금지' },
  { re: /\{name\}[^.!?]{0,16}(드시|잡수|좋아하시|먹으시|하셨)/, why: '아이 주체높임 금지' },
  { re: /화면|영상|티비|TV|텔레비전|태블릿|스마트폰|휴대폰|유튜브/, why: '화면 단어는 table-stage.intro 블록에만(C-07 — 주제 수렴 구조 봉쇄)', applies: (b) => !(b.unit === 'table-stage' && b.stage === 'intro') },
  { re: /섞|버무리/, why: '섞기 표현은 food 유닛의 행동 블록(how·advance·obstacle)에만', applies: (b) => !((['exposure-savings', 'food-bridge', 'link-rhythm'] as string[]).includes(b.unit) && ['how', 'advance', 'obstacle'].includes(b.stage)) },
  { re: /충분|가지\s?(식재료|음식)/, why: "plateau는 '충분'·가짓수 칭찬 금지(기존 plateau 가드 승계)", applies: (b) => b.stage === 'plateau' },
  { re: /두부|콩(?!기름)|당근|브로콜리|시금치|고등어|연어|멸치|새우|계란|달걀|우유|치즈|요거트|요구르트|버섯|감자|고구마|토마토|오이|사과|바나나|딸기|포도|수박|멜론|배추|깍두기|김치|된장|두유/, why: '음식명 하드코딩 금지 — 음식은 {food} 슬롯으로만(화이트리스트 유입)' },
  { re: /\{(name|fact|next|food)\}(이가|이는|이를|이와|이로|가|이|는|은|를|을|와|과|로|랑)(?=[\s.,!?…]|$)/, why: '슬롯 뒤 조사 하드코딩 금지 — 받침이 바뀌면 깨진다. 조사 토큰({이가}{은는}{을를}{과와}{으로})을 쓸 것' },
  { re: /—|–/, why: '줄표 금지 — 마침표로 끊기(기존 퇴고 규칙 승계)' },
  { re: /줄게|보상으로/, why: '거래·보상 대사 금지(인용으로도 — no-bargain 원칙)' },
];
/** 사람용 체크리스트(제작 프롬프트에 그대로 주입) — 기계 규칙 + 구조 규칙의 문장본. */
export const BLOCK_CHECKLIST: string[] = [
  ...BLOCK_FORBID.map((r) => r.why),
  '한 블록 한 행동(행동 제안은 블록당 최대 1개)',
  '길이 20~90자(슬롯 토큰 포함 원문 기준)',
  '같은 (unit,stage) 변형끼리 첫 어절이 달라야 함 — 도입 다양성',
  '음식 이름을 원문에 하드코딩 금지 — 음식은 {food} 슬롯으로만(화이트리스트)',
  '관찰 사실 서술은 intro·observe 스테이지에서 {fact} 슬롯으로만 — 다른 스테이지는 사실 언급 자체 금지',
];

// 전형 슬롯 값 — 렌더 후 기존 결정론 가드(letterDeterministicBad)를 통과하는지 린트할 때 사용.
const TYPICAL_FILL: Record<SlotKey, string> = {
  name: '아린', fact: '어제 저녁을 식탁에 앉아 먹었어요', next: '하루 한 끼 식탁에 함께 앉기', food: '두부',
};

// ── C-19 린트 코어 — tests/blocks.test.ts가 실 풀에, 제작 워크플로가 산출물에 공용 ──
export type LintIssue = { id: string; rule: string };
export function lintBlock(b: LetterBlock): LintIssue[] {
  const issues: LintIssue[] = [];
  const push = (rule: string) => issues.push({ id: b.id || '(no-id)', rule });
  // 구조 — 스키마 적합
  const isCommon = b.unit === 'common';
  if (!isCommon && !(UNIT_IDS as string[]).includes(b.unit)) push(`미지의 unit: ${b.unit}`);
  if (isCommon ? !(COMMON_STAGES as readonly string[]).includes(b.stage) : !(UNIT_STAGES as readonly string[]).includes(b.stage)) push(`unit×stage 불일치: ${b.unit}×${b.stage}`);
  if (!['warm', 'praise', 'empathy'].includes(b.tone)) push(`tone 위반: ${b.tone}`);
  if (b.id !== `${b.unit}.${b.stage}.${b.variant}`) push(`id 형식 위반(unit.stage.variant): ${b.id}`);
  if (b.minStep != null && (b.minStep < 0 || b.minStep > 3)) push(`minStep 범위: ${b.minStep}`);
  // 슬롯 무결성 — text의 토큰 ⊆ 선언, 선언 ⊆ text, requires ⊆ 선언
  const used = [...new Set([...(b.text || '').matchAll(SLOT_TOKEN_RE)].map((m) => m[1]))] as SlotKey[];
  const declared = b.slots || [];
  for (const u of used) if (!declared.includes(u)) push(`미선언 슬롯 사용: {${u}}`);
  for (const d of declared) if (!used.includes(d)) push(`선언했지만 미사용 슬롯: ${d}`);
  for (const d of declared) if (!(SLOT_KEYS as readonly string[]).includes(d)) push(`미지의 슬롯: ${d}`);
  for (const r of b.requires || []) if (!declared.includes(r)) push(`requires가 미선언 슬롯 참조: ${r}`);
  if (b.stage === 'observe' && !(b.requires || []).includes('fact')) push('observe 블록은 requires:["fact"] 필수');
  if (b.stage === 'advance' && !(b.requires || []).includes('next')) push('advance 블록은 requires:["next"] 필수');
  if (b.unit === 'common' && declared.some((d) => d !== 'name')) push('공용 블록은 {name} 외 슬롯 금지(데이터 무관이어야 폴백 안전)');
  if (b.unit !== 'common' && !(['exposure-savings', 'food-bridge', 'link-rhythm'] as string[]).includes(b.unit) && declared.includes('food')) push('비-food 유닛의 {food} 사용 금지');
  // 길이(원문 기준 20~90)
  const len = (b.text || '').length;
  if (len < 20 || len > 90) push(`길이 ${len}자(20~90 위반)`);
  // 블록 내부 같은 종결 3연속(조립 후 단조로움의 씨앗 — D-05 보완) + 문장 수 캡(한 블록 1~3문장)
  const sents = (b.text || '').split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sents.length > 3) push(`블록 문장 수 ${sents.length}(최대 3)`);
  const ends = sents.map((s) => s.replace(/[.!?…\s]+$/, '').slice(-3)).filter(Boolean);
  for (let i = 0; i + 2 < ends.length; i++) if (ends[i] === ends[i + 1] && ends[i] === ends[i + 2]) { push('블록 내부 같은 종결어미 3연속'); break; }
  // 금지 표현(C-03)
  for (const rule of BLOCK_FORBID) {
    if (rule.applies && !rule.applies(b)) continue;
    if (rule.re.test(b.text || '')) push(rule.why);
  }
  // 전형 렌더가 기존 결정론 가드를 위반하지 않는지(괴식·환각 시점 등 coach.ts 가드 승계)
  const rendered = renderBlock(b, TYPICAL_FILL);
  if (rendered && letterDeterministicBad(rendered, undefined, rendered)) push('전형 렌더가 letterDeterministicBad 위반');
  return issues;
}

const normHead = (t: string) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 15);
const firstEojeol = (t: string) => ((t || '').trim().split(/\s+/)[0] || '');

/** 풀 전체 린트 — 개별 규칙 + 커버리지 + 변형 간 다양성. 이슈 0이어야 머지(prebuild 게이트). */
export function lintBlockPool(blocks: LetterBlock[]): LintIssue[] {
  const issues: LintIssue[] = blocks.flatMap(lintBlock);
  // id 유일성
  const seen = new Set<string>();
  for (const b of blocks) {
    if (seen.has(b.id)) issues.push({ id: b.id, rule: 'id 중복' });
    seen.add(b.id);
  }
  // 커버리지 — 유닛 12 × 8 stage 변형 ≥3 · 공용 stage ≥3(opener-weekday ≥8)
  const byKey = new Map<string, LetterBlock[]>();
  for (const b of blocks) {
    const k = `${b.unit}.${b.stage}`;
    byKey.set(k, [...(byKey.get(k) || []), b]);
  }
  for (const u of UNIT_IDS) for (const s of UNIT_STAGES) {
    const n = (byKey.get(`${u}.${s}`) || []).length;
    if (n < 3) issues.push({ id: `${u}.${s}`, rule: `커버리지 부족(변형 ${n}<3)` });
  }
  for (const s of COMMON_STAGES) {
    const n = (byKey.get(`common.${s}`) || []).length;
    const min = s === 'opener-weekday' ? 8 : 3;
    if (n < min) issues.push({ id: `common.${s}`, rule: `커버리지 부족(변형 ${n}<${min})` });
  }
  // 변형 간 다양성 — 같은 (unit,stage): 첫 어절 중복 금지 + 유사도 <0.6
  for (const [k, group] of byKey) {
    const heads = new Map<string, string>();
    for (const b of group) {
      const h = firstEojeol(b.text);
      if (heads.has(h)) issues.push({ id: b.id, rule: `첫 어절 중복(${k}: '${h}' ↔ ${heads.get(h)})` });
      else heads.set(h, b.id);
    }
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      if (letterSimilarity(group[i].text, group[j].text) >= 0.6) issues.push({ id: group[j].id, rule: `변형 간 유사도 ≥0.6(↔ ${group[i].id})` });
    }
  }
  // 전체 풀 — 동일 도입(첫 15자) ≤2
  const headCount = new Map<string, string[]>();
  for (const b of blocks) {
    const h = normHead(b.text);
    headCount.set(h, [...(headCount.get(h) || []), b.id]);
  }
  for (const [h, ids] of headCount) if (ids.length > 2) issues.push({ id: ids[2], rule: `동일 도입 15자 3+개('${h}': ${ids.join(',')})` });
  return issues;
}
