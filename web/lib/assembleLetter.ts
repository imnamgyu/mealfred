/**
 * lib/assembleLetter.ts — v3 조립식 편지 조립기 (WBS D-01~D-11)
 *
 * 입력 = DailyDecision(B-23)+사실 카드(coachFacts)+블록 풀(letter-blocks.json)+원장 2종.
 * 출력 = 편지 본문+oneliner+사용 블록·인용 사실(컨텍스트 스냅샷 소스). LLM 0콜(윤문 옵션만 0~1콜).
 *
 * 구조 보장(확률 아님 — 전부 집합 차감·결정론):
 *   · 같은 블록 id 3일 내 재사용 0 (D-03 blockLedger)
 *   · 진단성 관찰 사실은 유닛 활성 기간 1회만 인용 (D-04 factsCited — '태블릿 사실 반복' 사고의 구조적 해법)
 *   · 후보 0이어도 발행 가능 (D-11 안전 폴백 — 절대 LLM 자유 생성으로 도망가지 않음, 6/12 사고 원칙)
 *   · 같은 입력 = 같은 출력 (D-02 — QA·리플레이 전제)
 */
import { type UnitDef, type Goal } from './curriculumUnits';
import { type DailyDecision } from './curriculum';
import { renderBlock, type LetterBlock, type BlockStage, type BlockTone, type RenderCtx } from './letterBlocks';
import { letterDeterministicBad, polishKo, proofreadLetter } from './coach';
import { type FactCard } from './coachFacts';

// ── 시그니처 (D-01) ───────────────────────────────────────────────────────────
export type AssembleInput = {
  decision: DailyDecision;          // B-23 산출 — unit·step·mode(·pivotTo)
  unitDef: UnitDef;                 // decision.unit의 레지스트리 정의({next}=현 단 behavior 소스)
  factCards: FactCard[];            // coachFacts 카드(객체 — kind: diagnosis|daily)
  blocks: LetterBlock[];            // 블록 풀(loadBlocks())
  blockLedger: string[];            // 최근 3일 사용 블록 id(D-03 — collectBlockLedger)
  recentCombos?: string[];          // 최근 7일 편지의 블록 조합(join '+') — 동일 편지 재현 차단(아린 정독 I-04 적발)
  factsCited: string[];             // 진단 카드 인용 원장(D-04 — 전역 카드 키·주간 수명)
  name: string;                     // 아이 이름({name})
  daySeed: number; cidHash?: number;
  food?: string | null;             // {food} — bridgeFacts 화이트리스트 값만(호출자 책임)
  introNeeded?: boolean;            // 주 첫 편지·유닛 신규 활성(F-06이 정교화) → intro 시퀀스
  suppressIntro?: boolean;          // 7일 내 같은 유닛 intro 기왕력 — pivot 시퀀스의 재도입 억제(리플레이 적발)
  lowData?: boolean;                // F-07 무기록 주 — 워밍+기록 권유 시퀀스(진도 동결과 짝)
  urgent?: boolean;                 // F-04 시급 예외 — 진단 재인용 허용(원장 우회)
  avoidTags?: string[];             // forbids 매칭(F-03 push 캡 등)
  tones?: BlockTone[];              // E-05 온보딩 1주차 tone=warm 제한 등
  detForbid?: RegExp | null;        // 동적 금지(coachFacts forbidParts — D-09 최종 스캔에 합류)
  mirror?: string | null;           // ⭐ 식단 거울(coachFacts.buildMealMirror) — lever 무관 매 편지 앞 1~2문장(어제 끼니+영양신호등)
  recentOnelines?: string[];        // 최근 oneliner(byte-동일 dedup — D-06)
};
export type AssembleOutput = {
  letter: string; oneliner: string;
  usedBlocks: string[];
  factUsed: string | null;          // 인용한 사실 카드 키(원장 갱신은 buildLetterCtx가)
  factUsedKind: 'diagnosis' | 'daily' | null;
  fallback: boolean;                // D-11 발동 여부(C-20 블록 증식 트리거)
  warnings: string[];               // D-09 위반 블록·규격 이탈 — 호출자가 이슈 로그로
};

