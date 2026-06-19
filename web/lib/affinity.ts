/**
 * lib/affinity.ts — Phase B: 궁합 그래프 웹/LLM 폴백 + 캐시 (서버 전용).
 * 우선순위: ① 정적 그래프(neighborsOf) ② affinity_cache(DB) ③ LLM(Claude haiku, 도감 어휘 제약) → 캐시.
 * 정적 그래프에 이웃이 충분하면 LLM 안 부른다('없는 조합만 폴백' = 이사님 결정 하이브리드).
 */
import { createClient } from '@supabase/supabase-js';
import { neighborsOf, type Neighbor } from './foodGraph';
import { getIngredientsLight } from './graphSource';   // ⭐ JSON 직접 import 격리(handoff §4)
import { llmText, hasLLMBackend } from './llmText';   // ⭐ DeepSeek 1차·Claude 폴백(이사님 2026-06-19)

const VOCAB: string[] = (getIngredientsLight() as { ingredients: { nm: string }[] }).ingredients.map((i) => i.nm);
const VOCAB_SET = new Set(VOCAB);
const STATIC_ENOUGH = 3;   // 정적 이웃이 이 이상이면 폴백 불필요

function svc() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function llmNeighbors(food: string): Promise<{ nm: string; kind: 'pair' | 'bridge'; basis: string }[]> {
  if (!hasLLMBackend()) return [];
  const prompt = `한국 영유아 가정식 기준으로 식재료 "${food}"의 궁합 네트워크를 만들어라.\n` +
    `- pair(궁합/곁들임): "${food}"와(과) 같은 요리에 자연스럽게 같이 쓰는 식재료 3~5개.\n` +
    `- bridge(사촌): 맛·식감이 닮아 "${food}"를 잘 먹으면 받아들이기 쉬운 식재료 1~2개.\n` +
    `반드시 아래 도감 어휘에서만 고르고, "${food}" 자신은 제외. 억지로 안 어울리는 건 넣지 마라.\n` +
    `[도감 어휘] ${VOCAB.join(', ')}\n\n` +
    `JSON만(basis는 12자 이내로 짧게): {"neighbors":[{"nm":"…","kind":"pair","basis":"짧은 근거"}]}`;
  try {
    // ⭐ DeepSeek V4-Flash(폴백 Claude Haiku). json:false — truncate 복구 파싱을 그대로 유지.
    const text: string = await llmText({ user: prompt, maxTokens: 800, role: 'flash' });
    try {
      const m = text.match(/\{[\s\S]*\}/);
      const obj = m ? JSON.parse(m[0]) : {};
      if (Array.isArray(obj.neighbors) && obj.neighbors.length) return obj.neighbors;
    } catch { /* 잘린 JSON → 아래에서 객체 단위 복구 */ }
    // 응답이 truncate돼 전체 JSON.parse 실패 시: 완성된 {nm,kind,basis} 객체만 회수
    const objs = text.match(/\{[^{}]*"nm"[^{}]*\}/g) || [];
    return objs.map((o) => { try { return JSON.parse(o); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/** 식재료의 궁합 이웃 — 정적 우선, 없으면 캐시/LLM 폴백. PersonalBridge 폴백용. */
export async function affinityNeighbors(food: string): Promise<{ neighbors: Neighbor[]; source: 'graph' | 'cache' | 'llm' }> {
  const stat = neighborsOf(food);
  if (stat.length >= STATIC_ENOUGH) return { neighbors: stat, source: 'graph' };

  const db = svc();
  const { data: cached } = await db.from('affinity_cache').select('neighbors').eq('food', food).maybeSingle();
  if (cached?.neighbors && Array.isArray(cached.neighbors)) return { neighbors: cached.neighbors as Neighbor[], source: 'cache' };

  const raw = await llmNeighbors(food);
  const fb: Neighbor[] = raw
    .filter((n) => n && VOCAB_SET.has(n.nm) && n.nm !== food)
    .slice(0, 6)
    .map((n) => ({
      nm: n.nm,
      kind: n.kind === 'bridge' ? 'bridge' : 'pair',
      strength: 2,
      basis: n.basis || (n.kind === 'bridge' ? '맛·식감이 닮은 사촌' : '잘 어울리는 궁합(웹 폴백)'),
    }));
  // 정적 이웃 + 폴백 합치기(중복 제거, 정적 먼저)
  const merged = [...stat, ...fb.filter((n) => !stat.some((s) => s.nm === n.nm))];
  if (fb.length) {
    await db.from('affinity_cache').upsert({ food, neighbors: merged, source: 'llm' }).then(() => {}, () => {});
  }
  return { neighbors: merged, source: fb.length ? 'llm' : 'graph' };
}
