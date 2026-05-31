/**
 * lib/learnedMenus.ts — 전역 메뉴→식재료 '학습 사전' 읽기/쓰기.
 *
 * 정적 menu-dict.json·룰·스캔이 못 푼 메뉴를 LLM이 분해하면 그 결과를 learned_menus에 적재 →
 * 다음에 같은 메뉴가 들어오면 LLM 없이 무료 사전 히트. 전역(모든 부모 공유).
 * 부모별 교정(user_menu_overrides)이 더 우선 — care가 personalMap으로 먼저 처리한다.
 *
 * 키 정규화는 trim().replace(/\s/g,'') 단일 규칙(care override·mapMenuLocal과 동일).
 * ⚠️ 괄호·접두사 제거 같은 추가 정규화를 넣지 말 것 — override/dict 키와 어긋나 학습이 조용히 미스된다.
 *
 * RLS on·정책 없음 → 반드시 service_role(createSupabaseAdmin)로만 접근.
 */
import { createSupabaseAdmin } from '@/lib/supabase/server';

export function normalizeMenuKey(menu: string): string {
  return (menu || '').trim().replace(/\s/g, '');
}

export type LearnedHit = { ingredients: string[]; processed: boolean };

/** 여러 메뉴를 정규화키로 일괄 조회. 반환은 정규화키 기준 맵(식재료 없는 행은 제외). 실패는 {}.*/
export async function lookupLearned(menus: string[]): Promise<Record<string, LearnedHit>> {
  const keys = [...new Set((menus || []).map(normalizeMenuKey).filter(Boolean))];
  if (!keys.length) return {};
  try {
    const db = createSupabaseAdmin();
    const { data, error } = await db.from('learned_menus').select('menu,ingredients,processed').in('menu', keys);
    if (error || !data) return {};
    const out: Record<string, LearnedHit> = {};
    for (const r of data as { menu: string; ingredients: string[] | null; processed: boolean | null }[]) {
      if (r.ingredients && r.ingredients.length) out[r.menu] = { ingredients: r.ingredients, processed: !!r.processed };
    }
    return out;
  } catch { return {}; }
}

/** 학습 저장(멱등·hits 증가, learn_menu RPC). 빈 식재료는 저장 거부(환각 방지). 실패는 조용히 무시. */
export async function saveLearned(menu: string, ingredients: string[], processed: boolean, source: string): Promise<void> {
  const key = normalizeMenuKey(menu);
  const ings = [...new Set((ingredients || []).filter(Boolean))];
  if (!key || ings.length === 0) return;   // 빈 배열·빈 키는 저장하지 않음
  try {
    const db = createSupabaseAdmin();
    const { error } = await db.rpc('learn_menu', { p_menu: key, p_ings: ings, p_processed: !!processed, p_source: source });
    if (error) console.warn('[learned] save fail', key, error.message);
  } catch (e) { console.warn('[learned] save error', key, e instanceof Error ? e.message : String(e)); }
}