const seedOf = (daySeed: number, cidHash: number) => (((daySeed + cidHash) % 1_000_000) + 1_000_000) % 1_000_000;
/**
 * D-04 원장 키 — 카드 키 '전역'(유닛 무관). 리플레이(I-05)가 적발한 구멍: 유닛 스코프 키는 피벗으로
 * 유닛이 바뀌면 같은 사실을 다른 유닛이 재서술할 수 있었다. 부모가 같은 통계를 두 번 듣지 않는 게 본질.
 * 원장 수명 = 주간(호출자가 주 경계에서 비움 — 주가 바뀌면 카드 통계 자체가 새 사실).
 */
export const factKeyOf = (_unit: string, cardKey: string) => cardKey;

// ── D-01 — mode별 블록 시퀀스(결정론 규격) ─────────────────────────────────────
// try = 우선순위 목록(앞이 1순위 — 대체는 후보 0일 때만). alt=true면 동급 교대(날짜 회전 — how↔obstacle).
type SeqPos = { from: 'unit' | 'common'; try: BlockStage[]; optional?: boolean; alt?: boolean };
function buildSeq(mode: DailyDecision['mode'], introNeeded: boolean, hasFact: boolean, lowData?: boolean, suppressIntro?: boolean, hasMirror?: boolean): SeqPos[] {
  const seq: SeqPos[] = (() => {
    if (lowData)   // F-07 — 무기록 주: 워밍 + 따뜻한 기록 권유(행동 요청 0·진도 동결과 짝)
      return [{ from: 'common', try: ['opener-weekday'] }, { from: 'common', try: ['lowdata'] }];
    if (mode === 'pivot' && suppressIntro)   // 7일 내 intro 기왕 유닛으로의 재피벗 — 재도입 대신 원리 환기
      return [{ from: 'common', try: ['pivot-bridge'] }, { from: 'unit', try: ['why'] }, { from: 'unit', try: ['how'], optional: true }];
    if (introNeeded && (mode === 'advance' || mode === 'deepen' || mode === 'observe'))
      return [{ from: 'unit', try: ['intro'] }, { from: 'unit', try: ['why'] }, { from: 'unit', try: ['how'], optional: true }];
    switch (mode) {
      case 'advance':   // 어제 사실 인용 → 다음 단 (사실이 없으면 praise로 대체해 흐름 유지)
        return [{ from: 'unit', try: hasFact ? ['observe', 'praise'] : ['praise'] }, { from: 'unit', try: ['advance'] }, { from: 'unit', try: ['why'], optional: true }];
      case 'deepen':    // 진전 중 — 현 단 심화(how/obstacle은 날짜로 교대)
        return [{ from: 'unit', try: ['praise'] }, { from: 'unit', try: ['how', 'obstacle'], alt: true }, { from: 'unit', try: ['why'], optional: true }];
      case 'pivot':     // 전환은 한 번만 서술 — 연결문 → 새 유닛 도입
        return [{ from: 'common', try: ['pivot-bridge'] }, { from: 'unit', try: ['intro'] }, { from: 'unit', try: ['why'], optional: true }];
      case 'maintain':  // 유지 주 — 그 유닛 침묵(공용만)
        return [{ from: 'common', try: ['opener-weekday'] }, { from: 'common', try: ['plateau'] }];
      case 'celebrate': // 졸업 — 공용 graduate + 유닛 praise
        return [{ from: 'common', try: ['graduate'] }, { from: 'unit', try: ['praise'] }];
      case 'observe':   // 판정 보류·무신호일 — 사실 있으면 반영, 없으면 워밍 도입 + 원리 한 스푼(수업)
      default:
        return hasFact
          ? [{ from: 'unit', try: ['observe'] }, { from: 'unit', try: ['why'] }]
          : [{ from: 'common', try: ['opener-weekday'] }, { from: 'unit', try: ['why'] }];
    }
  })();
  // ⭐ 거울이 도입 역할을 하므로 opener-weekday(인사) 제거 — 거울 뒤 '안녕하세요' 뜬금없음 버그(이사님). ≥1 블록 보존.
  if (hasMirror) {
    const filtered = seq.filter((pos) => !(pos.try.length === 1 && pos.try[0] === 'opener-weekday'));
    if (filtered.length) return filtered;
  }
  return seq;
}

