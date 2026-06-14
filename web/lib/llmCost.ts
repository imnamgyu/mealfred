/**
 * lib/llmCost.ts — LLM 토큰 사용량 → 원가 계산(순수 함수). 코칭 유지비용 실측용.
 *
 * 단가는 2026-06 공식가(USD/token). 프롬프트 캐싱: read=0.1×in, write=1.25×in(5분 TTL).
 * callClaude가 응답의 usage(input/output/cache_read/cache_creation)를 적재 → 이 모듈이 원가로 환산.
 */

export type Family = 'haiku' | 'sonnet' | 'opus' | 'other';

/** 한 LLM 콜의 토큰 사용량(Anthropic usage 필드 매핑). */
export type UsageRec = { model: string; input: number; output: number; cacheRead: number; cacheWrite: number };

export const KRW_PER_USD = 1300;   // 환율(표시용·조정 가능)

// USD per token. (Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15, Opus 4.x $15/$75 per MTok)
export const PRICE: Record<Family, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  haiku: { in: 1.0e-6, out: 5.0e-6, cacheRead: 0.10e-6, cacheWrite: 1.25e-6 },
  sonnet: { in: 3.0e-6, out: 15.0e-6, cacheRead: 0.30e-6, cacheWrite: 3.75e-6 },
  opus: { in: 15.0e-6, out: 75.0e-6, cacheRead: 1.50e-6, cacheWrite: 18.75e-6 },
  other: { in: 1.0e-6, out: 5.0e-6, cacheRead: 0.10e-6, cacheWrite: 1.25e-6 },
};

export function familyOf(model: string): Family {
  const m = (model || '').toLowerCase();
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('opus')) return 'opus';
  return 'other';
}

/** 한 콜의 원가(USD). 캐시 read/write 단가 분리 적용. */
export function costUsdOf(rec: UsageRec): number {
  const p = PRICE[familyOf(rec.model)];
  return rec.input * p.in + rec.output * p.out + rec.cacheRead * p.cacheRead + rec.cacheWrite * p.cacheWrite;
}

type FamTokens = { input: number; output: number; cacheRead: number; cacheWrite: number };
const zeroFam = (): FamTokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

/** 여러 콜을 패밀리(haiku/sonnet)별 토큰 합 + 총 콜수 + 총원가(USD)로 집계. */
export function aggregateUsage(recs: UsageRec[]): {
  calls: number;
  costUsd: number;
  fam: Record<Family, FamTokens>;
} {
  const fam: Record<Family, FamTokens> = { haiku: zeroFam(), sonnet: zeroFam(), opus: zeroFam(), other: zeroFam() };
  let costUsd = 0;
  for (const r of recs) {
    const f = familyOf(r.model);
    fam[f].input += r.input; fam[f].output += r.output; fam[f].cacheRead += r.cacheRead; fam[f].cacheWrite += r.cacheWrite;
    costUsd += costUsdOf(r);
  }
  return { calls: recs.length, costUsd, fam };
}

/** 저장된 패밀리별 토큰 행에서 원가(USD)를 재계산(단가 변동 시 소급 가능). */
export function costFromTokens(t: { haiku?: FamTokens; sonnet?: FamTokens }): number {
  const h = t.haiku ? costUsdOf({ model: 'haiku', ...t.haiku }) : 0;
  const s = t.sonnet ? costUsdOf({ model: 'sonnet', ...t.sonnet }) : 0;
  return h + s;
}

export const krw = (usd: number): number => usd * KRW_PER_USD;
