/**
 * lib/reexposure.ts — 정밀 재노출 타이밍 (코칭 엔진).
 *
 * 거부/도전 식재료를 '아이별 마지막 노출 시점'과 '노출 횟수'로 보고 "지금 다시 권하기 좋은가"를 판정.
 * 근거 이론: 반복 노출(보통 8~10회 만나야 수용), 재노출 주기 격일~주2~3회
 *           (매일 누르면 권태로 더 빨리 물리고, 너무 오래 안 주면 잊힌다).
 *
 * 핵심: 숫자(횟수·일수)는 코드가 계산해 '사실 문장'으로 만들어 편지에 넘긴다 → LLM은 인용만(환각 차단, P4·P5).
 */

export type ReexpoVerdict = {
  nm: string;
  count: number;       // 최근 창에서 만난 횟수(노출 = 거부해도 셈)
  daysAgo: number;     // 마지막 노출 후 경과일
  verdict: 'due' | 'overdue';
  fact: string;        // 부모에게 보여줄 데이터 근거 한 줄(편지가 인용)
};

/**
 * refused(거부) 식재료 중 '재노출 적기' 1개를 골라 데이터 근거 사실을 만든다.
 * - 어제/오늘(0~1일 전) 준 건 제외(권태 — 매일 누르면 역효과).
 * - 2~7일 전 = due(주기상 딱 좋음), 8일+ = overdue(잊히기 전에 다시).
 * - due 안에서는 '많이 만난 것'(수용 임박) 우선.
 * 적기 후보가 없으면 null.
 */
export function reexposurePick(
  refused: string[],
  offerCount: Record<string, number>,
  offerDaysAgo: Record<string, number>,
): ReexpoVerdict | null {
  const cands = [...new Set(refused)]
    .map((nm) => ({ nm, count: offerCount[nm] ?? 0, daysAgo: offerDaysAgo[nm] ?? 999 }))
    .filter((c) => c.daysAgo >= 2);   // 어제/오늘 준 건 제외(권태)
  if (!cands.length) return null;
  cands.sort((a, b) => {
    const ad = a.daysAgo <= 7 ? 0 : 1, bd = b.daysAgo <= 7 ? 0 : 1;   // due(2~7) 먼저
    if (ad !== bd) return ad - bd;
    return (b.count - a.count) || (a.daysAgo - b.daysAgo);             // 많이 만난 것 → 덜 오래된 것
  });
  const c = cands[0];
  const verdict: 'due' | 'overdue' = c.daysAgo <= 7 ? 'due' : 'overdue';
  const nearAccept = c.count >= 8 ? ' (벌써 여러 번 만나 거의 친해질 때예요)' : '';
  const fact = verdict === 'due'
    ? `거부했던 '${c.nm}'를 최근 ${c.count}번 만났고 마지막이 ${c.daysAgo}일 전이에요 — 격일~주2~3회 재노출 주기상 지금 다시 권하기 좋은 시점${nearAccept}`
    : `거부했던 '${c.nm}'를 ${c.count}번 만난 뒤 ${c.daysAgo}일째 안 올라왔어요 — 잊히기 전에 부담 없이 다시 만나기 좋은 때`;
  return { nm: c.nm, count: c.count, daysAgo: c.daysAgo, verdict, fact };
}