// ── D-04 — 사실 카드 선택(편지당 1장) ─────────────────────────────────────────
// 유닛 레버별 선호 카드: 사실과 처방의 '결'을 맞춘다(아린 6/7 정독 적발 — 환경 사실을 노출 적금 블록이
// "적금으로 들어왔어요"로 받는 비약). 선호가 없으면 기존 순서(daily 우선) 폴백.
const LEVER_FACT_PREF: Record<string, RegExp> = {
  environment: /^env-/,                      // 식탁 무대·공복 리듬 — 환경 카드
  food: /^(refuse:|top-home|lunch|breakfast)/,   // 노출·다리·연계 — 음식 카드
  autonomy: /^env-y/,                        // 자율성은 전용 카드가 없어 어제 끼니 사실로
  texture: /^env-y/,
  mixed: /./,
};
function preferCards(cards: FactCard[], lever: string): FactCard[] {
  const re = LEVER_FACT_PREF[lever] || /./;
  return [...cards.filter((c) => re.test(c.key)), ...cards.filter((c) => !re.test(c.key))];
}
function pickFact(p: { mode: DailyDecision['mode']; introNeeded: boolean; cards: FactCard[]; cited: Set<string>; unit: string; lever: string; urgent: boolean }): FactCard | null {
  const cards = preferCards(p.cards, p.lever);
  const { cited, unit } = p;
  const diagFresh = cards.find((c) => c.kind === 'diagnosis' && !cited.has(factKeyOf(unit, c.key)));
  // food 유닛에 환경 daily 카드는 결이 어긋난다(노출 '적금' 블록이 화면 사실을 받는 비약) — 그날은 사실 없이 진행
  const daily = cards.find((c) => c.kind === 'daily' && !(p.lever === 'food' && /^env-/.test(c.key)));
  if (p.introNeeded || p.mode === 'pivot') return diagFresh || daily || null;   // 도입일 — 진단은 여기서 소진(원장 마킹)
  if (daily) return daily;                                                      // 이후는 '어제 단일 사실'만
  if (p.urgent) return cards.find((c) => c.kind === 'diagnosis') || null;       // F-04 시급 예외만 재인용 허용
  return diagFresh || null;                                                     // 미인용 진단이 남았으면 1회 인용 가능
}

// ── D-02 — 블록 선택 결정론 ───────────────────────────────────────────────────
function candidatesFor(p: {
  blocks: LetterBlock[]; from: 'unit' | 'common'; unit: string; stage: BlockStage; step: number;
  ledger: Set<string>; usedNow: Set<string>; ctx: RenderCtx; avoid: Set<string>; tones?: BlockTone[];
}): LetterBlock[] {
  const unitKey = p.from === 'common' ? 'common' : p.unit;
  return p.blocks
    .filter((b) => b.unit === unitKey && b.stage === p.stage)
    .filter((b) => (b.minStep || 0) <= p.step)
    .filter((b) => !(b.forbids || []).some((f) => p.avoid.has(f)))
    .filter((b) => !p.tones || p.tones.includes(b.tone))
    .filter((b) => (b.requires || []).every((r) => p.ctx[r] != null && String(p.ctx[r]).trim() !== ''))
    .filter((b) => !p.ledger.has(b.id) && !p.usedNow.has(b.id))
    .filter((b) => renderBlock(b, p.ctx) !== null)
    .sort((a, b2) => a.variant - b2.variant || a.id.localeCompare(b2.id));
}

// ── D-05 — 연결·규격 도구 ─────────────────────────────────────────────────────
const sentencesOf = (t: string) => (t || '').split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
const endingOf = (s: string) => s.replace(/[.!?…\s]+$/, '').slice(-3);
/** 같은 종결 3연속 여부(D-05 — '~주세요.×3' 단조로움 차단) */
function hasEndingRun(text: string): boolean {
  const ends = sentencesOf(text).map(endingOf);
  for (let i = 0; i + 2 < ends.length; i++) if (ends[i] && ends[i] === ends[i + 1] && ends[i] === ends[i + 2]) return true;
  return false;
}
const LETTER_MAX = 380;   // 현 편지 규격(D-05)

