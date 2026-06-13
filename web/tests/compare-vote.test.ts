/**
 * tests/compare-vote.test.ts — EPIC G compareVote 순수 함수 회귀(불변 원칙②).
 *
 * judgeWinner/scoreVariant/repeatRate/tally/buildCompareSummary 결정론·적대·콜드스타트.
 * 핵심 회귀: '아린 v3 수렴'(B repeat 0·A repeat 多) 시나리오 → B 승자 고정.
 */
import { describe, it, expect } from 'vitest';
import {
  judgeWinner, scoreVariant, repeatRate, tally, buildCompareSummary, confidenceOf,
  type Vote,
} from '../lib/compareVote';

// ── scoreVariant ────────────────────────────────────────────────────────────
describe('scoreVariant', () => {
  it('G-02-1 가중 점수 up*2-down-repeat*1.5', () => {
    expect(scoreVariant({ up: 3, down: 1, repeat: 2 })).toBe(3 * 2 - 1 - 2 * 1.5); // = 2
  });
  it('G-02-2 표본 0 → 0', () => {
    expect(scoreVariant({ up: 0, down: 0, repeat: 0 })).toBe(0);
  });
  it('G-02-3 repeat가 down보다 무겁다', () => {
    expect(scoreVariant({ up: 0, down: 0, repeat: 2 })).toBeLessThan(scoreVariant({ up: 0, down: 2, repeat: 0 }));
  });
  it('G-02-3b up 단독 양수', () => {
    expect(scoreVariant({ up: 5, down: 0, repeat: 0 })).toBe(10);
  });
});

// ── repeatRate ──────────────────────────────────────────────────────────────
describe('repeatRate', () => {
  it('G-02-4 분자/분모', () => {
    expect(repeatRate({ up: 1, down: 1, repeat: 2 })).toBe(2 / 4);
  });
  it('G-02-5 분모 0 → 0(NaN 아님)', () => {
    const r = repeatRate({ up: 0, down: 0, repeat: 0 });
    expect(r).toBe(0);
    expect(Number.isNaN(r)).toBe(false);
  });
  it('전부 repeat → 1', () => {
    expect(repeatRate({ up: 0, down: 0, repeat: 3 })).toBe(1);
  });
});

// ── tally ───────────────────────────────────────────────────────────────────
describe('tally', () => {
  it('변형별 집계', () => {
    const votes: Vote[] = [
      { variant: 'A', rating: 'up' }, { variant: 'A', rating: 'repeat' },
      { variant: 'B', rating: 'up' }, { variant: 'B', rating: 'down' },
    ];
    const { A, B } = tally(votes);
    expect(A).toEqual({ up: 1, down: 0, repeat: 1 });
    expect(B).toEqual({ up: 1, down: 1, repeat: 0 });
  });
  it('적대: 알 수 없는 variant/rating 무시', () => {
    const votes = [
      { variant: 'C', rating: 'up' },
      { variant: 'A', rating: 'love' },
      { variant: 'A', rating: 'up' },
    ] as unknown as Vote[];
    const { A, B } = tally(votes);
    expect(A).toEqual({ up: 1, down: 0, repeat: 0 });
    expect(B).toEqual({ up: 0, down: 0, repeat: 0 });
  });
  it('빈 배열 안전', () => {
    expect(tally([])).toEqual({ A: { up: 0, down: 0, repeat: 0 }, B: { up: 0, down: 0, repeat: 0 } });
  });
});

// ── judgeWinner ─────────────────────────────────────────────────────────────
describe('judgeWinner', () => {
  const mk = (a: { up?: number; down?: number; repeat?: number }, b: { up?: number; down?: number; repeat?: number }): Vote[] => {
    const out: Vote[] = [];
    (['up', 'down', 'repeat'] as const).forEach((r) => {
      for (let i = 0; i < (a[r] || 0); i++) out.push({ variant: 'A', rating: r });
      for (let i = 0; i < (b[r] || 0); i++) out.push({ variant: 'B', rating: r });
    });
    return out;
  };

  it('G-02-7 무투표·점수 B 우세 → B', () => {
    const r = judgeWinner(mk({ repeat: 3 }, { up: 5 }));
    expect(r.winner).toBe('B');
    expect(r.bScore).toBeGreaterThan(r.aScore);
  });
  it('명확차 A 우세 → A', () => {
    const r = judgeWinner(mk({ up: 8 }, { down: 4, repeat: 2 }));
    expect(r.winner).toBe('A');
  });
  it('G-02-9 미세차 tie', () => {
    // 총표본 20, aScore=10, bScore=10.5 → |0.5| < max(1, 2)=2 → tie
    // A: up=5 → 10 (n=5) ; B: up=6 down=2 repeat=... 맞추기보다 직접 구성:
    // A up5 → score10 n5 ; B up6 down1 repeat... → 직접 조정
    const votes: Vote[] = [];
    for (let i = 0; i < 5; i++) votes.push({ variant: 'A', rating: 'up' }); // aScore=10, n=5
    // B: up=6 → 12, down=1 → -1, repeat=... need bScore=10.5 impossible by integers; use tie via diff<thr
    // bScore=10.5 not reachable with int counts. Test tie via small diff instead:
    for (let i = 0; i < 5; i++) votes.push({ variant: 'B', rating: 'up' }); // bScore=10, n=5
    votes.push({ variant: 'B', rating: 'down' }); // bScore=9, n=6
    // diff |10-9|=1 ; n=11 ; thr=max(1, 1.1)=1.1 ; 1<1.1 → tie
    const r = judgeWinner(votes);
    expect(r.n).toBe(11);
    expect(r.winner).toBe('tie');
  });
  it('G-02-10 명확차 B 승자(총표본 충분)', () => {
    // A up2 down3 → score 4-3=1 (n5) ; B up10 → 20 (n10) ; diff 19 > thr → B
    const r = judgeWinner(mk({ up: 2, down: 3 }, { up: 10 }));
    expect(r.winner).toBe('B');
  });
  it('insufficient — 총표본 < minN(4)', () => {
    const r = judgeWinner(mk({ up: 1 }, { up: 1 })); // n=2
    expect(r.winner).toBe('insufficient');
    expect(r.n).toBe(2);
  });
  it('minN 옵션 조정', () => {
    const r = judgeWinner(mk({ up: 1 }, { up: 1 }), { minN: 2 }); // n=2 ≥ 2
    expect(r.winner).not.toBe('insufficient');
  });
  it('tie via 점수 동률(표본 충분)', () => {
    // A up3 → 6 (n3) ; B up3 → 6 (n3) ; n=6 ; diff 0 < thr → tie
    const r = judgeWinner(mk({ up: 3 }, { up: 3 }));
    expect(r.winner).toBe('tie');
  });
  it('repeat 신고가 B를 끌어내려 A 승자', () => {
    // A up6 → 12 (n6) ; B up6 repeat6 → 12-9=3 (n12) ; diff 9 > thr(max(1,1.8)) → A
    const r = judgeWinner(mk({ up: 6 }, { up: 6, repeat: 6 }));
    expect(r.winner).toBe('A');
    expect(r.bRepeat).toBe(0.5);
  });
  it('aRepeat/bRepeat 계산', () => {
    const r = judgeWinner(mk({ up: 2, repeat: 2 }, { up: 4 }));
    expect(r.aRepeat).toBe(0.5);
    expect(r.bRepeat).toBe(0);
  });
});

