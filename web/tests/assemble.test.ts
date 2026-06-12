/**
 * tests/assemble.test.ts — 조립기 테스트 묶음 (WBS D-12 — D-01~D-11 + C-02 렌더러)
 * 헬퍼 mkPool = 테스트 전용 미니 풀(실 풀 의존 금지 — 콘텐츠 변경에 강건).
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  assembleLetter, assembleAndPolish, buildLetterCtx, collectBlockLedger, resetFactsCitedFor, factKeyOf,
  type AssembleInput,
} from '../lib/assembleLetter';
import { josa, renderBlock, type LetterBlock } from '../lib/letterBlocks';
import { UNITS } from '../lib/curriculumUnits';
import type { DailyDecision } from '../lib/curriculum';
import type { FactCard } from '../lib/coachFacts';

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
const mkB = (unit: string, stage: string, variant: number, text: string, o: Partial<LetterBlock> = {}): LetterBlock =>
  ({ id: `${unit}.${stage}.${variant}`, unit, stage, variant, text, slots: [], tone: 'warm', ...o } as LetterBlock);

/** 미니 풀 — 유닛 8 stage × 4변형 + 공용 6 stage × 4변형. 블록당 2문장(pivot-bridge만 1문장). */
function mkPool(unit = 'table-stage'): LetterBlock[] {
  const out: LetterBlock[] = [];
  for (let v = 1; v <= 4; v++) {
    out.push(mkB(unit, 'intro', v, `이번 주 기록에서 {fact}. 같이 천천히 들여다보려 해요(도입${v}).`, { slots: ['fact'], requires: ['fact'] }));
    out.push(mkB(unit, 'why', v, `이 걸음에는 작은 이유가 있어요. 아이 마음이 한결 편해진답니다(원리${v}).`));
    out.push(mkB(unit, 'how', v, `오늘은 장면 하나만 떠올려 보아요. 조용히 기다리는 그 순간이요(방법${v}).`));
    out.push(mkB(unit, 'observe', v, `{fact}. 그 순간이 아이에게 신호가 되었을 거예요(관찰${v}).`, { slots: ['fact'], requires: ['fact'] }));
    out.push(mkB(unit, 'obstacle', v, `잘 안 되는 날도 있지요. 그런 날은 한 템포 쉬어가도 괜찮아요(걸림${v}).`));
    out.push(mkB(unit, 'advance', v, `어제 걸음이 보였어요. 오늘은 {next} 차례예요(전진${v}).`, { slots: ['next'], requires: ['next'] }));
    out.push(mkB(unit, 'praise', v, `어제의 한 걸음, 참 잘하셨어요. 그 페이스 그대로면 좋아요(칭찬${v}).`, { tone: 'praise' }));
    out.push(mkB(unit, 'pivot', v, `이쪽은 잠시 쉬어 가요. 결이 다른 길을 먼저 볼게요(전환${v}).`));
  }
  for (let v = 1; v <= 4; v++) {
    out.push(mkB('common', 'opener-weekday', v, `오늘도 식탁 앞에서 하루를 여시네요. 함께 가벼운 마음으로 시작해요(워밍${v}).`));
    out.push(mkB('common', 'plateau', v, `잔잔한 구간도 의미가 있어요. 꾸준함이 가장 큰 힘이 됩니다(잔잔${v}).`, { tone: 'praise' }));
    out.push(mkB('common', 'graduate', v, `이제 몸에 붙은 게 느껴져요. 참 단단해진 걸음이에요(졸업${v}).`, { tone: 'praise' }));
    out.push(mkB('common', 'celebrate', v, `반가운 변화가 보여요. 오늘은 같이 기뻐하는 날이에요(축하${v}).`, { tone: 'praise' }));
    out.push(mkB('common', 'lowdata', v, `기록이 잠시 비었네요. 기억나는 만큼만 살짝 남겨주세요(공백${v}).`));
    out.push(mkB('common', 'pivot-bridge', v, `한 가지를 충분히 살펴봤으니 이번엔 결이 다른 걸음을 잡아볼게요(다리${v}).`));
  }
  return out;
}