// ── D-06 — oneliner 조립(6변형 회전·LLM 0콜) ──────────────────────────────────
const ONELINER: Array<{ withNext: (n: string) => string; noNext: string }> = [
  { withNext: (n) => `오늘의 한 걸음: ${n}`, noNext: '오늘은 잔잔히 지켜보는 것만으로도 좋아요' },
  { withNext: (n) => `${n} — 오늘은 이것 하나면 돼요`, noNext: '꾸준함이 차곡차곡 쌓이는 중이에요' },
  { withNext: (n) => `오늘은 ${n}부터 가볍게 시작해 보세요`, noNext: '지금의 흐름을 그대로 이어가면 좋아요' },
  { withNext: (n) => `작게 한 번만: ${n}`, noNext: '아이의 속도를 믿고 가는 구간이에요' },
  { withNext: (n) => `이번 걸음은 '${n}'예요`, noNext: '잘 가고 있어요. 서두르지 않아도 돼요' },
  { withNext: (n) => `${n}, 오늘 한 번이면 돼요`, noNext: '오늘은 쉬어가며 식탁 분위기만 봐주세요' },
];
// next 없는(maintain 등) 날의 oneliner 풀 — 12변형 + 최근 이력 dedup(랄프위검: 6/05=6/11·6/06=6/12 byte-동일 적발)
const ONELINER_NONEXT = [
  '오늘은 잔잔히 지켜보는 것만으로도 좋아요',
  '꾸준함이 차곡차곡 쌓이는 중이에요',
  '지금의 흐름을 그대로 이어가면 좋아요',
  '아이의 속도를 믿고 가는 구간이에요',
  '잘 가고 있어요. 서두르지 않아도 돼요',
  '오늘은 쉬어가며 식탁 분위기만 봐주세요',
  '오늘은 마음 편히 한 끼만 함께해도 충분해요',
  '천천히 가도 괜찮은 하루예요',
  '오늘은 곁에 가만히 있어 주기만 해도 돼요',
  '작은 기록 하나가 큰 그림이 되고 있어요',
  '서두르지 않는 오늘이 단단한 밑돌이 돼요',
  '오늘도 식탁을 살펴 주셔서 고마워요',
];
function buildOneliner(next: string | null, seed: number, recent?: string[]): string {
  const rec = recent || [];
  if (next) {
    const s = ONELINER[seed % ONELINER.length].withNext(next);
    if (s.length <= 60 && !rec.includes(s)) return s;   // 길이 캡 60자(D-06-2) + 최근 미사용
  }
  for (let i = 0; i < ONELINER_NONEXT.length; i++) {   // 최근에 안 쓴 noNext 변형
    const c = ONELINER_NONEXT[(seed + i) % ONELINER_NONEXT.length];
    if (!rec.includes(c)) return c;
  }
  return ONELINER_NONEXT[seed % ONELINER_NONEXT.length];
}

// ── D-11 — 최후 안전 문구(풀이 비어도 발행 보장) ────────────────────────────────
const SAFE_LETTER = '오늘도 아이와의 식탁을 살펴봐 주셔서 고마워요. 잔잔한 날은 잔잔한 대로 의미가 있어요. 내일 또 한 걸음을 같이 찾아볼게요.';
const SAFE_ONELINER = '기록을 이어가 주시면 코치가 흐름을 계속 봐드릴게요';

