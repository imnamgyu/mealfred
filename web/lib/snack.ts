/**
 * lib/snack.ts — 간식(스낵) 평가 엔진
 *
 * 끼니(식사)와 분리해서 간식만 따로 본다. 식사 영양 신호등·다양성 점수는 lib/nutrition이 맡고,
 * 여기서는 "간식을 무엇으로 채우고 있나"를 예민하게 모니터링한다.
 *
 * 보는 축 4가지:
 *   1) 초가공 모니터링 — 과자·사탕·초콜릿·아이스크림·가당음료 등 빈도(부모가 가장 놓치기 쉬운 곳).
 *   2) 좋은 간식 추천 — 음식(끼니) 식재료 추천과 '별개 개념'. 과일·플레인 유제품·삶은 계란·고구마 등.
 *   3) 칼로리 관점(BMI) — 영양 다양성만 보지 말고, 또래 대비 체격(BmiBand)에 따라
 *      간식을 '영양 든든하게 더'(저체중) / '지금처럼 유지'(정상) / '초가공→좋은 간식으로 바꾸기'(과체중·비만).
 *      ⚠️ 부모에게 노출되는 문구는 체중·살·다이어트 단어를 쓰지 않는다(유아 체중은 민감). stance는 '방향'만.
 *   4) 식사 간섭성 — 끼니 직전 간식이 다음 끼니 식욕을 밀어냈는지(간식 뒤 식사를 덜 먹은 날).
 *      Satter 식사 구조화: 식간 군것질·단 음료가 끼니 식욕을 떨어뜨린다.
 *
 * 산출물은 코칭편지에 '합쳐서' 들어간다(별도 화면 없음). evaluateSnacks()가 SnackEval을 만들고,
 * snackEvalToPrompt()가 그걸 편지용 한 블록 문자열로 바꾼다(lib/coach LetterInput.snackEval).
 *
 * 순수 함수 — 시간(Date.now) 불사용. 간섭성은 같은 날 안에서 meal_time(시)로 판정한다.
 */
import { isProcessed } from './nutrition';
import type { BmiBand } from './growth-reference';

// 간식 슬롯(care 6슬롯 중) — 오전/오후 간식 + 일반 간식. '야간(night)'은 끼니로 취급(간식 아님).
export const SNACK_SLOTS = new Set(['am_snack', 'pm_snack', 'snack']);
// 끼니(주식) 슬롯 — 간섭성: 간식 뒤 이 끼니를 덜 먹었나 판정 대상.
export const MAIN_SLOTS = new Set(['breakfast', 'lunch', 'dinner', 'night']);

const SLOT_LABEL: Record<string, string> = {
  breakfast: '아침', am_snack: '오전 간식', lunch: '점심', pm_snack: '오후 간식', dinner: '저녁', night: '야간', snack: '간식',
};
// meal_time(시)이 비었을 때 슬롯 기본 시각(care SLOTS time 범위 중앙값). 간섭성 gap 계산용.
const SLOT_HOUR: Record<string, number> = {
  breakfast: 8, am_snack: 10.5, lunch: 12.5, pm_snack: 15.5, dinner: 18.5, night: 20.5, snack: 15.5,
};

// ── 간식 분류 ───────────────────────────────────────────────────────────────
// 가당음료 — 탄산·주스·에이드·식혜·가당 유음료 등. (우유·두유·물·보리차는 여기 안 들어감 = 중립/좋음)
const SUGARY_DRINK_RE = /탄산|콜라|사이다|환타|스프라이트|마운틴듀|에이드|식혜|밀크티|버블티|쿨피스|야쿠르트|요구르트\s*음료|요쿠르트|쥬스|주스|음료수|스무디|슬러시|이온음료|게토레이|포카리/;
// 좋은 간식(통식품) — 과일·플레인 유제품·삶은 계란·찐 채소/뿌리·통곡·견과 등. 음식 추천과 별개.
const GOOD_SNACK_RE = /과일|사과|바나나|딸기|블루베리|블루베리|귤|키위|방울토마토|토마토|배(?!추)|포도|참외|수박|복숭아|자두|오이|당근|파프리카|고구마|감자|단호박|옥수수|찐옥수수|삶은\s*계란|삶은\s*달걀|계란|달걀|메추리알|치즈|플레인\s*요거트|그릭\s*요거트|요거트|요구르트|우유|두유|아보카도|견과|호두|아몬드|땅콩|캐슈|밤|두부|누룽지|미숫가루/;

export type SnackKind = 'ultra' | 'sugary' | 'good' | 'neutral';

