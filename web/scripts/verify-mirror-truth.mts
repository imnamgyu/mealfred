/**
 * scripts/verify-mirror-truth.mts — 랄프위검 검수용 ground-truth 추출(읽기 전용·DB 미반영)
 * 각 편지 날짜에 대해 그날 'buildMealMirror가 본' 실제 데이터를 엔진 그대로 계산해 출력:
 *   - 어제(그 날짜 기준 age=1) 끼니별 실제 메뉴
 *   - 최근 7일 식품군 영양신호등(green/yellow/red) — 편지 영양 주장의 진실값 대조용
 * npx tsx --env-file=.env.local scripts/verify-mirror-truth.mts
 */
import { createClient } from '@supabase/supabase-js';
import { computeGroupSignals } from '../lib/nutrition';

const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const TODAY = '2026-06-13';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data: rows } = await sb.from('meal_logs')
  .select('log_date,slot,menus,ingredients,environment,refused,note,place,ate_well')
  .eq('child_id', CID).lte('log_date', TODAY).order('log_date');

const all = (rows || []) as Array<{ log_date: string; slot: string | null; menus: string[] | null; ingredients: string[] | null; environment: string | null; refused: string | null; note: string | null; place: string | null; ate_well: boolean | null }>;
const SLOT_KO: Record<string, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', am_snack: '오전간식', pm_snack: '오후간식', snack: '간식' };

const out: Record<string, unknown> = {};
const dates = [...new Set(all.map((r) => r.log_date))].sort();
const firstLetter = '2026-05-27';
for (const date of dates) {
  if (date < firstLetter) continue;
  const dMs = Date.parse(date);
  const age = (d: string) => Math.round((dMs - Date.parse(d)) / 86400000);
  // 어제 끼니
  const y = all.filter((r) => age(r.log_date) === 1);
  const yMeals = y.map((r) => `${SLOT_KO[r.slot || ''] || r.slot}: ${(r.menus || []).join('·')}${r.environment ? ` [환경:${r.environment}]` : ''}`);
  // 최근 7일 식품군 신호등
  const byDay: Record<string, string[]> = {};
  all.filter((r) => { const a = age(r.log_date); return a >= 1 && a <= 7; })
    .forEach((r) => { (byDay[r.log_date] ||= []).push(...(r.ingredients || [])); });
  const days = Object.values(byDay).filter((d) => d.length);
  const { signals } = days.length ? computeGroupSignals(days) : { signals: [] };
  const sig = signals.map((s) => `${s.group}=${s.level}(${s.weeklyEst})`);
  // 7일 거부
  const refusals = [...new Set(all.filter((r) => age(r.log_date) >= 1 && age(r.log_date) <= 7).flatMap((r) => String(r.refused || '').split(/[,，·]/).map((t) => t.trim()).filter(Boolean)))];
  out[date] = { yesterdayMeals: yMeals, groupSignals: sig, refused7d: refusals, loggedDays7d: days.length };
}
console.log(JSON.stringify(out, null, 1));