const D = (mode: DailyDecision['mode'], step = 1): DailyDecision => ({ unit: 'table-stage', step, mode, pivotTo: mode === 'pivot' ? 'table-stage' : null });
const DIAG: FactCard = { key: 'env-week', text: '최근 기록 일곱 끼 중 다섯 끼가 화면과 함께였어요', kind: 'diagnosis' };
const DAILY: FactCard = { key: 'env-y', text: '어제 저녁을 식탁에 앉아 먹었어요', kind: 'daily' };
const baseIn = (over: Partial<AssembleInput> = {}): AssembleInput => ({
  decision: D('advance'), unitDef: UNITS['table-stage'], factCards: [DAILY, DIAG], blocks: mkPool(),
  blockLedger: [], factsCited: [], name: '아린', daySeed: 20260612, cidHash: 7, ...over,
});
const stagesOf = (used: string[]) => used.map((id) => id.split('.').slice(0, 2).join('.'));
const sentEnds = (t: string) => t.split(/(?<=[.!?…])\s+/).map((s) => s.replace(/[.!?…\s]+$/, '').slice(-3));
const hasRun = (t: string) => { const e = sentEnds(t); for (let i = 0; i + 2 < e.length; i++) if (e[i] && e[i] === e[i + 1] && e[i] === e[i + 2]) return true; return false; };

// ── C-02 — 조사·렌더러 ────────────────────────────────────────────────────────
describe('C-02 슬롯 문법·렌더러', () => {
  it('C-02-1 받침 조합: 이/가·을/를·으로', () => {
    expect(josa('콩', '이가')).toBe('이');
    expect(josa('두부', '이가')).toBe('가');
    expect(josa('콩', '을를')).toBe('을');
    expect(josa('두부', '을를')).toBe('를');
    expect(josa('식탁', '으로')).toBe('으로');
    expect(josa('교실', '으로')).toBe('로');   // ㄹ 받침 예외
  });
  it('C-02-1b 이름 조사: 아린이가 / 지호가', () => {
    const b = mkB('table-stage', 'why', 1, '{name}{이가} 어제 잘 먹었어요. 작은 변화가 보여요.', { slots: ['name'] });
    expect(renderBlock(b, { name: '아린' })).toContain('아린이가 어제');
    expect(renderBlock(b, { name: '지호' })).toContain('지호가 어제');
  });
  it('C-02-2 슬롯 미충족 → null', () => {
    const b = mkB('table-stage', 'observe', 1, '{fact}. 좋은 신호예요.', { slots: ['fact'], requires: ['fact'] });
    expect(renderBlock(b, {})).toBeNull();
    expect(renderBlock(b, { fact: '' })).toBeNull();
  });
  it('C-02-3 이중 치환 없음(값 안의 토큰은 재치환 안 됨)', () => {
    const b = mkB('table-stage', 'why', 1, '{fact} 라는 기록이 남았어요. 차근차근 가요.', { slots: ['fact'] });
    expect(renderBlock(b, { fact: '아이가 {name} 흉내', name: 'X' })).toBeNull();   // 잔여 토큰 검출 → null(방어)
  });
});

