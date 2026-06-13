/**
 * lib/recoEvidence.ts — 식재료 근거 문구 생성 규칙 (WBS EPIC I · I-06).
 *
 * 인계서 C(이사님 핵심): 근거 문구를 LLM '재료'로 못 박는다('당근=급식 상위2%·비타민A가 눈·면역').
 *   식재료를 받아 ①급식 상위%(I-02 단일 진실원) ②영양 역할(NUTRIENT_FOODS 역인덱스)
 *   두 사실을 결합한 **결정론 근거 문구**를 만든다. LLM은 이 문구를 재료로 받아 작문만.
 *
 * 정직성(인계서 I·D5):
 *   · 급식빈도 0(단호박)이면 '상위 N%' 절을 **생략**(0회를 '상위 100%'로 위장 금지).
 *   · 영양·빈도 둘 다 없으면 빈 text(LLM에 허위 근거 미제공).
 *   · text에 재료 밖 음식명(미역국 등)을 넣지 않는다(사실만 — G 검증 대비).
 *
 * 순수 함수 — fs/HTTP·시계·LLM 불사용. NUTRIENT_FOODS·ingredient-freq는 read만(무변경).
 */
import { NUTRIENT_FOODS } from './nutrition';
import { topPctOf } from './ingredientFreq';

export type Evidence = { freqPct: number | null; nutrients: string[]; text: string };

// NUTRIENT_FOODS(영양소→대표 식재료)를 식재료→영양소[]로 역인덱스(빌드타임 1회·결정론).
const NUTRIENT_OF: Record<string, string[]> = (() => {
  const rev: Record<string, string[]> = {};
  for (const [nutrient, foods] of Object.entries(NUTRIENT_FOODS)) {
    for (const f of foods) {
      const arr = (rev[f] ||= []);
      if (!arr.includes(nutrient)) arr.push(nutrient);   // 중복 제거(I-06-10)
    }
  }
  return rev;
})();

// 영양 역할 친화 라벨(KEY_NUTRIENTS 기반 결정론 매핑) — LLM이 인용할 짧은 역할어.
const ROLE_LABEL: Record<string, string> = {
  '단백질': '근육', '칼슘': '뼈·치아', '철': '혈액', '비타민A': '눈·면역',
  '비타민C': '면역', '비타민D': '뼈', '오메가3': '두뇌', '식이섬유': '배변',
  '아연': '면역', '엽산': '세포', '비타민B12': '혈액', '요오드': '대사',
  '칼륨': '혈압', '마그네슘': '신경', '비타민K': '뼈·혈액', '비타민E': '항산화',
};

/**
 * 식재료의 근거 사실 — { 급식 상위%(없으면 null), 영양소[], 결합 text }.
 * 당근 → { freqPct:2, nutrients:['비타민A'], text:'급식 상위 2%·비타민A(눈·면역)' }.
 * 단호박 → { freqPct:null, ... } text에 '상위' 절 없음.
 */
export function evidenceFor(ing: string): Evidence {
  const key = (ing || '').trim();
  if (!key) return { freqPct: null, nutrients: [], text: '' };

  const freqPct = topPctOf(key);                 // I-02 단일 진실원(0회는 null)
  const nutrients = [...new Set(NUTRIENT_OF[key] || [])];

  const clauses: string[] = [];
  if (freqPct !== null) clauses.push(`급식 상위 ${freqPct}%`);   // 0회는 절 생략(위장 금지)
  if (nutrients.length) {
    const role = nutrients.map((n) => ROLE_LABEL[n]).find(Boolean);
    const nutText = nutrients.join('·');
    clauses.push(role ? `${nutText}(${role})` : nutText);
  }
  return { freqPct, nutrients, text: clauses.join('·') };
}
