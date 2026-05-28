import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EvalSnapshot {
  total_score: number | null;
  grade: string | null;
}

// 공유 결과 메타용 — 만료(3일)·없음·잘못된 id면 null
export async function getEvalSnapshot(id: string): Promise<EvalSnapshot | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase
    .from('eval_results')
    .select('total_score, grade, expires_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  return { total_score: data.total_score ?? null, grade: data.grade ?? null };
}
