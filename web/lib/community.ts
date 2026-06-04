/**
 * lib/community.ts — 커뮤니티(도감 노하우) 공유 모듈. 클라이언트 안전(매핑엔진 import 없음 — 자동 태깅은 서버 API에서 scanIngredients).
 * 보상모델: 글 0P·첫글 +500(1회)·좋아요/해봤어요=신호only·주간 톱10 cron(Phase2).
 */

export const MIN_BODY = 12;   // 한 줄 노하우 최소 길이(품질 게이트)
export const MAX_BODY = 600;

// 자녀 age_band → 라벨(coach.ts AGE_LABEL과 동일 키). 작성자 표시 'N세 아이 엄마'에 사용.
const AGE_BAND_LABEL: Record<string, string> = { younger: '만 3세 미만', '3-4y': '만 3-4세', '5y': '만 5세', '6-7y': '만 6-7세' };
export function ageBandLabel(code: string | null | undefined): string {
  return (code && AGE_BAND_LABEL[code]) || '아이';
}

// 아이 성향 칩(타이핑 0)
export const TRAIT_CHIPS = ['새것 거부', '예민한 입맛', '느린 적응', '식감 까다로움', '편식 심함', '소식'];
// 방법 유형(푸드체이닝 철학 정합)
export const METHOD_TYPES = ['숨기기', '곁들이기', '모양 바꾸기', '맛 바꾸기', '도전(그대로)'];
export const DIFFICULTIES = ['쉬움', '보통', '공들임'];

export type CommunityPost = {
  id: string;
  parent_id: string;
  child_id: string | null;
  ingredients: string[];
  body: string;
  photo_url: string | null;
  age_band: string | null;
  traits: string[];
  method_type: string | null;
  difficulty: string | null;
  time_min: number | null;
  status: string;
  like_count: number;
  tried_count: number;
  created_at: string;
  // 조인/계산 필드
  author_nick?: string | null;
  child_age_label?: string | null;
  liked_by_me?: boolean;
  tried_by_me?: boolean;
};

// 영유아 식이 위험 키워드 가드 — 글/해봤어요에 탐지 시 경고(코칭 안전 가드와 정합). 차단이 아니라 '안전 표시'로 보강 유도.
const DANGER_RULES: { re: RegExp; warn: string }[] = [
  { re: /꿀|벌꿀|허니/, warn: '돌(만 1세) 전 아기에겐 꿀을 주지 마세요 — 보툴리누스 위험이에요.' },
  { re: /통\s*포도|포도\s*통째|방울토마토(?!.*(잘라|반|등분))|통\s*방울/, warn: '포도·방울토마토는 반으로(어릴수록 4등분) 잘라 주세요 — 질식 위험.' },
  { re: /통\s*견과|땅콩\s*통째|아몬드\s*통째|호두\s*통째|견과\s*통째|통\s*아몬드/, warn: '통 견과류는 질식 위험 — 곱게 갈거나 잘게 으깨 주세요.' },
  { re: /생\s*우유|비살균/, warn: '살균하지 않은 생우유는 영유아에게 위험할 수 있어요.' },
  { re: /가래떡|통\s*떡|떡\s*통째/, warn: '떡은 질식 위험 — 작게 잘라 천천히 주세요.' },
  { re: /소시지\s*통째|비엔나\s*통째/, warn: '소시지는 세로로 길게 갈라 작게 잘라 주세요 — 동그란 단면은 질식 위험.' },
];
/** 본문에서 영유아 안전 경고를 뽑는다(여러 개 가능). 작성 폼에서 노란 안내로 표시 → 안전 조리로 보강 유도. */
export function dangerWarnings(text: string): string[] {
  const t = text || '';
  return DANGER_RULES.filter((r) => r.re.test(t)).map((r) => r.warn);
}

/** 작성 전 클라 검증 — 너무 짧거나 길면 막는다(서버도 재검증). */
export function validateBody(body: string): { ok: boolean; reason?: string } {
  const b = (body || '').trim();
  if (b.length < MIN_BODY) return { ok: false, reason: `조금만 더 자세히 적어주세요 (${MIN_BODY}자 이상)` };
  if (b.length > MAX_BODY) return { ok: false, reason: '너무 길어요 — 핵심만 한두 문장으로' };
  return { ok: true };
}

// ── 콜드스타트 시드(코치 PICK) ───────────────────────────────
import SEEDS from './community-seeds.json';
export type Seed = { id: string; ingredient: string; body: string; method_type: string; traits: string[]; time_min: number; difficulty: string };
const SEED_LIST = (SEEDS as { seeds: Seed[] }).seeds;
export function allSeeds(): Seed[] { return SEED_LIST; }
export function seedsForIngredient(ing: string): Seed[] { return SEED_LIST.filter((s) => s.ingredient === ing); }

// 월별 제철 챌린지(도감 표준명) — 콜드스타트 '쓸 거리' + 도감 계획적 채우기.
const SEASONAL: Record<number, string[]> = {
  1: ['시금치', '귤', '우엉', '대구', '굴'],
  2: ['딸기', '시금치', '냉이', '매생이', '꼬막'],
  3: ['딸기', '달래', '냉이', '바지락', '주꾸미'],
  4: ['두릅', '미나리', '양배추', '바지락', '우럭'],
  5: ['완두', '양배추', '오이', '참외', '멸치'],
  6: ['애호박', '오이', '참외', '감자', '갈치'],
  7: ['옥수수', '애호박', '자두', '복숭아', '전복'],
  8: ['옥수수', '가지', '포도', '복숭아', '오징어'],
  9: ['고구마', '표고버섯', '사과', '배', '전복'],
  10: ['고구마', '단호박', '사과', '감', '고등어'],
  11: ['단호박', '시금치', '귤', '배추', '갈치'],
  12: ['배추', '무', '귤', '대구', '굴'],
};
export function seasonalChallenge(month: number): string[] { return SEASONAL[month] || SEASONAL[6]; }
