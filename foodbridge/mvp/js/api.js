// api.js — Supabase Edge Function client + Mock 모드 toggle
// 2026-05-14 · Sprint M-A · Phase 9-MVP
//
// 두 가지 모드:
//   1) MOCK 모드 (기본, API key 발급 전 UX 검증용)
//      → data/mock_responses.json 의 8 시나리오 중 입력에 가장 가까운 것 반환
//      → 0건 외부 호출, 즉시 동작 (localhost 또는 file://)
//
//   2) REAL 모드 (Anthropic API key 발급 후)
//      → Supabase Edge Function 호출 → Claude Sonnet 4.7
//      → 활성화: localStorage.setItem('FOODBRIDGE_API_LIVE', 'true')
//                또는 URL ?live=1
//
// 강제 mock: URL ?mock=1
// 모드 확인: window.FOODBRIDGE_MODE
//
// 운영 전 임남규 대표가 채워야 할 값 (Vercel env 또는 인라인):
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY  (publishable — 노출 허용)

/* eslint-disable */

// TODO(deploy): mealfred Supabase 프로젝트 URL · ANON KEY 채워 넣기.
// 임시 placeholder. Vercel 배포 시 환경변수 주입 또는 build-time replace 권장.
export const CONFIG = {
  SUPABASE_URL: window.__FOODBRIDGE_CONFIG__?.SUPABASE_URL || "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: window.__FOODBRIDGE_CONFIG__?.SUPABASE_ANON_KEY || "YOUR-ANON-KEY",
  TIMEOUT_MS: 20000,
  MOCK_URL: "/foodbridge/mvp/data/mock_responses.json",
  MOCK_DELAY_MS: 1800,
};

// ===== 모드 결정 =====
function resolveMode() {
  const qs = new URLSearchParams(location.search);
  if (qs.get("mock") === "1") return "mock";
  if (qs.get("live") === "1") return "real";

  try {
    if (window.localStorage.getItem("FOODBRIDGE_API_LIVE") === "true") {
      return "real";
    }
  } catch (_e) { /* localStorage 차단 환경 */ }

  // placeholder가 그대로면 무조건 mock (real 호출은 502만 반환)
  if (CONFIG.SUPABASE_URL.includes("YOUR-PROJECT") || CONFIG.SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY")) {
    return "mock";
  }
  // CONFIG 채워졌으나 사용자 토글이 없으면 보수적으로 mock
  return "mock";
}

export const MODE = resolveMode();
window.FOODBRIDGE_MODE = MODE;

// 콘솔 토글 헬퍼 (임남규 대표용)
window.foodbridge = window.foodbridge || {};
window.foodbridge.enableLive = function () {
  try {
    window.localStorage.setItem("FOODBRIDGE_API_LIVE", "true");
    console.info("[foodbridge] LIVE 모드 활성화 — 다음 새로고침부터 실 LLM 호출");
  } catch (e) {
    console.error("[foodbridge] localStorage 사용 불가:", e);
  }
};
window.foodbridge.disableLive = function () {
  try {
    window.localStorage.removeItem("FOODBRIDGE_API_LIVE");
    console.info("[foodbridge] MOCK 모드 복귀 — 다음 새로고침부터 정적 답변");
  } catch (e) {
    console.error("[foodbridge] localStorage 사용 불가:", e);
  }
};
window.foodbridge.mode = () => window.FOODBRIDGE_MODE;

console.info(`[foodbridge] 모드 = ${MODE}${MODE === "mock" ? " (정적 답변 — UX 검증용)" : " (실 LLM 호출)"}`);
console.info("[foodbridge] 모드 변경: foodbridge.enableLive() / foodbridge.disableLive() 후 새로고침");

/**
 * Food Bridge 생성 호출 — 모드 자동 분기
 * @param {Object} payload
 * @param {string[]} payload.liked_foods
 * @param {string}   payload.refused_food
 * @param {number}   payload.age_months
 * @param {string[]} [payload.allergens]
 * @returns {Promise<Object>} bridge_sequence JSON
 */
export async function generateFoodChain(payload) {
  if (MODE === "mock") {
    return generateMock(payload);
  }
  return generateReal(payload);
}

// ===== MOCK 모드 =====

let _mockCache = null;

async function loadMockScenarios() {
  if (_mockCache) return _mockCache;
  const res = await fetch(CONFIG.MOCK_URL);
  if (!res.ok) throw new Error("mock_responses.json 로드 실패");
  _mockCache = await res.json();
  return _mockCache;
}