// ── D-01 — mode별 시퀀스 ──────────────────────────────────────────────────────
describe('D-01 편지 구조 규격', () => {
  it('D-01-1 advance: observe → advance', () => {
    const out = assembleLetter(baseIn());
    const st = stagesOf(out.usedBlocks);
    expect(st[0]).toBe('table-stage.observe');
    expect(st[1]).toBe('table-stage.advance');
    expect(out.letter).toContain(DAILY.text.slice(0, 10));
  });
  it('D-01-1 deepen: praise → how|obstacle', () => {
    const st = stagesOf(assembleLetter(baseIn({ decision: D('deepen') })).usedBlocks);
    expect(st[0]).toBe('table-stage.praise');
    expect(['table-stage.how', 'table-stage.obstacle']).toContain(st[1]);
  });
  it('D-01-1 pivot: pivot-bridge → intro', () => {
    const st = stagesOf(assembleLetter(baseIn({ decision: D('pivot') })).usedBlocks);
    expect(st[0]).toBe('common.pivot-bridge');
    expect(st[1]).toBe('table-stage.intro');
  });
  it('D-01-1 maintain: 유닛 침묵(공용만)', () => {
    const st = stagesOf(assembleLetter(baseIn({ decision: D('maintain') })).usedBlocks);
    expect(st).toEqual(['common.opener-weekday', 'common.plateau']);
  });
  it('D-01-1 celebrate: graduate → praise', () => {
    const st = stagesOf(assembleLetter(baseIn({ decision: D('celebrate') })).usedBlocks);
    expect(st[0]).toBe('common.graduate');
    expect(st[1]).toBe('table-stage.praise');
  });
  it('D-01-1 observe: 사실 있으면 observe→why, 없으면 워밍→why', () => {
    const a = stagesOf(assembleLetter(baseIn({ decision: D('observe') })).usedBlocks);
    expect(a).toEqual(['table-stage.observe', 'table-stage.why']);
    const b = stagesOf(assembleLetter(baseIn({ decision: D('observe'), factCards: [] })).usedBlocks);
    expect(b).toEqual(['common.opener-weekday', 'table-stage.why']);
  });
  it('D-01-1 주 첫 편지: intro → why', () => {
    const st = stagesOf(assembleLetter(baseIn({ introNeeded: true })).usedBlocks);
    expect(st[0]).toBe('table-stage.intro');
    expect(st[1]).toBe('table-stage.why');
  });
});

// ── D-02 — 선택 결정론 ────────────────────────────────────────────────────────
describe('D-02 블록 선택 결정론', () => {
  it('D-02-1 원장(3일) 제외', () => {
    const first = assembleLetter(baseIn());
    const again = assembleLetter(baseIn({ blockLedger: first.usedBlocks }));
    expect(again.usedBlocks.some((id) => first.usedBlocks.includes(id))).toBe(false);
  });
  it('D-02-2 같은 입력 = 같은 출력(재현성)', () => {
    expect(JSON.stringify(assembleLetter(baseIn()))).toBe(JSON.stringify(assembleLetter(baseIn())));
  });
  it('D-02-3 requires 필터: 사실 없으면 observe 대신 praise 대체', () => {
    const out = assembleLetter(baseIn({ factCards: [] }));
    const st = stagesOf(out.usedBlocks);
    expect(st[0]).toBe('table-stage.praise');
    expect(st).toContain('table-stage.advance');
    expect(out.factUsed).toBeNull();
  });
  it('D-02-4 forbids×avoidTags: push 캡 필터(F-03 소스)', () => {
    const pool = mkPool().map((b) => (b.id === 'table-stage.advance.1' ? { ...b, forbids: ['push'] } : b));
    for (let s = 0; s < 4; s++) {
      const out = assembleLetter(baseIn({ blocks: pool, avoidTags: ['push'], daySeed: s }));
      expect(out.usedBlocks).not.toContain('table-stage.advance.1');
    }
  });
});

// ── D-03 — 비반복 원장 ────────────────────────────────────────────────────────
describe('D-03 비반복 원장', () => {
  it('D-03-1 collectBlockLedger: context.blocks 수집(널 안전·중복 제거)', () => {
    expect(collectBlockLedger([{ blocks: ['a', 'b'] }, null, { blocks: ['b', 'c'] }, { other: 1 } as Record<string, unknown>]))
      .toEqual(['a', 'b', 'c']);
  });
});

