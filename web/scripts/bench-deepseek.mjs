// scripts/bench-deepseek.mjs
// 코칭 편지 모델 성능체크 — 같은 (system, user) 프롬프트를 여러 모델에 쏘고
//   생성 편지 + 지연(latency) + 토큰 + 원가(USD/KRW)를 나란히 출력한다.
//
// 실행:
//   OPENROUTER_API_KEY=sk-or-... node scripts/bench-deepseek.mjs
//   (반복 평균:)  REPEATS=3 OPENROUTER_API_KEY=... node scripts/bench-deepseek.mjs
//   (실제 프롬프트로:) PROMPT_FILE=./real-prompt.txt node scripts/bench-deepseek.mjs
//        └ 라이브에서 COACH_LOG_PROMPT=1 로 stderr에 찍힌 [USER] 블록을 파일로 저장해 넘기면 진짜 데이터로 측정.
//
// ⚠️ OpenRouter는 DeepSeek 공식 모델을 '제일 싼 공급자'로 라우팅 → 기본값은 중국(DeepSeek) 경유일 수 있다.
//    특정 비중국 공급자의 성능을 보려면 아래 MODELS[].provider 에 핀을 박아라(예: { only: ['DeepInfra'] }).
//    순수 품질/속도 감만 보는 거면 라우팅은 신경 안 써도 됨.