/**
 * 입력에 가장 가까운 시나리오 1개 선택
 * 매칭 우선순위:
 *   1) age_months < 12 → fallback 시나리오 강제
 *   2) liked_foods·refused_food 동일 단어 매칭 점수 최대
 *   3) 동점이면 첫 번째
 *   4) 매칭 0건이면 가장 흔한 입력(S2)
 */
function matchScenario(scenarios, payload) {
  const age = Number(payload.age_months) || 0;
  if (age > 0 && age < 12) {
    return scenarios.find((s) => s.id === "S5_under_12_months_fallback") || scenarios[0];
  }

  const liked = (payload.liked_foods || []).map((s) => String(s || "").trim()).filter(Boolean);
  const refused = String(payload.refused_food || "").trim();

  let best = null;
  let bestScore = -1;

  for (const s of scenarios) {
    if (s.id === "S5_under_12_months_fallback") continue; // 강제 매칭만

    const sLiked = s.input.liked_foods || [];
    const sRefused = s.input.refused_food || "";

    let score = 0;
    // refused_food 정확 일치 = +3
    if (refused && sRefused && refused === sRefused) score += 3;
    // refused_food 부분 일치 (한국어 음식명은 짧으므로 substring) = +1
    else if (refused && sRefused && (refused.includes(sRefused) || sRefused.includes(refused))) score += 1;

    // liked_foods 교집합 = 각 +1
    for (const lf of liked) {
      if (sLiked.some((x) => x === lf || x.includes(lf) || lf.includes(x))) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  // 매칭 0건 → 가장 흔한 입력 S2
  if (!best || bestScore <= 0) {
    return scenarios.find((s) => s.id === "S2_carbs_only_refuse_vegetable") || scenarios[0];
  }
  return best;
}

/**
 * MOCK 응답 생성 — 실 LLM 호출 시간감을 위해 1.8s 지연
 */
async function generateMock(payload) {
  const data = await loadMockScenarios();
  const scenario = matchScenario(data.scenarios || [], payload);

  // 알러지 회피 안전망 — 입력 알러지에 해당하는 food가 bridge에 들어있으면 confidence 감점
  const userAllergens = new Set(payload.allergens || []);
  const allergenMap = { milk: ["우유", "치즈", "요거트"], egg: ["계란"], wheat: ["빵", "밀가루"], soy: ["두부", "콩"], fish: ["생선"], sesame: ["참기름", "참깨"], nuts: ["견과"] };
  const blocked = [];
  for (const a of userAllergens) {
    (allergenMap[a] || []).forEach((kw) => blocked.push(kw));
  }

  // 지연 시뮬레이션 (로딩 화면 검증용)
  await new Promise((r) => setTimeout(r, CONFIG.MOCK_DELAY_MS));

  // scenario.output을 깊은 복사하여 반환 (캐시 오염 방지)
  const output = JSON.parse(JSON.stringify(scenario.output));
  output._mock = {
    scenario_id: scenario.id,
    scenario_label: scenario.label,
    matched_at: new Date().toISOString(),
  };

  // 알러지 차단 단어가 bridge에 있으면 confidence -0.1 + console warn
  if (Array.isArray(output.bridge_sequence) && blocked.length > 0) {
    const hit = output.bridge_sequence.find((step) => blocked.some((kw) => (step.food || "").includes(kw)));
    if (hit) {
      console.warn("[foodbridge] mock 경고 — 입력 알러지에 차단된 식재료가 다리에 포함:", hit.food);
      output.confidence = Math.max(0.4, (output.confidence || 0.8) - 0.1);
    }
  }

  return output;
}

// ===== REAL 모드 (기존 Edge Function 호출) =====

async function generateReal(payload) {
  const url = `${CONFIG.SUPABASE_URL}/functions/v1/food-chain`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json().catch(() => ({ error: "응답 파싱 실패" }));

    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.detail = data;
      throw err;
    }

    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      const e = new Error("응답 시간이 초과되었습니다 (20초)");
      e.code = "TIMEOUT";
      throw e;
    }
    throw err;
  }
}

/**
 * 헬스 체크 (선택 — 추후 사용)
 */
export async function ping() {
  if (MODE === "mock") return true;
  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/`, {
      headers: { "apikey": CONFIG.SUPABASE_ANON_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}