// ── D-04 — 사실 인용 1회 원장 ─────────────────────────────────────────────────
describe('D-04 사실 재서술 구조 봉쇄', () => {
  it('D-04-1 진단 카드는 도입일 1회 — 이후 편지에서 차단', () => {
    const day1 = assembleLetter(baseIn({ introNeeded: true, factCards: [DIAG] }));
    expect(day1.factUsed).toBe('env-week');
    expect(day1.factUsedKind).toBe('diagnosis');
    expect(day1.letter).toContain(DIAG.text.slice(0, 10));
    const ctx = buildLetterCtx({ source: 'test', out: day1, decision: D('advance'), prevFactsCited: [] });
    expect(ctx.factsCited).toEqual([factKeyOf('table-stage', 'env-week')]);
    const day2 = assembleLetter(baseIn({ factCards: [DIAG], factsCited: ctx.factsCited as string[] }));
    expect(day2.letter).not.toContain(DIAG.text.slice(0, 10));   // 재서술 0
    expect(day2.factUsed).toBeNull();
  });
  it('D-04-2 daily 카드는 매일 허용(원장 불증가)', () => {
    const out = assembleLetter(baseIn());
    expect(out.factUsedKind).toBe('daily');
    const ctx = buildLetterCtx({ source: 'test', out, decision: D('advance'), prevFactsCited: ['table-stage:env-week'] });
    expect(ctx.factsCited).toEqual(['table-stage:env-week']);
  });
  it('D-04-3 원장 reuse 보존(비조립 경로에서도 누적 유지 — S6 교훈)', () => {
    const ctx = buildLetterCtx({ source: 'reuse', out: null, prevFactsCited: ['table-stage:env-week'] });
    expect(ctx.factsCited).toEqual(['table-stage:env-week']);
    expect(ctx.assembled).toBe(false);
  });
  it('D-04-4 시급 예외(F-04)만 재인용 우회', () => {
    const cited = [factKeyOf('table-stage', 'env-week')];
    const blocked = assembleLetter(baseIn({ factCards: [DIAG], factsCited: cited }));
    expect(blocked.letter).not.toContain(DIAG.text.slice(0, 10));
    const urgent = assembleLetter(baseIn({ factCards: [DIAG], factsCited: cited, urgent: true }));
    expect(urgent.letter).toContain(DIAG.text.slice(0, 10));
  });
  it('D-04-5 유닛 재활성 시 그 유닛 원장만 리셋', () => {
    expect(resetFactsCitedFor(['table-stage:env-week', 'autonomy-part:x'], 'table-stage')).toEqual(['autonomy-part:x']);
  });
});

// ── D-05 — 연결·규격 ─────────────────────────────────────────────────────────
describe('D-05 문장 결합 규칙', () => {
  it('D-05-1 같은 종결 3연속 회피(충돌 변형 대신 다른 변형 선택)', () => {
    const pool = [
      mkB('table-stage', 'observe', 1, '{fact}. 오늘도 식탁에 함께 앉아 주세요.', { slots: ['fact'], requires: ['fact'] }),
      mkB('table-stage', 'advance', 1, '내일도 같은 자리에서 꼭 한 번 만나 주세요.', { slots: [], requires: ['next'] }),
      mkB('table-stage', 'why', 1, '오늘도 그 시간을 가만히 지켜 주세요.', {}),
      mkB('table-stage', 'why', 2, '이 걸음에는 이유가 있어요. 아이 마음이 한결 편해진답니다.', {}),
    ];
    // 어미 흐름: 었어요·주세요·주세요 — why.1(주세요)이면 3연속 → why.2가 선택돼야 한다
    const out = assembleLetter(baseIn({ blocks: pool, daySeed: 2, cidHash: 0 }));
    expect(out.fallback).toBe(false);
    expect(hasRun(out.letter)).toBe(false);
    expect(out.usedBlocks).toContain('table-stage.why.2');
  });
  it('D-05-2 길이 캡 380: 초과 시 선택 블록 드랍', () => {
    const longFact: FactCard = { key: 'env-y', text: '어제 저녁 식탁에서 ' + '아주 차분하게 한 술 한 술 즐겁게 '.repeat(8) + '먹었어요', kind: 'daily' };
    const out = assembleLetter(baseIn({ factCards: [longFact] }));
    expect(out.letter.length).toBeLessThanOrEqual(380);
    expect(out.usedBlocks.length).toBe(2);   // optional why 드랍됨
  });
});

