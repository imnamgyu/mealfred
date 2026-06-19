/**
 * 아린(43942d34) 월간 LLM 유지비용 재계산 — llm_usage 집계 → 일평균·월환산(×30)·원화.
 * 실행: node --env-file=.env.local scripts/arin-cost.mjs
 */
import { createClient } from '@supabase/supabase-js';
const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const KRW = Number(process.env.USD_KRW || 1380);   // 환율(대략)
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await sb.from('llm_usage').select('usage_date,cost_usd,calls').eq('child_id', CID).order('usage_date', { ascending: true });
const rows = data || [];
const days = rows.length;
const totUsd = rows.reduce((a, b) => a + (b.cost_usd || 0), 0);
const totCalls = rows.reduce((a, b) => a + (b.calls || 0), 0);
const perDayUsd = days ? totUsd / days : 0;
const monthUsd = perDayUsd * 30;
console.log(`측정 ${days}일 · ${rows[0]?.usage_date ?? '-'} ~ ${rows[days - 1]?.usage_date ?? '-'}`);
console.log(`총 비용 $${totUsd.toFixed(4)} · 콜 ${totCalls} (일평균 ${(totCalls / (days || 1)).toFixed(1)}콜)`);
console.log(`일평균 $${perDayUsd.toFixed(5)} = ₩${Math.round(perDayUsd * KRW)}`);
console.log(`⭐ 월 환산(×30): $${monthUsd.toFixed(4)} = ₩${Math.round(monthUsd * KRW)}/자녀`);
