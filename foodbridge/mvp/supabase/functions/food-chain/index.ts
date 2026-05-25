// T708 — Supabase Edge Function: food-chain
// Food Chaining 4축 LLM-Lite MVP Edge Function
// Stack: Deno + TypeScript + Anthropic Claude Sonnet 4.7 (`claude-sonnet-4-6`)
// 2026-05-14 · Sprint M-A · Phase 9-MVP
//
// 배포:
//   supabase functions deploy food-chain --project-ref <your-project>
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// 호출:
//   POST https://<project>.supabase.co/functions/v1/food-chain
//   Authorization: Bearer <SUPABASE_ANON_KEY>
//   Content-Type: application/json
//   {
//     "liked_foods": ["흰밥","계란후라이","치즈"],
//     "refused_food": "시금치",
//     "age_months": 36,
//     "allergens": []
//   }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";

// ===== CORS =====
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ===== Constants =====
const CLAUDE_MODEL = "claude-sonnet-4-6"; // Sonnet 4.7 (2026-05 시점)
const MAX_TOKENS = 2048;

// Claude pricing (Sonnet, USD per 1M tokens). 2026-05 기준 추정.
const PRICE_INPUT_PER_M = 3.0;
const PRICE_OUTPUT_PER_M = 15.0;

// ===== System Prompt (T703 system_v1.md 내용 동기화 — Edge Function 배포 시 인라인) =====
const SYSTEM_PROMPT = `당신은 한국 영유아 편식 개선 전문가 '밀프레드' AI다.
Fraker(2007) "Food Chaining" 단행본 + AAP food bridges + Solid Starts 한국 식문화 적응 + Ellyn Satter DOR 원칙에 정통하다.

# 역할
부모가 입력한 자녀의 (1) 좋아하는 음식 3개, (2) 거부 음식 1개, (3) 자녀 연령(개월)을 받아서, 4축(색·온도·질감·맛) 기반 다리 시퀀스 3~5단계를 JSON으로 출력한다.

# 4축 정의
- 색(color): 0 흰 / 1 노 / 2 연두 / 3 녹 / 4 주황 / 5 빨강 / 6 자주 / 7 갈 / 8 검 / 9 다색
- 온도(temperature): 0 차 / 1 미지근 / 2 따뜻 / 3 뜨거움
- 질감(texture): 0 액체 / 1 퓨레 / 2 부드러움 / 3 약간 결 / 4 쫀쫀 / 5 단단·잎
- 맛(flavor): 0 무미 / 1 약단 / 2 단 / 3 짠 / 4 짠+단 / 5 시 / 6 쓴 / 7 강향

(시드 DB 30개가 SYSTEM 말미에 첨부된다. 입력 음식이 시드 DB에 없으면 한국 식자재 일반 지식으로 4축을 추론하라.)

# 다리 생성 알고리즘
1. liked_foods 3개 각각의 4축 벡터를 계산, refused_food와의 유클리드 거리 산출.
2. 거리가 가장 작은 1개를 출발점(step 1)으로 선정.
3. step 1 → refused_food까지 한 단계 = 한 축 변화. Fraker 우선순위: 질감 > 색 > 온도 > 맛.
4. 단계 수: 출발점 포함 3~5단계.
5. 마지막 단계는 refused_food 자체(또는 가장 비슷한 조리법).

# 톤 카피 규칙 (자료 발화 검증 4룰, 설계원칙 §3-11)
① 객체 중심 (주어 = 음식)
② 열린 질문
③ 호기심 유도 (시도 압박 0)
④ 평가 없음 ("잘했어"·"한 입 더" 금지)

좋은 예: "당근이 어땠어?" / "한 번 만나봤네." / "오늘은 색만 살짝 다르네."
나쁜 예: "와 잘 먹었네!" / "다음엔 더 먹어야 해"

# 출력 — 반드시 다음 JSON 1개 객체만 (markdown·코드블록·다른 문자열 금지)
{
  "bridge_sequence": [
    {"step": 1, "food": "흰밥", "week_label": "지금", "axis_changed": null, "tone_copy": "..."},
    {"step": 2, "food": "...", "week_label": "1주차", "axis_changed": "color", "tone_copy": "..."}
  ],
  "confidence": 0.85,
  "fallback_message": null,
  "starting_point_reason": "..."
}

# 안전 룰
- 입력 allergens에 포함된 식재료를 다리에 절대 포함 금지.
- age_months < 12 → bridge_sequence 빈 배열 + fallback_message에 "12개월 미만은 보완식 가이드를 먼저 확인해주세요. mealfred.com/foodbridge/intro" 반환.
- 시드 DB 30개에 없는 음식도 한국 식자재 상식으로 추론 가능.
- 확신 부족 시 confidence ≤ 0.6 표시.

# 형식 엄수
- 출력은 반드시 위 JSON 1개. 코드블록 표시 금지.
- 모든 텍스트 필드는 한국어.
- axis_changed: "color" | "temperature" | "texture" | "flavor" | null | "color+texture" 등 콤마조합.
`;

