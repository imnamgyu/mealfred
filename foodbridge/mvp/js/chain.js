// chain.js — Food Chaining 4축 클라이언트 헬퍼
// 2026-05-14 · Sprint M-A · Phase 9-MVP
//
// 책임:
//   - 시드 DB 로드 (data/food_seed.json)
//   - 시드 음식 4축 벡터 룩업
//   - 4축 라벨 한글 변환 (color → "주황" 등)
//   - 결과 검증 (자료 발화 4룰 자동 필터)
//   - 입력 정제 (trim, 빈 값 제거)

const SEED_URL = "/foodbridge/mvp/data/food_seed.json";

let _seedCache = null;

/** 시드 DB 로드 (캐시) */
export async function loadSeed() {
  if (_seedCache) return _seedCache;
  const res = await fetch(SEED_URL);
  if (!res.ok) throw new Error("시드 DB 로드 실패");
  _seedCache = await res.json();
  return _seedCache;
}

/** 한글 라벨 변환 — 축 코드 → 한글 */
const AXIS_LABEL_KO = {
  color:       "색",
  temperature: "온도",
  texture:     "질감",
  flavor:      "맛",
};

export function axisLabelKo(axis) {
  if (!axis) return null;
  if (axis.includes("+")) {
    return axis.split("+").map((a) => AXIS_LABEL_KO[a.trim()] || a).join("+");
  }
  return AXIS_LABEL_KO[axis] || axis;
}

/** 시드 DB에서 음식명으로 4축 벡터 조회 */
export function lookupVector(seed, nameKo) {
  if (!seed || !seed.foods) return null;
  const found = seed.foods.find((f) => f.name_ko === nameKo.trim());
  return found ? found.vector : null;
}

/** 4축 유클리드 거리 (참고용 — 실제 알고리즘은 LLM이 수행) */
export function vectorDistance(a, b) {
  if (!a || !b) return Infinity;
  const keys = ["color", "temperature", "texture", "flavor"];
  return Math.sqrt(keys.reduce((sum, k) => sum + Math.pow((a[k] ?? 0) - (b[k] ?? 0), 2), 0));
}

/** 입력 정제 */
export function sanitizeLikedFoods(raw) {
  return raw
    .map((s) => String(s || "").trim())
    .filter((s) => s.length > 0)
    .slice(0, 5);
}

/** 자료 발화 4룰 자동 검증 (클라이언트 사이드 안전망) */
const FORBIDDEN_PHRASES = [
  "잘 먹었",
  "잘 먹네",
  "잘했어",
  "대단해",
  "한 입 더",
  "더 먹",
  "건강에 좋",
  "안 먹으면",
  "안먹으면",
];

/**
 * tone_copy 1줄이 자료 발화 4룰을 위반하는지 검사
 * @returns {string[]} 위반 사유 배열 (비어있으면 통과)
 */
export function validateToneCopy(text) {
  if (!text) return ["empty"];
  const violations = [];
  for (const phrase of FORBIDDEN_PHRASES) {
    if (text.includes(phrase)) violations.push(`금지 표현: "${phrase}"`);
  }
  // 평가 동사 (대표적인 것만)
  if (/\b(잘했|훌륭|대단)\b/.test(text)) violations.push("평가 동사");
  return violations;
}

/** bridge_sequence 전체 검증 */
export function validateBridge(bridge) {
  if (!Array.isArray(bridge) || bridge.length < 3 || bridge.length > 5) {
    return { ok: false, reason: "단계 수 3~5 위반" };
  }
  for (const step of bridge) {
    if (!step.food || !step.tone_copy) return { ok: false, reason: "step 필드 누락" };
    const v = validateToneCopy(step.tone_copy);
    if (v.length > 0) return { ok: false, reason: `톤 카피 4룰 위반: ${v.join(", ")}`, step };
  }
  return { ok: true };
}