// ── confidence ──────────────────────────────────────────────────────────────
describe('confidenceOf', () => {
  it('G-02-11 low (<5)', () => { expect(confidenceOf(3)).toBe('low'); });
  it('G-02-12 mid (<15)', () => { expect(confidenceOf(10)).toBe('mid'); });
  it('G-02-13 high (≥15)', () => { expect(confidenceOf(20)).toBe('high'); });
  it('경계 5 → mid', () => { expect(confidenceOf(5)).toBe('mid'); });
  it('경계 15 → high', () => { expect(confidenceOf(15)).toBe('high'); });
});

// ── buildCompareSummary ───────────────────────────────────────────────────────
describe('buildCompareSummary', () => {
  it('G-02-14 B 우세 요약', () => {
    const votes: Vote[] = [];
    for (let i = 0; i < 8; i++) votes.push({ variant: 'B', rating: 'up' });
    for (let i = 0; i < 5; i++) votes.push({ variant: 'A', rating: 'up' });
    for (let i = 0; i < 3; i++) votes.push({ variant: 'A', rating: 'repeat' });
    const s = buildCompareSummary(votes);
    expect(s).toContain('B');
    expect(s).toContain('👍');
    expect(s).toContain('🔁');
  });
  it('G-02-15 콜드스타트 — 빈 입력 throw 없이 안전 문자열', () => {
    const s = buildCompareSummary([]);
    expect(typeof s).toBe('string');
    expect(s).toContain('데이터 부족');
  });
});

// ── 적대·순수성 ────────────────────────────────────────────────────────────────
describe('적대·순수성', () => {
  it('G-02-17 같은 입력 2회 → byte-동일, 입력 불변', () => {
    const votes: Vote[] = [{ variant: 'A', rating: 'up' }, { variant: 'B', rating: 'repeat' }];
    const snap = JSON.stringify(votes);
    const r1 = judgeWinner(votes);
    const r2 = judgeWinner(votes);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(JSON.stringify(votes)).toBe(snap); // 입력 객체 불변
  });
  it('G-02-18 음수 카운트 방어 — throw 없이 수치 반환', () => {
    expect(() => scoreVariant({ up: -1, down: -2, repeat: -3 } as never)).not.toThrow();
    expect(scoreVariant({ up: -1, down: -2, repeat: -3 } as never)).toBe(0); // num()이 0으로 클램프
    expect(repeatRate({ up: -1, down: 0, repeat: 0 } as never)).toBe(0);
  });
  it('NaN/undefined 입력 방어', () => {
    expect(scoreVariant({ up: NaN, down: undefined, repeat: null } as never)).toBe(0);
    expect(() => judgeWinner(undefined as never)).not.toThrow();
    expect(judgeWinner(undefined as never).n).toBe(0);
  });
});

// ── 아린 시나리오 회귀(G-12-2) ──────────────────────────────────────────────────
describe('G-12-2 아린 v3 수렴 시나리오', () => {
  it("A 수렴(repeat 多)·B 다양(repeat 0) → B 승자", () => {
    // 아린 6통: 부모/이사님이 A에 🔁(또 비슷) 누적, B엔 👍.
    const votes: Vote[] = [];
    for (let i = 0; i < 6; i++) votes.push({ variant: 'B', rating: 'up' });   // B bScore=12, n6
    for (let i = 0; i < 2; i++) votes.push({ variant: 'A', rating: 'up' });   // A up2
    for (let i = 0; i < 4; i++) votes.push({ variant: 'A', rating: 'repeat' }); // A repeat4 → 4-6=-2, n6
    const r = judgeWinner(votes);
    expect(r.winner).toBe('B');
    expect(r.aRepeat).toBeGreaterThan(r.bRepeat);
    expect(confidenceOf(r.n)).toBe('mid'); // n=12
  });
});