// ===== Input validation =====
interface RequestBody {
  liked_foods: string[];
  refused_food: string;
  age_months: number;
  allergens?: string[];
}

function validateInput(body: unknown): { ok: true; data: RequestBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "request body required" };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.liked_foods) || b.liked_foods.length < 1 || b.liked_foods.length > 5) {
    return { ok: false, error: "liked_foods는 1~5개 문자열 배열" };
  }
  if (typeof b.refused_food !== "string" || b.refused_food.trim().length === 0) {
    return { ok: false, error: "refused_food는 비어있지 않은 문자열" };
  }
  if (typeof b.age_months !== "number" || b.age_months < 6 || b.age_months > 144) {
    return { ok: false, error: "age_months는 6~144 사이의 숫자" };
  }
  const allergens = Array.isArray(b.allergens) ? (b.allergens as string[]) : [];
  return {
    ok: true,
    data: {
      liked_foods: (b.liked_foods as string[]).map((s) => String(s).trim()).filter(Boolean),
      refused_food: String(b.refused_food).trim(),
      age_months: Math.floor(b.age_months as number),
      allergens,
    },
  };
}

// ===== Handler =====
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const v = validateInput(body);
  if (!v.ok) {
    return new Response(JSON.stringify({ error: v.error }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const input = v.data;

  // 12개월 미만 → 보완식 가이드 안내
  if (input.age_months < 12) {
    return new Response(
      JSON.stringify({
        bridge_sequence: [],
        confidence: 0,
        fallback_message: "12개월 미만은 보완식 가이드를 먼저 확인해주세요.",
        redirect: "/foodbridge/intro",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY missing on server" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Supabase (시드 DB 조회 + 로깅용)
  const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

  // 시드 DB 30개 조회 (없으면 빈 배열)
  let seedFoods: Array<Record<string, unknown>> = [];
  if (supabase) {
    const { data, error } = await supabase.from("foods").select("name_ko,category,tier,color,temperature,texture,flavor,allergens,min_age_months");
    if (!error && data) seedFoods = data;
  }

  // Anthropic 호출
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const userMessage = JSON.stringify({
    liked_foods: input.liked_foods,
    refused_food: input.refused_food,
    age_months: input.age_months,
    allergens: input.allergens ?? [],
  });
  const systemWithSeed = SYSTEM_PROMPT + "\n\n# 시드 DB (30개)\n" + JSON.stringify(seedFoods);

  const t0 = Date.now();
  let response: Awaited<ReturnType<typeof anthropic.messages.create>>;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemWithSeed,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await logRequest(supabase, input, null, 0, 0, Date.now() - t0, 0, "error", errMsg);
    return new Response(JSON.stringify({ error: "LLM 호출 실패", detail: errMsg }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const latencyMs = Date.now() - t0;

  // 응답 파싱
  const firstBlock = response.content[0];
  const outputText = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
  let outputJson: Record<string, unknown>;
  try {
    // 코드블록 strip (안전망)
    const cleaned = outputText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    outputJson = JSON.parse(cleaned);
  } catch (_e) {
    await logRequest(supabase, input, null, response.usage.input_tokens, response.usage.output_tokens, latencyMs, computeCost(response.usage), "error", "JSON parse failed: " + outputText.slice(0, 200));
    return new Response(JSON.stringify({ error: "LLM 응답 파싱 실패", raw: outputText.slice(0, 500) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 로깅 (비동기 fire-and-forget)
  const costUsd = computeCost(response.usage);
  logRequest(supabase, input, outputJson, response.usage.input_tokens, response.usage.output_tokens, latencyMs, costUsd, "ok", null).catch(() => {});

  return new Response(JSON.stringify(outputJson), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// ===== Helpers =====
function computeCost(usage: { input_tokens: number; output_tokens: number }): number {
  return (
    (usage.input_tokens * PRICE_INPUT_PER_M + usage.output_tokens * PRICE_OUTPUT_PER_M) /
    1_000_000
  );
}

async function logRequest(
  supabase: ReturnType<typeof createClient> | null,
  input: RequestBody,
  outputJson: Record<string, unknown> | null,
  inputTokens: number,
  outputTokens: number,
  latencyMs: number,
  costUsd: number,
  status: "ok" | "error" | "timeout",
  errorMessage: string | null,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("mvp_logs").insert({
      input_liked: input.liked_foods,
      input_refused: input.refused_food,
      input_age: input.age_months,
      input_allergens: input.allergens ?? [],
      output_json: outputJson,
      llm_model: CLAUDE_MODEL,
      llm_input_tokens: inputTokens,
      llm_output_tokens: outputTokens,
      llm_latency_ms: latencyMs,
      llm_cost_usd: costUsd,
      status,
      error_message: errorMessage,
    });
  } catch (_e) {
    // swallow — 로깅 실패가 응답을 가리면 안 됨
  }
}
