// app.js — UI 컨트롤러
// 2026-05-14 · Sprint M-A · Phase 9-MVP
//
// 책임:
//   - 화면 전환 (input → loading → result | error)
//   - 입력 수집/검증
//   - 로딩 단계 페이드인
//   - 결과 렌더링
//   - 에러 처리 (T713)

import { generateFoodChain, MODE } from "./api.js";
import { axisLabelKo, sanitizeLikedFoods, validateBridge } from "./chain.js";

// ===== DOM refs =====
const $ = (id) => document.getElementById(id);

const screens = {
  input:   $("screen-input"),
  loading: $("screen-loading"),
  result:  $("screen-result"),
  error:   $("screen-error"),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
  const backBtn = $("back-btn");
  backBtn.hidden = name === "input";
  window.scrollTo(0, 0);
}

// ===== 입력 화면 (T710) =====
const ageRange = $("age-range");
const ageDisplay = $("age-display");
ageRange.addEventListener("input", () => {
  ageDisplay.textContent = `${ageRange.value}개월`;
});

const allergenChips = $("allergen-chips");
allergenChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  chip.classList.toggle("selected");
});

function collectAllergens() {
  return Array.from(allergenChips.querySelectorAll(".chip.selected"))
    .map((el) => el.dataset.value);
}