// ── D-06 — oneliner ──────────────────────────────────────────────────────────
describe('D-06 oneliner 조립', () => {
  it('D-06-1 변형 회전(시드 결정론)', () => {
    const set = new Set([0, 1, 2, 3, 4, 5].map((s) => assembleLetter(baseIn({ daySeed: s })).oneliner));
    expect(set.size).toBeGreaterThanOrEqual(4);
    expect(assembleLetter(baseIn()).oneliner).toBe(assembleLetter(baseIn()).oneliner);
  });
  it('D-06-2 길이 캡 60자(넘치면 next 없는 변형)', () => {
    const def = { ...UNITS['table-stage'], steps: UNITS['table-stage'].steps.map((s, i) => (i === 0 ? { ...s, behavior: '아주'.repeat(35) } : s)) };
    for (let s = 0; s < 6; s++) {
      expect(assembleLetter(baseIn({ unitDef: def, daySeed: s })).oneliner.length).toBeLessThanOrEqual(60);
    }
  });
});

// ── D-07·D-08 — 어법 교정·윤문 옵션 ──────────────────────────────────────────
describe('D-07 polishKo · D-08 윤문 옵션', () => {
  it("D-07-1 '국을 마시고' → '국을 먹고'", () => {
    const pool = mkPool().map((b) => (b.id === 'common.opener-weekday.1'
      ? { ...b, text: '따뜻한 국을 마시고 하루를 여는 집도 있지요. 오늘도 식탁 곁에서 시작해요(워밍1).' } : b));
    let hit = false;
    for (let s = 0; s < 4 && !hit; s++) {
      const out = assembleLetter(baseIn({ blocks: pool, decision: D('maintain'), daySeed: s }));
      if (out.usedBlocks.includes('common.opener-weekday.1')) {
        expect(out.letter).toContain('국을 먹고');
        hit = true;
      }
    }
    expect(hit).toBe(true);
  });
  it('D-08-1 OFF=0콜 · D-08-2 ON=1콜·실패 시 원문', async () => {
    const spy = vi.fn(async () => '윤문된 편지');
    const off = await assembleAndPolish({ ...baseIn(), polish: false }, spy);
    expect(spy).toHaveBeenCalledTimes(0);
    expect(off.llmCalls).toBe(0);
    const on = await assembleAndPolish({ ...baseIn(), polish: true }, spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(on.letter).toBe('윤문된 편지');
    expect(on.llmCalls).toBe(1);
    const boom = vi.fn(async () => { throw new Error('x'); });
    const failed = await assembleAndPolish({ ...baseIn(), polish: true }, boom as unknown as (l: string) => Promise<string>);
    expect(failed.letter).toBe(assembleLetter(baseIn()).letter);
  });
});

// ── D-09 — 최종 스캔 ─────────────────────────────────────────────────────────
describe('D-09 조립 결과 최종 스캔', () => {
  it('D-09-1 위반 블록 → 변형 재선택 + 경고 로그', () => {
    const pool = mkPool().map((b) =>
      b.id === 'table-stage.advance.1' ? { ...b, text: '지난달부터 쭉 이어 온 흐름이 있어요. 오늘은 {next} 차례예요(전진1).' } : b);
    let sawWarn = false;
    for (let s = 0; s < 6; s++) {
      const out = assembleLetter(baseIn({ blocks: pool, daySeed: s }));
      expect(out.letter).not.toContain('지난달');   // 위반 표현은 절대 발행 안 됨
      if (out.warnings.some((w) => w.includes('D-09'))) sawWarn = true;
    }
    expect(sawWarn).toBe(true);
  });
  it('D-09-2 동적 detForbid 합류', () => {
    const pool = mkPool().map((b) =>
      b.id === 'table-stage.why.1' ? { ...b, text: '뷔페에 다녀온 이야기가 떠오르네요. 그래도 흐름은 이어집니다(원리1).' } : b);
    for (let s = 0; s < 6; s++) {
      const out = assembleLetter(baseIn({ blocks: pool, detForbid: /뷔페/, daySeed: s }));
      expect(out.letter).not.toContain('뷔페');
    }
  });
});

// ── D-10 — context 스냅샷 단일화 ──────────────────────────────────────────────
describe('D-10 context 스냅샷 v3', () => {
  it('D-10-1 grep: ctx v3 봉투 직접 조립 금지 — assembled: 마커는 buildLetterCtx에만(쓰기 경로 단일화)', () => {
    // factsCited:는 assembleLetter '입력' 전달에도 정당하게 등장(러너·크론) — 봉투 조립의 고유 마커는 assembled:
    const walk = (dir: string): string[] => {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) return [];
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
      });
    };
    const files = [...walk(path.join(process.cwd(), 'lib')), ...walk(path.join(process.cwd(), 'app'))];
    const offenders = files.filter((f) => !f.endsWith(`lib${path.sep}assembleLetter.ts`) && /assembled\s*:/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('D-10-2 base 병합 + 결정 스냅샷', () => {
    const out = assembleLetter(baseIn());
    const ctx = buildLetterCtx({ base: { reds: ['철분'], source: '덮어씀' }, source: 'cron', out, decision: D('advance'), goalsSnapshot: null });
    expect(ctx.reds).toEqual(['철분']);
    expect(ctx.source).toBe('cron');
    expect(ctx.assembled).toBe(true);
    expect((ctx.decision as { mode: string }).mode).toBe('advance');
    expect(ctx.blocks).toEqual(out.usedBlocks);
  });
});

// ── D-11 — 폴백 ──────────────────────────────────────────────────────────────
describe('D-11 블록 부재 폴백', () => {
  it('D-11-1 후보 0 → 안전 편지 + 플래그(LLM 폴백 금지)', () => {
    const empty = assembleLetter(baseIn({ blocks: [] }));
    expect(empty.fallback).toBe(true);
    expect(empty.letter.length).toBeGreaterThan(20);
    expect(empty.warnings.some((w) => w.includes('폴백'))).toBe(true);
    const commonsOnly = assembleLetter(baseIn({ blocks: mkPool().filter((b) => b.unit === 'common') }));
    expect(commonsOnly.fallback).toBe(true);
    expect(stagesOf(commonsOnly.usedBlocks)).toEqual(['common.opener-weekday', 'common.plateau']);
  });
  it('D-11-2 tone 제한으로 필수 위치가 굶어도 발행은 보장(E-05 배선 주의 문서화)', () => {
    const out = assembleLetter(baseIn({ decision: D('deepen'), tones: ['empathy'] }));
    expect(out.fallback).toBe(true);
    expect(out.letter.length).toBeGreaterThan(20);
  });
});

// ── D-12 — 6일 통주 통합 ─────────────────────────────────────────────────────
describe('D-12 6일 연속 조립 통합', () => {
  it('3일 창 블록 중복 0 · 진단 재서술 0 · 규격 준수 · 폴백 0', () => {
    const ctxs: Array<Record<string, unknown>> = [];
    let cited: string[] = [];
    for (let d = 0; d < 6; d++) {
      const ledger = collectBlockLedger(ctxs.slice(-3));
      const decision = D(d === 0 ? 'advance' : d % 2 ? 'deepen' : 'advance');
      const out = assembleLetter(baseIn({
        decision, introNeeded: d === 0, blockLedger: ledger, factsCited: cited, daySeed: 100 + d,
      }));
      expect(out.fallback).toBe(false);
      expect(out.usedBlocks.some((id) => ledger.includes(id))).toBe(false);          // ① 3일 창 중복 0
      if (d === 0) expect(out.letter).toContain(DIAG.text.slice(0, 10));             // 도입일 진단 1회
      else expect(out.letter).not.toContain(DIAG.text.slice(0, 10));                 // ② 이후 재서술 0
      expect(out.letter.length).toBeLessThanOrEqual(380);                             // ③ 길이 규격
      const ctx = buildLetterCtx({ source: 'test', out, decision, prevFactsCited: cited });
      cited = ctx.factsCited as string[];
      ctxs.push(ctx);
    }
    expect(cited).toEqual([factKeyOf('table-stage', 'env-week')]);                    // 진단 인용은 평생 1회로 남음
  });
});