/** 간식 항목(메뉴/식재료명) 1개 분류. 우선순위: 가당음료 → 초가공/가공육 → 좋은 통식품 → 중립. */
export function classifySnackItem(name: string): SnackKind {
  const n = (name || '').trim();
  if (!n) return 'neutral';
  const compact = n.replace(/\s/g, '');
  if (SUGARY_DRINK_RE.test(compact)) return 'sugary';
  if (isProcessed(n).hit) return 'ultra';          // 과자·젤리·사탕·초콜릿·아이스크림·도넛·가공육 등(nutrition ULTRA/CURED)
  if (GOOD_SNACK_RE.test(compact)) return 'good';
  return 'neutral';
}

/** 간식 1끼(슬롯 1개)의 대표 분류 — '신경 쓸 것'을 놓치지 않게 worst-of로 묶는다(초가공>가당>중립>좋음 순으로 부각). */
export function classifySnackEntry(items: string[]): SnackKind {
  let hasSugary = false, hasGood = false, hasNeutral = false;
  for (const it of items) {
    const k = classifySnackItem(it);
    if (k === 'ultra') return 'ultra';
    if (k === 'sugary') hasSugary = true;
    else if (k === 'good') hasGood = true;
    else hasNeutral = true;
  }
  if (hasSugary) return 'sugary';
  if (hasGood) return 'good';
  return hasNeutral ? 'neutral' : 'good';
}

// ── 칼로리 관점(BMI) → 간식 방향(stance) ──────────────────────────────────────
export type SnackStance = 'encourage' | 'maintain' | 'reduce';
/** 또래 대비 체격 밴드 → 간식 방향. ⚠️ 라벨은 '방향'일 뿐 부모 문구에 체중·살을 쓰지 않는다. */
export function snackStance(band: BmiBand | null | undefined): SnackStance {
  if (band === '저체중') return 'encourage';      // 영양 밀도 높은 간식으로 든든하게(칼로리 보탬)
  if (band === '과체중' || band === '비만') return 'reduce';   // 초가공·가당음료를 좋은 간식으로 교체·포만감
  return 'maintain';                              // 정상/미상: 통식품 위주 유지
}

// 부족 영양소 → 그 영양소를 채우는 '간식 가능' 식품(끼니 추천과 별개, 손으로 집어 먹는 간식 위주).
const SNACKABLE_FOR_RED: Record<string, string[]> = {
  '칼슘': ['치즈', '플레인 요거트', '뼈째 먹는 작은 생선'],
  '단백질': ['삶은 계란', '치즈', '두유'],
  '철': ['삶은 계란', '두유'],
  '식이섬유': ['사과(갈거나 얇게)', '고구마', '방울토마토(반으로 잘라)', '찐 단호박'],
  '비타민C': ['딸기', '귤', '키위', '파프리카'],
  '비타민A': ['찐 단호박', '당근(익혀·강판)', '고구마'],
  '비타민D': ['치즈', '삶은 계란'],
  '칼륨': ['바나나', '고구마'],
  '오메가3': ['호두(잘게)'],
};
// stance별 기본 좋은 간식 풀.
// ⚠️ 질식 안전: 어린 아이에게 작고 단단한 식품(방울토마토·포도·생당근·견과)은 조리 표시를 함께 둔다
//   — (반으로 잘라)·(익혀·강판)·(잘게) 등. 편지가 통째 표현으로 바꾸지 않도록 coach.ts 프롬프트에서도 보존 지시.
//   (괄호는 goodSnackSuggestions 중복제거 키에서 제거되므로 '당근'/'당근(…)'은 같은 항목으로 dedup)
const STANCE_SNACKS: Record<SnackStance, string[]> = {
  // 저체중: 영양 밀도·칼로리 높은 통식품(든든하게)
  encourage: ['치즈', '삶은 계란', '고구마', '바나나', '플레인 그릭요거트', '찐 단호박', '아보카도'],
  // 정상: 통식품 위주 유지
  maintain: ['과일', '플레인 요거트', '치즈', '삶은 계란', '고구마', '방울토마토(반으로 잘라)'],
  // 과체중·비만: 포만감 높고 가당 적은 통식품(과자·단 음료 대체)
  reduce: ['방울토마토(반으로 잘라)', '오이(스틱·껍질 제거)', '사과(갈거나 얇게)', '플레인 요거트', '삶은 계란', '당근(익혀·강판)', '찐 단호박'],
};

