/**
 * lib/remapMenus.ts — 야간 미매핑 메뉴 보강(백필) + 사전학습.
 *
 * meal_logs 중 menus는 있으나 ingredients가 빈(NULL 또는 빈 배열) 행을 찾아,
 * 각 메뉴를 learned → mapMenuLocal → LLM 순으로 해소해 ingredients를 백필하고,
 * 새로 푼 결과(local·LLM)는 learned_menus에 학습시켜 다음부터 무료가 되게 한다.
 *
 * 안전장치:
 *  - '빈 행만' 대상 → 부모 수기 편집 손실 위험 없음(채워진 행은 손대지 않음).
 *  - 행 UPDATE는 기존 ∪ 신규(덮어쓰기 금지).
 *  - 같은 메뉴는 1회만 해소(중복 LLM 차단), maxLlmCalls·timeBudgetMs 예산 가드.
 *  - learned 저장/조회는 service_role(createSupabaseAdmin).
 */
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { mapMenuLocal, canon, CANON_VOCAB } from '@/lib/menuMap';
import { lookupLearned, saveLearned, normalizeMenuKey } from '@/lib/learnedMenus';

export type BackfillResult = {
  scanRows: number; menusFound: number; learnedHits: number; localHits: number;
  llmCalls: number; rowsUpdated: number; skippedLLM: number; dryRun: boolean; durationMs: number;
};

type Resolved = { ings: string[]; processed: boolean };

// meal/parse와 동일한 LLM 분해(표준 어휘로 환각 제거). 실패·빈 결과는 null.
async function llmDecompose(menu: string, key: string): Promise<Resolved | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `한국 가정식 메뉴 "${menu}"에 실제로 들어가는 핵심 식재료만 분해하세요.
- 양념(소금·간장·설탕)·물·육수·기름 제외
- 그 메뉴에 확실히 들어가는 재료만. 확실치 않으면 적게. 임의로 채소·과일 추가 절대 금지.
- 단순 곡물 메뉴(밥·죽·면)는 곡물만(쌀·국수 등). 채소 끼워넣지 말 것.
- 가공식품(소시지·햄·어묵·라면 등) 포함 시 processed: true
- 식재료명은 표준 단일명으로(예: 닭안심→닭고기, 단호박→호박, 백미→쌀)
- JSON만: {"ingredients": ["재료1"], "processed": false}`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data?.content?.[0]?.text as string) || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const raw: string[] = parsed.ingredients || [];
    const ings = [...new Set(raw.map(canon).filter((nm): nm is string => !!nm && CANON_VOCAB.has(nm)))];
    return { ings, processed: !!parsed.processed };
  } catch { return null; }
}

export async function backfillUnmappedMenus(opts: {
  windowDays?: number; maxLlmCalls?: number; timeBudgetMs?: number; dryRun?: boolean;
  sinceFn?: (n: number) => string;   // KST 기준 since 주입(coach의 kstDateNDaysAgo). 없으면 UTC 근사.
} = {}): Promise<BackfillResult> {
  const start = Date.now();
  const windowDays = opts.windowDays ?? 60;
  const maxLlm = opts.maxLlmCalls ?? 8;
  const timeBudget = opts.timeBudgetMs ?? 6000;
  const dryRun = !!opts.dryRun;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const since = opts.sinceFn
    ? opts.sinceFn(windowDays)
    : new Date(Date.now() + 9 * 3600e3 - windowDays * 86400e3).toISOString().slice(0, 10);

  const db = createSupabaseAdmin();
  const empty: BackfillResult = { scanRows: 0, menusFound: 0, learnedHits: 0, localHits: 0, llmCalls: 0, rowsUpdated: 0, skippedLLM: 0, dryRun, durationMs: 0 };

  // menus 있는 최근 행 → JS에서 'ingredients 빈(NULL or {})' 필터(둘 다 잡기)
  const { data: rows, error } = await db.from('meal_logs')
    .select('id,menus,ingredients,log_date')
    .gte('log_date', since)
    .not('menus', 'is', null);
  if (error) { empty.durationMs = Date.now() - start; return empty; }
  const candidates = (rows || []).filter((r: { menus: string[] | null; ingredients: string[] | null }) =>
    (r.menus?.length ?? 0) > 0 && (r.ingredients?.length ?? 0) === 0);
  if (!candidates.length) { empty.durationMs = Date.now() - start; return empty; }

  // 후보 행들의 메뉴 정규화키 → 대표 원문
  const keyToMenu: Record<string, string> = {};
  for (const r of candidates) for (const mn of r.menus || []) { const k = normalizeMenuKey(mn); if (k && !keyToMenu[k]) keyToMenu[k] = mn; }
  const allKeys = Object.keys(keyToMenu);

  // 1) learned 일괄 조회 → local → LLM(예산 내)
  const learned = await lookupLearned(allKeys);
  const resolved: Record<string, Resolved> = {};
  let learnedHits = 0, localHits = 0, llmCalls = 0, skippedLLM = 0;
  for (const k of allKeys) {
    if (learned[k]) { resolved[k] = { ings: learned[k].ingredients, processed: learned[k].processed }; learnedHits++; continue; }
    const local = mapMenuLocal(keyToMenu[k]);
    if (local && local.ingredients.length) {
      resolved[k] = { ings: local.ingredients, processed: local.processed };
      localHits++;
      if (!dryRun) await saveLearned(keyToMenu[k], local.ingredients, local.processed, local.source);
      continue;
    }
    // LLM — dry/예산/시간 가드. dry는 LLM 호출 안 함(비용 0 시뮬).
    if (dryRun || !anthropicKey || llmCalls >= maxLlm || Date.now() - start > timeBudget) { skippedLLM++; continue; }
    const gen = await llmDecompose(keyToMenu[k], k);
    llmCalls++;
    if (gen && gen.ings.length) { resolved[k] = gen; await saveLearned(keyToMenu[k], gen.ings, gen.processed, 'llm'); }
  }

  // 2) 행별 백필 — 해소된 식재료 ∪ 기존(빈이라 사실상 신규). 덮어쓰기 아님.
  let rowsUpdated = 0;
  for (const r of candidates) {
    const set = new Set(r.ingredients || []);
    for (const mn of r.menus || []) { const rv = resolved[normalizeMenuKey(mn)]; if (rv) rv.ings.forEach((i) => set.add(i)); }
    if (set.size > (r.ingredients?.length ?? 0)) {
      if (dryRun) { rowsUpdated++; continue; }
      const { error: uErr } = await db.from('meal_logs').update({ ingredients: [...set] }).eq('id', r.id);
      if (!uErr) rowsUpdated++;
    }
  }

  return { scanRows: candidates.length, menusFound: allKeys.length, learnedHits, localHits, llmCalls, rowsUpdated, skippedLLM, dryRun, durationMs: Date.now() - start };
}