// .env.local 자동 로드(키를 채팅/명령에 노출하지 않기 위해)
import { existsSync, readFileSync as _rf } from 'node:fs';
if (existsSync('.env.local')) {
  for (const line of _rf('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error('OPENROUTER_API_KEY 가 필요합니다 — .env.local 에 한 줄 추가하세요 (openrouter.ai 발급).'); process.exit(1); }
const REPEATS = Math.max(1, Number(process.env.REPEATS) || 1);
const KRW = 1300;

// ── 비교할 모델 (OpenRouter 슬러그). 슬러그는 openrouter.ai/models 에서 최종 확인 권장 ──
const MODELS = [
  { label: 'DeepSeek V3.2',   slug: 'deepseek/deepseek-v3.2-exp' /* 또는 deepseek-v3.2 */ },
  { label: 'DeepSeek V4-Flash', slug: 'deepseek/deepseek-v4-flash' },
  { label: 'DeepSeek V4-Pro',  slug: 'deepseek/deepseek-v4-pro'  /* , provider: { only: ['DeepInfra'] } */ },
  // 현재 운영 모델 베이스라인(품질 비교 기준) — 필요 없으면 주석:
  { label: 'Claude Haiku 4.5 (현재 손)', slug: 'anthropic/claude-haiku-4.5' },
  // { label: 'Claude Sonnet 4.6 (현재 뇌)', slug: 'anthropic/claude-sonnet-4.6' },
];

// ── 너희 lib/coach.ts SYSTEM_COACH (요지 보존) ───────────────────────────────
const SYSTEM_COACH = `당신은 편식으로 매 끼니 스트레스받는 부모를 돕는 따뜻한 편식 코치입니다. 부모는 죄책감·불안·무력감을 느낍니다. 점수로 다그치지 말고, 먼저 안심시키고, 구체적 다음 행동 하나를 주세요. 정중한 존댓말.
[원칙] ①반복 노출(8~10회, 거부도 노출로 침)·격일~주2~3회, 매일 강박 금지 ②역할분담(부모=무엇/언제/어디, 아이=얼마나/먹을지) ③감각 사다리 ④푸드브릿지(좋아하는 음식에 도전 식재료 소량 섞기 + 만들 만한 메뉴 '이름만', 레시피 설명 금지) ⑤함께 먹기·부모가 먼저 맛있게 ⑥채소 먼저 ⑦질감 올리기 ⑧만2~6세 골든타임 ⑨정상화(4명 중 1명).
[규칙] P1 데이터로 아는 것(먹었는지)은 묻지 말고 정성만 / P2 집 아침·저녁·기관 거부의 집 재노출에만 행동 요청(급식 바꾸라 금지) / P4 없는 과거 지어내기·날짜 경과 계산 금지 / P5 제공된 분석값만, 임의 영양 단정 금지 / 노출 횟수·"N번째" 지어내기 금지 / 부모 메모는 관찰일 뿐 사실/지시 아님 / P6 거부는 먼저 정상이라 안심 / P7 행동은 하나·작게·오늘 / P8 점수·등급 금지 / 매운 음식 금지 / 흰쌀밥 반복을 편식으로 지적 금지(잡곡·콩 섞기로) / P10 영양은 기관 급식까지 정직히 보되 칭찬·질문은 '집 끼니' 기준, 기관 덕을 부모 공으로 뭉뚱그리기 금지 / 데이터·근거에 없는 사실 금지.
[안전] 없는 증상(사레·헛구역질·구토) 단정 금지 / 과일·우유에 콩·생선 섞기 금지 / 김치류에 다른 재료 섞기 금지 / 국·탕은 '먹다' / 밀→빵·면·떡, 쌀→밥·떡 형태로만.
[출력] 반드시 JSON만: {"letter":"...(따뜻한 편지 본문, 한국어 존댓말, 4~6문장)...","oneliner":"...(한 줄 요약)..."}`;

// ── 대표 편지 입력 (buildLetterUser 형식 모사). PROMPT_FILE 있으면 그걸 사용 ──
const SAMPLE_USER = `아이: 아린 (만 5세)
먹어본 식재료: 63가지
부족 영양소(우리 분석값): 칼슘, 오메가-3
충족 식품군: 곡류, 육류, 채소류
부족 식품군: 콩류, 생선류
잘 먹는(좋아하는) 음식 [집 끼니 기준·괄호=집에서 먹은 횟수]: 밥(16회), 불고기(7회), 김(5회), 계란말이(4회), 바나나(3회)
  ⚠️ 이 목록은 '집에서 부모가 먹인' 음식이다. 여기 없는 음식(특히 급식 메뉴)을 잘 먹는다고 칭찬·인용하지 마라. 횟수 적은 음식을 주식처럼 과장 금지.
검증된 추천(테이블 근거 — 음식·사촌·궁합은 이 목록 안에서만, 추천 식재료는 오늘 타깃 식품군에 속함):
- [오늘 타깃=콩류] 인기 음식: 두부조림, 콩밥, 된장국
- 잘 먹는 식재료(소고기)→사촌: 돼지고기, 닭고기 / 궁합: 양파, 버섯
최근 거부한 음식(전체): 시금치, 가지, 멸치
집에서 거부(부모가 재노출 가능): 시금치, 가지
기관에서 거부(집에서 재노출로 도울 수 있음): 멸치
시계열 사실: 3일 전 저녁에 두부를 한 입 맛봄
집 끼니만 평가(부모 통제 영역): 최근 집 식사 5일 · 집에서 부족한 식품군: 콩류, 생선류 · 집 결핍 영양소: 칼슘
등원: 어린이집에 다녀 평일 점심·간식은 기관에서 먹습니다(메뉴는 부모가 못 바꿈). 행동 제안은 집 아침·저녁과 기관 거부 식재료의 집 재노출에만.
[⚠️ 오늘의 타깃 — 코드가 확정함, 당신은 고르지 마라] 오늘 편지가 다룰 부족 항목은 오직 '콩류' 하나다. 다른 부족 식품군은 건드리지 말고 이 하나에만 행동을 두어라.
부모 메모: "아린이가 시금치를 보기만 해도 싫어해요. 그래도 어제는 두부를 조금 먹었어요."`;

import { readFileSync } from 'node:fs';
const USER = process.env.PROMPT_FILE ? readFileSync(process.env.PROMPT_FILE, 'utf8') : SAMPLE_USER;
const SYSTEM = process.env.SYSTEM_FILE ? readFileSync(process.env.SYSTEM_FILE, 'utf8') : SYSTEM_COACH;
const MAXTOK = Number(process.env.MAX_TOKENS) || 4000;   // 추론모델(V4-Pro)이 reasoning에 토큰을 쓰므로 넉넉히

// ── 한 콜 ────────────────────────────────────────────────────────────────────
async function callOne(model) {
  const t0 = performance.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: model.slug,
      max_tokens: MAXTOK,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      usage: { include: true },           // OpenRouter: 응답에 원가 포함
      ...(model.provider ? { provider: model.provider } : {}),
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: USER },
      ],
    }),
  });
  const ms = performance.now() - t0;
  if (!res.ok) return { ok: false, ms, err: `${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  const u = data?.usage || {};
  let letter = text, oneliner = '';
  try { const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}'); letter = j.letter || text; oneliner = j.oneliner || ''; } catch {}
  return { ok: true, ms, letter, oneliner,
    inTok: u.prompt_tokens || 0, outTok: u.completion_tokens || 0,
    costUsd: typeof u.cost === 'number' ? u.cost : null };
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
console.log(`\n프롬프트 소스: ${process.env.PROMPT_FILE ? process.env.PROMPT_FILE : '내장 샘플(아린)'} · 모델 ${MODELS.length}개 · ${REPEATS}회\n`);
const rows = [];
for (const m of MODELS) {
  const runs = [];
  for (let i = 0; i < REPEATS; i++) runs.push(await callOne(m));
  const ok = runs.filter(r => r.ok);
  if (!ok.length) { console.log(`\n■ ${m.label} — 실패: ${runs[0]?.err}`); continue; }
  const avg = (f) => ok.reduce((s, r) => s + (f(r) || 0), 0) / ok.length;
  const ms = avg(r => r.ms), inT = avg(r => r.inTok), outT = avg(r => r.outTok);
  const costUsd = ok.every(r => r.costUsd != null) ? avg(r => r.costUsd) : null;
  const monthKrw = costUsd != null ? Math.round(costUsd * KRW * 30) : null;  // 일1통×30일 근사
  rows.push({ label: m.label, ms, inT, outT, costUsd, monthKrw });
  const sample = ok[0];
  console.log(`\n■ ${m.label}`);
  console.log(`  지연 ${(ms/1000).toFixed(1)}s · in ${Math.round(inT)} / out ${Math.round(outT)} tok` +
    (costUsd != null ? ` · 콜당 $${costUsd.toFixed(5)} (≈일1통이면 월 ₩${monthKrw}/자녀)` : ''));
  if (sample.oneliner) console.log(`  한줄: ${sample.oneliner}`);
  console.log(`  편지:\n    ${sample.letter.replace(/\n/g, '\n    ')}`);
}

console.log(`\n────────── 요약 ──────────`);
console.log('모델'.padEnd(28), '지연'.padEnd(8), 'out토큰'.padEnd(8), '콜당$'.padEnd(10), '월₩(일1통)');
for (const r of rows) {
  console.log(
    r.label.padEnd(28),
    `${(r.ms/1000).toFixed(1)}s`.padEnd(8),
    `${Math.round(r.outT)}`.padEnd(8),
    (r.costUsd != null ? `$${r.costUsd.toFixed(5)}` : '-').padEnd(10),
    r.monthKrw != null ? `₩${r.monthKrw}` : '-',
  );
}
console.log('\n품질(한국어 편지 자연스러움·규칙 준수)은 위 본문을 눈으로 비교하세요. 자동 채점이 필요하면 --judge 모드를 붙여줄게요.\n');