/** stance + 부족 영양소 → 좋은 간식 추천 4종(음식 끼니 추천과 별개·중복 제거). */
export function goodSnackSuggestions(stance: SnackStance, reds: string[] = []): string[] {
  const out: string[] = [];
  for (const r of reds) (SNACKABLE_FOR_RED[r] || []).forEach((f) => out.push(f));   // 결핍 보완 우선
  STANCE_SNACKS[stance].forEach((f) => out.push(f));
  const seen = new Set<string>();
  return out.filter((f) => { const k = f.replace(/\(.*?\)/g, ''); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
}

// ── 종합 평가 ─────────────────────────────────────────────────────────────────
type SnackRow = {
  slot: string | null; log_date: string;
  menus: string[] | null; ingredients: string[] | null;
  ate_well: boolean | null; meal_time: number | null;
};
export type Interference = { date: string; snackSlot: string; mealSlot: string; gapH: number; kind: SnackKind };

export type SnackEval = {
  snackEntries: number;          // 간식 슬롯 기록 수(끼니 단위)
  snackDays: number;             // 간식이 기록된 날 수
  ultraCount: number;            // 초가공 간식 끼니 수
  sugaryCount: number;           // 가당음료 간식 끼니 수
  goodCount: number;             // 좋은(통식품) 간식 끼니 수
  ultraExamples: string[];       // 초가공/가당 예시 메뉴명(최대 3)
  interference: Interference[];  // 간섭성: 간식 뒤 다음 끼니를 덜 먹은 사례
  topInterferedMeal: string | null;   // 가장 자주 밀린 끼니 라벨
  stance: SnackStance;
  band: BmiBand | null;
  goodSuggestions: string[];     // BMI·결핍 맞춤 좋은 간식
  concern: boolean;              // 편지에 실을 만한 신호가 있나
  summary: string;               // 한 줄 요약(어드민/디버그)
};

const itemsOf = (r: SnackRow): string[] => [...(r.menus || []), ...(r.ingredients || [])];
const hourOf = (r: SnackRow): number => (typeof r.meal_time === 'number' ? r.meal_time : (SLOT_HOUR[r.slot || ''] ?? 12));

/**
 * 간식 평가 — 최근 창의 meal_logs 행(끼니+간식 전부)을 받아 간식만 분석.
 * @param reds  식사 분석이 계산한 부족 영양소(좋은 간식 추천 편향용)
 * @param band  또래 대비 체격 밴드(없으면 maintain)
 */
export function evaluateSnacks(args: {
  rows: SnackRow[];
  band?: BmiBand | null;
  reds?: string[];
}): SnackEval | null {
  const band = args.band ?? null;
  const stance = snackStance(band);
  const reds = args.reds || [];
  const snackRows = args.rows.filter((r) => r.slot && SNACK_SLOTS.has(r.slot) && itemsOf(r).length);
  const goodSuggestions = goodSnackSuggestions(stance, reds);

  if (!snackRows.length) {
    // 간식 기록이 아예 없음 — 저체중(encourage)일 때만 '좋은 간식으로 보태기' 제안 가치가 있음. 그 외엔 침묵.
    if (stance === 'encourage') {
      return {
        snackEntries: 0, snackDays: 0, ultraCount: 0, sugaryCount: 0, goodCount: 0, ultraExamples: [],
        interference: [], topInterferedMeal: null, stance, band, goodSuggestions, concern: true,
        summary: '간식 기록 없음 · 든든한 간식 보태기 제안(저체중 방향)',
      };
    }
    return null;
  }

  let ultraCount = 0, sugaryCount = 0, goodCount = 0;
  const ultraExamples = new Set<string>();
  for (const r of snackRows) {
    const items = itemsOf(r);
    const kind = classifySnackEntry(items);
    if (kind === 'ultra') { ultraCount++; items.forEach((it) => { if (classifySnackItem(it) === 'ultra') ultraExamples.add(it.trim()); }); }
    else if (kind === 'sugary') { sugaryCount++; items.forEach((it) => { if (classifySnackItem(it) === 'sugary') ultraExamples.add(it.trim()); }); }
    else if (kind === 'good') goodCount++;
  }
  const snackDays = new Set(snackRows.map((r) => r.log_date)).size;

  // 간섭성 — 같은 날, 간식 직후(0~2.5h 이내) 시작한 끼니를 덜 먹었나(ate_well===false).
  const byDate: Record<string, SnackRow[]> = {};
  args.rows.forEach((r) => { if (r.slot && itemsOf(r).length) (byDate[r.log_date] ||= []).push(r); });
  const interference: Interference[] = [];
  for (const [date, day] of Object.entries(byDate)) {
    const snacks = day.filter((r) => SNACK_SLOTS.has(r.slot || ''));
    const meals = day.filter((r) => MAIN_SLOTS.has(r.slot || '') && r.ate_well === false);   // 덜 먹은 끼니만
    for (const s of snacks) {
      const ts = hourOf(s);
      // 간식 직후 가장 가까운 '덜 먹은' 끼니(2.5h 이내)
      let best: { m: SnackRow; gap: number } | null = null;
      for (const m of meals) {
        const gap = hourOf(m) - ts;
        if (gap > 0 && gap <= 2.5 && (!best || gap < best.gap)) best = { m, gap };
      }
      if (best) interference.push({ date, snackSlot: s.slot || '', mealSlot: best.m.slot || '', gapH: Math.round(best.gap * 10) / 10, kind: classifySnackEntry(itemsOf(s)) });
    }
  }
  // 가장 자주 밀린 끼니
  const mealFreq: Record<string, number> = {};
  interference.forEach((i) => { mealFreq[i.mealSlot] = (mealFreq[i.mealSlot] || 0) + 1; });
  const topMeal = Object.entries(mealFreq).sort((a, b) => b[1] - a[1])[0];
  const topInterferedMeal = topMeal ? (SLOT_LABEL[topMeal[0]] || topMeal[0]) : null;

  // 편지에 실을 신호인가 — 초가공/가당 있음 OR 간섭성 OR 비-유지 방향(저체중·과체중/비만)
  const concern = ultraCount + sugaryCount > 0 || interference.length > 0 || stance !== 'maintain';

  const sumParts = [`간식 ${snackRows.length}끼(${snackDays}일)`];
  if (ultraCount) sumParts.push(`초가공 ${ultraCount}`);
  if (sugaryCount) sumParts.push(`가당음료 ${sugaryCount}`);
  if (goodCount) sumParts.push(`통식품 ${goodCount}`);
  if (interference.length) sumParts.push(`식사간섭 ${interference.length}`);
  sumParts.push(`방향:${stance}${band ? `(${band})` : ''}`);

  return {
    snackEntries: snackRows.length, snackDays, ultraCount, sugaryCount, goodCount,
    ultraExamples: [...ultraExamples].slice(0, 3),
    interference, topInterferedMeal, stance, band, goodSuggestions, concern,
    summary: sumParts.join(' · '),
  };
}

/**
 * SnackEval → 코칭편지 프롬프트용 한 블록 문자열(없거나 신호 없으면 null).
 * LLM이 이 사실을 부드럽게 녹이도록 — 체중·살·다이어트 단어 금지, 다그치지 않게.
 */
export function snackEvalToPrompt(ev: SnackEval | null): string | null {
  if (!ev || !ev.concern) return null;
  const parts: string[] = [];
  const ex = ev.ultraExamples.length ? `(예: ${ev.ultraExamples.join('·')})` : '';
  if (ev.ultraCount + ev.sugaryCount > 0) {
    const segs: string[] = [];
    if (ev.ultraCount) segs.push(`과자·단 간식류 ${ev.ultraCount}회`);
    if (ev.sugaryCount) segs.push(`단 음료 ${ev.sugaryCount}회`);
    parts.push(`최근 ${ev.snackDays}일 간식에 ${segs.join(', ')}${ex} 있었어요.`);
  } else if (ev.goodCount) {
    parts.push(`최근 간식은 통식품(${ev.goodCount}회) 위주로 잘 주고 있어요.`);
  }
  if (ev.topInterferedMeal && ev.interference.length) {
    parts.push(`${ev.topInterferedMeal} 전 간식 뒤 ${ev.topInterferedMeal}을(를) 덜 먹은 날이 ${ev.interference.length}번 있었어요(간식이 식사 식욕을 밀어냈을 수 있어요 — 끼니 1~2시간 전은 비워두면 좋아요).`);
  }
  // 방향(체중 단어 없이)
  if (ev.stance === 'encourage') parts.push(`간식을 줄 거면 '영양이 든든한 통식품'으로 채우면 좋아요(예: ${ev.goodSuggestions.join('·')}).`);
  else if (ev.stance === 'reduce') parts.push(`과자·단 음료 대신 '좋은 간식'으로 바꿔주면 좋아요(예: ${ev.goodSuggestions.join('·')}).`);
  else if (ev.ultraCount + ev.sugaryCount > 0) parts.push(`바꿔줄 좋은 간식(끼니와 별개): ${ev.goodSuggestions.join('·')}.`);

  if (!parts.length) return null;
  return `간식 평가(별도 간식 엔진): ${parts.join(' ')}`;
}