// ── 본체 ──────────────────────────────────────────────────────────────────────
export function assembleLetter(p: AssembleInput): AssembleOutput {
  const seed = seedOf(p.daySeed, p.cidHash || 0);
  const warnings: string[] = [];
  const cited = new Set(p.factsCited || []);
  const avoid = new Set(p.avoidTags || []);
  // ⭐ 식단 거울 — 본문(코칭) 위에 항상 얹는 데이터 반사. urgent(안전)만 톤 충돌로 생략.
  //    lowData(기록 적은 주)여도 어제 끼니가 있으면 비춘다(랄프위검: 어제 식단 풍부한데 cold-start 채근으로 빠지던 5/27·28 적발).
  //    본문 문장/길이 예산을 거울만큼 줄여 총 5문장·규격을 유지(거울+본문).
  const mirror = ((!p.urgent && (p.mirror || '').trim()) || null) as string | null;
  const mirrorSents = mirror ? sentencesOf(mirror).length : 0;
  const bodySentCap = mirror ? Math.max(2, 4 - mirrorSents) : 5;   // ⭐ 거울 있으면 본문은 짧게(공감 1 + 행동 1) — 이사님 '구구절절 길다'
  const bodyMax = LETTER_MAX - (mirror ? mirror.length + 1 : 0);
  const introNeeded = !!p.introNeeded;
  const mode = p.decision.mode;
  const step = Math.max(1, p.decision.step || 1);
  const maxIdx = Math.min(step, p.unitDef.steps.length) - 1;
  const next = mode === 'maintain' || mode === 'celebrate' || p.lowData ? null : (p.unitDef.steps[maxIdx]?.behavior ?? null);
  const fact = pickFact({ mode, introNeeded, cards: p.factCards || [], cited, unit: p.decision.unit, lever: p.unitDef.lever, urgent: !!p.urgent });
  const ctx: RenderCtx = { name: p.name || '아이', fact: fact ? (fact.prose ?? fact.text) : null, next, food: p.food ?? null };
  const ledger = new Set(p.blockLedger || []);

  /** 한 번의 조립 시도(attempt가 변형 회전을 비틀어 D-09 재선택을 구현) */
  const attemptAssemble = (attempt: number): { letter: string; used: LetterBlock[] } | null => {
    const seq = buildSeq(mode, introNeeded, !!fact, p.lowData, p.suppressIntro, !!mirror);
    const usedNow = new Set<string>();
    const picked: Array<{ b: LetterBlock; text: string; optional: boolean }> = [];
    for (let k = 0; k < seq.length; k++) {
      const pos = seq[k];
      const posSeed = seed + k * 17 + attempt * 101;
      // try = 우선순위(고정). alt 위치만 날짜로 교대(how↔obstacle) — 대체 스테이지가 1순위를 가로채지 않게.
      const stages = pos.alt ? pos.try.map((_, i) => pos.try[(posSeed + i) % pos.try.length]) : pos.try;
      // D-05 — 문장 예산: 남은 필수 위치마다 최소 1문장을 남겨 두고 총 5문장 안에 들어오는 변형을 선호
      const sofarSent = picked.reduce((n, x) => n + sentencesOf(x.text).length, 0);
      const remainReq = seq.slice(k + 1).filter((s) => !s.optional).length;
      let got: { b: LetterBlock; text: string } | null = null;
      for (const stage of stages) {
        const cands = candidatesFor({ blocks: p.blocks, from: pos.from, unit: p.decision.unit, stage, step, ledger, usedNow, ctx, avoid, tones: p.tones });
        if (!cands.length) continue;
        // 어미 3연속 회피 + 문장 예산을 선택 시점에 통합: ①run無+예산内 ②예산内 ③run無 ④아무거나
        const ordered = cands.map((_, i) => cands[(posSeed + i) % cands.length]);
        const sofar = picked.map((x) => x.text).join(' ');
        let best: { b: LetterBlock; text: string } | null = null;
        let fitOnly: { b: LetterBlock; text: string } | null = null;
        let noRunOnly: { b: LetterBlock; text: string } | null = null;
        let anyPick: { b: LetterBlock; text: string } | null = null;
        for (const b of ordered) {
          const text = renderBlock(b, ctx);
          if (!text) continue;
          if (!anyPick) anyPick = { b, text };
          const noRun = !hasEndingRun(sofar ? `${sofar} ${text}` : text);
          const fits = sofarSent + sentencesOf(text).length + remainReq <= bodySentCap;
          if (noRun && fits) { best = { b, text }; break; }
          if (fits && !fitOnly) fitOnly = { b, text };
          if (noRun && !noRunOnly) noRunOnly = { b, text };
        }
        // 옵션 위치는 예산에 안 들어오면 통째 생략(필수 위치만 예산 초과를 감수 — 그때만 경고)
        got = best || fitOnly || (pos.optional ? null : noRunOnly || anyPick);
        if (got && !pos.optional && !best && !fitOnly) {
          warnings.push(noRunOnly ? `문장 예산 초과 변형(${got.b.id})` : `어미 3연속 해소 실패(${got.b.id})`);
        }
        if (got) break;
      }
      if (!got) {
        if (pos.optional) continue;
        return null;   // 필수 위치 후보 0 → 원장 소진+requires 미충족(D-11로)
      }
      usedNow.add(got.b.id);
      picked.push({ b: got.b, text: got.text, optional: !!pos.optional });
    }
    if (!picked.length) return null;
    // 규격 맞추기(D-05): 문장 3~5·길이 380 — 선택 블록을 빼며 조절(필수 블록은 유지)
    const joinOf = (list: typeof picked) => list.map((x) => x.text).join(' ');
    let list = picked;
    const drop = () => { const i = list.map((x) => x.optional).lastIndexOf(true); if (i >= 0) list = list.filter((_, j) => j !== i); };
    if (joinOf(list).length > bodyMax || sentencesOf(joinOf(list)).length > bodySentCap) drop();
    const letter = joinOf(list);
    if (letter.length > bodyMax) warnings.push(`길이 초과 ${letter.length}자`);
    const sc = sentencesOf(letter).length;
    if (sc < 3 || sc > bodySentCap) warnings.push(`문장 수 ${sc}(3~${bodySentCap} 밖)`);
    return { letter, used: list.map((x) => x.b) };
  };

  // D-09 — 최종 결정론 스캔(정규식만) + 동일 조합 재현 차단: 위반 시 변형 재선택 → 그래도면 폴백/수용
  const combos = new Set(p.recentCombos || []);
  let result: { letter: string; used: LetterBlock[] } | null = null;
  let comboFallback: { letter: string; used: LetterBlock[] } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = attemptAssemble(attempt);
    if (!r) break;   // 후보 0은 재시도 무의미(같은 집합) → 폴백
    const bad = letterDeterministicBad(r.letter, undefined, r.letter) || (p.detForbid ? p.detForbid.test(r.letter) : false);
    if (bad) { warnings.push(`D-09 위반 재선택(attempt ${attempt}): ${r.used.map((b) => b.id).join(',')}`); continue; }
    // 같은 블록 '조합'이 최근 7일 편지와 완전 일치 = 부모 눈에 복붙(3일 원장 밖 재조합 — 아린 6/1↔6/5 실증)
    if (combos.has(r.used.map((b) => b.id).join('+'))) {
      if (!comboFallback) comboFallback = r;
      warnings.push(`동일 조합 재현 회피(attempt ${attempt})`);
      continue;
    }
    result = r;
    break;
  }
  if (!result && comboFallback) result = comboFallback;   // 조합 회피 실패면 안전한 쪽(검수 통과본) 수용 + 경고 잔류

  if (!result) {
    // D-11 — 안전 폴백: 공용 opener+plateau(원장 무시·결정론). 그래도 없으면 상수 문구. LLM 폴백 절대 금지.
    const pickAny = (stage: BlockStage) => {
      const cs = p.blocks.filter((b) => b.unit === 'common' && b.stage === stage).sort((a, b2) => a.variant - b2.variant);
      return cs.length ? cs[seed % cs.length] : null;
    };
    const o = pickAny('opener-weekday'); const pl = pickAny('plateau');
    const parts = [o, pl].map((b) => (b ? renderBlock(b, ctx) : null)).filter(Boolean) as string[];
    const body = parts.length >= 2 ? parts.join(' ') : SAFE_LETTER;
    const letter = polishKo(mirror ? `${mirror} ${body}` : body);   // ⭐ 폴백도 식단 거울 유지
    return {
      letter, oneliner: SAFE_ONELINER,
      usedBlocks: parts.length >= 2 ? [o!.id, pl!.id] : [],
      factUsed: null, factUsedKind: null, fallback: true,
      warnings: [...warnings, '폴백 발행(후보 0) — C-20 블록 증식 검토'],
    };
  }

  const factConsumed = result.used.some((b) => (b.slots || []).includes('fact'));
  const full = mirror ? `${mirror} ${result.letter}` : result.letter;   // ⭐ 식단 거울 + 코칭 본문
  return {
    letter: polishKo(full),   // D-07 — 결정론 어법 교정(슬롯 치환 후 안전망)
    oneliner: buildOneliner(next, seed, p.recentOnelines),
    usedBlocks: result.used.map((b) => b.id),
    factUsed: factConsumed && fact ? fact.key : null,
    factUsedKind: factConsumed && fact ? fact.kind : null,
    fallback: false, warnings,
  };
}

