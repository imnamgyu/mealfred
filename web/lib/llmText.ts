/**
 * lib/llmText.ts — 범용 텍스트 LLM 호출 (⭐DeepSeek 1차 · Claude 폴백)
 *
 * 이사님 2026-06-19 Claude→DeepSeek 전환. OCR(CLOVA+Sonnet 비전)을 제외한 모든 텍스트
 * LLM 호출(meal/parse·cron/enrich·remapMenus·affinity·기관 총평 등)의 단일 경로.
 *
 * 백엔드 우선순위(coach.ts callLLM과 동일 패턴):
 *   ① DeepInfra 직접(DEEPINFRA_API_KEY · 비중국 · 수수료0)
 *   ② OpenRouter(OPENROUTER_API_KEY · DeepInfra 프로바이더 핀)
 *   ③ Claude 폴백(ANTHROPIC_API_KEY) — DeepSeek 실패/미설정 시 발행 보장
 *
 * 역할키: 'pro'(=DeepSeek V4-Pro / 폴백 Claude Sonnet) · 'flash'(=V4-Flash / 폴백 Claude Haiku).
 * 셋 다 없으면 throw. DEEPSEEK_OFF=1로 DeepSeek 강제 비활성(Claude 폴백만, 안전밸브).
 */

export type LLMRole = 'flash' | 'pro';

const CLAUDE_FALLBACK: Record<LLMRole, string> = {
  flash: 'claude-haiku-4-5-20251001',
  pro: 'claude-sonnet-4-6',
};

/** 사용 가능한 LLM 백엔드가 하나라도 있는지(가드용 — 없으면 호출부가 스킵). */
export function hasLLMBackend(): boolean {
  return !!(process.env.DEEPINFRA_API_KEY || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export async function llmText(opts: {
  user: string;
  system?: string;
  maxTokens?: number;
  role?: LLMRole;
  json?: boolean;        // true면 DeepSeek에 response_format: json_object 요청(파싱은 호출부/ parseLLMJson)
  temperature?: number;
}): Promise<string> {
  const { user, system, maxTokens = 800, role = 'flash', json = false, temperature = 0.7 } = opts;

  // ① / ② DeepSeek 1차 (DeepInfra 직접 우선, 없으면 OpenRouter+DeepInfra핀)
  const dsKey = process.env.DEEPINFRA_API_KEY || process.env.OPENROUTER_API_KEY;
  if (dsKey && process.env.DEEPSEEK_OFF !== '1') {
    try {
      const direct = !!process.env.DEEPINFRA_API_KEY;
      const isPro = role === 'pro';
      const dsModel = direct
        ? (isPro ? 'deepseek-ai/DeepSeek-V4-Pro' : 'deepseek-ai/DeepSeek-V4-Flash')
        : (isPro ? 'deepseek/deepseek-v4-pro' : 'deepseek/deepseek-v4-flash');
      const body: Record<string, unknown> = {
        model: dsModel,
        max_tokens: maxTokens,
        temperature,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user },
        ],
      };
      if (json) body.response_format = { type: 'json_object' };
      if (!direct) body.provider = { only: [process.env.COACH_LLM_PROVIDER || 'DeepInfra'], allow_fallbacks: false };
      const r = await fetch(
        direct ? 'https://api.deepinfra.com/v1/openai/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions',
        { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${dsKey}` }, body: JSON.stringify(body) },
      );
      if (r.ok) {
        const d = await r.json();
        const t = (d?.choices?.[0]?.message?.content as string) || '';
        if (t) return t;
      }
    } catch { /* DeepSeek 실패 → Claude 폴백 */ }
  }

  // ③ Claude 폴백
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('llmText: no backend (DEEPINFRA/OPENROUTER/ANTHROPIC all missing)');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: CLAUDE_FALLBACK[role],
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json();
  const block = (data?.content as { type: string; text?: string }[] | undefined)?.find((b) => b.type === 'text');
  return block?.text || '';
}

/** 코드펜스/잡텍스트 섞인 LLM 출력에서 JSON만 회수(제어문자 보정 포함). 실패 시 null. */
export function parseLLMJson<T = Record<string, unknown>>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : (text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] || '');
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { /* 제어문자 보정 재시도 */ }
  try { return JSON.parse([...raw].map((c) => (c.charCodeAt(0) < 32 ? ' ' : c)).join('')) as T; } catch { /* */ }
  return null;
}