function showInputError(msg) {
  const banner = $("input-error");
  banner.textContent = msg;
  banner.classList.add("visible");
  banner.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearInputError() {
  $("input-error").classList.remove("visible");
}

function collectInput() {
  const liked = sanitizeLikedFoods([
    $("liked-1").value,
    $("liked-2").value,
    $("liked-3").value,
  ]);
  const refused = $("refused").value.trim();
  const age = parseInt(ageRange.value, 10);
  const allergens = collectAllergens();

  if (liked.length < 1) return { ok: false, error: "좋아하는 음식을 1개 이상 입력해주세요." };
  if (!refused) return { ok: false, error: "거부하는 음식을 입력해주세요." };
  if (!age || age < 12 || age > 84) return { ok: false, error: "연령은 12~84개월 사이여야 합니다." };

  return {
    ok: true,
    data: { liked_foods: liked, refused_food: refused, age_months: age, allergens },
  };
}

// ===== 로딩 화면 (T712) =====
let _loadingTimer = null;

function startLoadingAnimation() {
  const items = Array.from($("loading-steps").querySelectorAll("li"));
  items.forEach((li) => { li.classList.remove("visible", "done"); });

  // 0.6초 간격 페이드인
  items.forEach((li, i) => {
    setTimeout(() => li.classList.add("visible"), i * 600);
  });

  // 각 단계는 표시된 뒤 1초쯤 후 done (시각적 진행감)
  items.forEach((li, i) => {
    setTimeout(() => li.classList.add("done"), i * 600 + 1500);
  });

  _loadingTimer = setTimeout(() => { /* noop */ }, 1);
}

function stopLoadingAnimation() {
  if (_loadingTimer) clearTimeout(_loadingTimer);
  _loadingTimer = null;
}

// ===== 결과 화면 (T711) =====
function renderResult(payload) {
  const list = $("bridge-list");
  list.innerHTML = "";

  const seq = Array.isArray(payload.bridge_sequence) ? payload.bridge_sequence : [];

  // 12개월 미만 등 fallback_message가 있고 단계가 비어있으면 안내만
  if (seq.length === 0 && payload.fallback_message) {
    const card = document.createElement("div");
    card.className = "bridge-card";
    card.innerHTML = `
      <div class="bridge-food">${escapeHtml(payload.fallback_message)}</div>
      ${payload.redirect ? `<a href="${escapeAttr(payload.redirect)}" class="bridge-tone">${escapeHtml(payload.redirect)}</a>` : ""}
    `;
    list.appendChild(card);
    $("result-reason").hidden = true;
    showScreen("result");
    return;
  }

  // starting_point_reason
  const reasonEl = $("result-reason");
  if (payload.starting_point_reason) {
    reasonEl.textContent = "🧭 " + payload.starting_point_reason;
    reasonEl.hidden = false;
  } else {
    reasonEl.hidden = true;
  }

  // 카드 렌더
  seq.forEach((step, idx) => {
    const isStart = idx === 0;
    const isGoal = idx === seq.length - 1;
    const card = document.createElement("article");
    card.className = "bridge-card" + (isStart ? " is-start" : "") + (isGoal ? " is-goal" : "");
    card.setAttribute("role", "listitem");

    const week = step.week_label || (isStart ? "지금" : `${idx}주차`);
    const axisKo = axisLabelKo(step.axis_changed);

    card.innerHTML = `
      <div class="bridge-week">${escapeHtml(week)}${isGoal ? " · 목표" : ""}</div>
      <div class="bridge-food">${escapeHtml(step.food || "")}</div>
      ${axisKo ? `<span class="bridge-axis">${escapeHtml(axisKo)} 변화</span>` : ""}
      <div class="bridge-tone">"${escapeHtml(step.tone_copy || "")}"</div>
    `;
    list.appendChild(card);
  });

  // confidence 표기 (낮을 때만)
  if (typeof payload.confidence === "number" && payload.confidence < 0.7) {
    const warn = document.createElement("div");
    warn.className = "starting-reason";
    warn.style.borderLeft = "3px solid #C45A00";
    warn.textContent = `⚠️ 자녀의 식습관에 따라 단계를 조정해보세요. 신뢰도: ${(payload.confidence * 100).toFixed(0)}%`;
    list.appendChild(warn);
  }

  showScreen("result");
}

// ===== 에러 화면 (T713) =====
function showError(message) {
  $("error-message").textContent = message;
  showScreen("error");
}

function mapError(err) {
  if (err.code === "TIMEOUT") return "응답 시간이 너무 길어요 (20초 초과). 잠시 후 다시 시도해주세요.";
  if (err.status === 400) return err.detail?.error || "입력값을 확인해주세요.";
  if (err.status === 502) return "AI 응답 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
  if (err.status === 500) return "서버 오류입니다. 잠시 후 다시 시도해주세요.";
  if (err.message && err.message.includes("Failed to fetch")) return "인터넷 연결을 확인해주세요.";
  return err.message || "알 수 없는 오류가 발생했습니다.";
}

// ===== 메인 핸들러 =====
let _lastInput = null;

async function handleGenerate() {
  clearInputError();
  const input = collectInput();
  if (!input.ok) {
    showInputError(input.error);
    return;
  }

  _lastInput = input.data;

  showScreen("loading");
  startLoadingAnimation();

  try {
    const response = await generateFoodChain(input.data);

    // 클라이언트 사이드 안전망: 4룰 검증
    if (response.bridge_sequence && response.bridge_sequence.length > 0) {
      const v = validateBridge(response.bridge_sequence);
      if (!v.ok) {
        console.warn("[chain] validation:", v.reason, v.step);
        // 위반이 있어도 표시는 하되 콘솔 경고만 (alpha 단계)
      }
    }

    stopLoadingAnimation();
    renderResult(response);
  } catch (err) {
    stopLoadingAnimation();
    console.error("[generate] failed:", err);
    showError(mapError(err));
  }
}

// ===== Bind =====
$("generate-btn").addEventListener("click", handleGenerate);

$("restart-btn").addEventListener("click", () => {
  showScreen("input");
});

$("retry-btn").addEventListener("click", () => {
  if (_lastInput) handleGenerate();
  else showScreen("input");
});

$("back-btn").addEventListener("click", () => {
  showScreen("input");
});

$("error-back-btn").addEventListener("click", () => {
  showScreen("input");
});

$("share-btn").addEventListener("click", async () => {
  const shareData = {
    title: "밀프레드 Food Bridge",
    text: "30초 안에 자녀 맞춤 편식 다리를 만들어 보세요.",
    url: "https://www.mealfred.com/foodbridge/mvp/",
  };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (_e) { /* 사용자 취소 */ }
  } else {
    try {
      await navigator.clipboard.writeText(shareData.url);
      alert("링크를 복사했어요.");
    } catch (_e) {
      alert("공유 기능을 지원하지 않는 브라우저입니다.");
    }
  }
});

// ===== utils =====
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// ===== 모드 배지 (mock일 때만 노출) =====
function applyModeIndicator() {
  const banner = $("mode-banner");
  const footerTag = $("footer-mode-tag");

  if (MODE === "mock") {
    if (banner) banner.hidden = false;
    if (footerTag) {
      footerTag.textContent = "🎭 mock";
      footerTag.style.color = "#C45A00";
      footerTag.style.fontWeight = "600";
    }
  } else {
    if (banner) banner.hidden = true;
    if (footerTag) {
      footerTag.textContent = "● live";
      footerTag.style.color = "#2E7D32";
      footerTag.style.fontWeight = "600";
    }
  }
}

// ===== Boot =====
applyModeIndicator();
showScreen("input");