// ── D-08 — LLM 윤문 옵션(기본 OFF — 컷오버 초기 순수 조립 품질 측정 I-04) ────────
export async function assembleAndPolish(
  p: AssembleInput & { polish?: boolean },
  proofread: (letter: string) => Promise<string> = proofreadLetter,
): Promise<AssembleOutput & { llmCalls: number }> {
  const out = assembleLetter(p);
  if (!p.polish || out.fallback) return { ...out, llmCalls: 0 };
  try {
    const polished = await proofread(out.letter);
    return { ...out, letter: polished || out.letter, llmCalls: 1 };
  } catch {
    return { ...out, llmCalls: 1 };   // 실패 시 원문(내용 불변 계약)
  }
}

// ── D-03 — 비반복 원장 수집(크론 H-02가 최근 3일 편지 context에서) ───────────────
export function collectBlockLedger(ctxs: Array<Record<string, unknown> | null | undefined>): string[] {
  const out: string[] = [];
  for (const c of ctxs || []) {
    const arr = c && Array.isArray((c as { blocks?: unknown }).blocks) ? ((c as { blocks: unknown[] }).blocks as unknown[]) : [];
    for (const id of arr) if (typeof id === 'string' && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * D-04 — 원장 리셋. 전역 카드 키 전환 후 일반해는 '주 경계에서 통째 리셋'(크론 H-02·러너 I-05).
 * 유닛 단위 리셋은 구키(`유닛:카드`) 시절 호환용으로 유지 — 구 컨텍스트에 남은 유닛 프리픽스 엔트리만 거른다.
 */
export function resetFactsCitedFor(cited: string[], unit: string): string[] {
  return (cited || []).filter((k) => !k.startsWith(`${unit}:`));
}

// ── D-10 — context 스냅샷 v3 단일 생성자(쓰기 3경로 공용 — 직접 객체 리터럴 금지) ──
export function buildLetterCtx(p: {
  base?: Record<string, unknown> | null;        // 레거시 필드(reds·missing 등 — 크론이 채움)
  source: string;
  out: AssembleOutput | null;                   // null = 비조립 경로(컷오버 전 레거시)
  decision?: DailyDecision | null;
  goalsSnapshot?: Goal[] | null;
  prevFactsCited?: string[] | null;             // 직전 편지의 누적 원장(주간 수명 — 호출자가 주 경계 리셋)
  preserve?: Record<string, unknown> | null;    // H-07 reuse — 기존 v3 필드를 그대로 보존(원장 연속성 S6 일반해)
  mirror?: string | null;                       // 식단 거울 문장(다음날 쿨다운 dedup 입력으로 컨텍스트에 보존)
}): Record<string, unknown> {
  if (p.preserve && (p.preserve as { assembled?: unknown }).assembled) {
    const pv = p.preserve as { assembled?: boolean; blocks?: unknown; factsCited?: unknown; fallback?: unknown; decision?: unknown; goalsSnapshot?: unknown; mirror?: unknown };
    return {
      ...(p.base || {}), source: p.source,
      assembled: !!pv.assembled, blocks: Array.isArray(pv.blocks) ? pv.blocks : [],
      factsCited: Array.isArray(pv.factsCited) ? pv.factsCited : [],
      fallback: !!pv.fallback, decision: pv.decision ?? null, goalsSnapshot: pv.goalsSnapshot ?? null,
      mirror: typeof pv.mirror === 'string' ? pv.mirror : (p.mirror ?? null),
    };
  }
  const prev = (p.prevFactsCited || []).filter((k) => typeof k === 'string');
  const cited = p.out?.factUsed && p.out.factUsedKind === 'diagnosis' && p.decision
    ? [...new Set([...prev, factKeyOf(p.decision.unit, p.out.factUsed)])]
    : prev;
  return {
    ...(p.base || {}),
    source: p.source,
    assembled: !!p.out,
    blocks: p.out?.usedBlocks || [],
    factsCited: cited,
    fallback: p.out?.fallback || false,
    decision: p.decision ? { unit: p.decision.unit, step: p.decision.step, mode: p.decision.mode, pivotTo: p.decision.pivotTo } : null,
    goalsSnapshot: p.goalsSnapshot ?? null,
    mirror: p.mirror ?? null,
  };
}
