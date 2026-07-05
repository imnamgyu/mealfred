/**
 * 편식 상식 점수(쿠키 테스트) 결과 적재·집계의 순수 로직 — /api/quiz-result에서 사용.
 *  - validateQuizPayload: 클라 페이로드 검증(익명·범위 캡). 신뢰 경계: 익명 통계용이라 위조 방지가 아니라 오염(범위 밖 값) 차단이 목적.
 *  - aggregateQuizStats: 응답 행들 → 평균·점수분포·문항별 오답률(게시글 "부모 N%가 틀려요" 소재·보고서용).
 */

export type QuizPayload = { tool: string; qv: string; score: number; correct: number; answers: number[]; wrong: number[] };

const TOOL_RE = /^[a-z][a-z0-9_-]{0,19}$/;
const QV_RE = /^[a-z0-9][a-z0-9._-]{0,11}$/;

/** 페이로드 검증 — 통과 시 정규화된 값, 실패 시 null. */
export function validateQuizPayload(body: unknown): QuizPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const tool = typeof b.tool === 'string' && TOOL_RE.test(b.tool) ? b.tool : null;
  const qv = typeof b.qv === 'string' && QV_RE.test(b.qv) ? b.qv : null;
  const score = Number(b.score), correct = Number(b.correct);
  if (!tool || !qv) return null;
  if (!Number.isInteger(score) || score < 0 || score > 100) return null;
  if (!Number.isInteger(correct) || correct < 0 || correct > 10) return null;
  const intArr = (v: unknown, max: number, cap: number): number[] | null => {
    if (!Array.isArray(v) || v.length > cap) return null;
    const out: number[] = [];
    for (const x of v) {
      const n = Number(x);
      if (!Number.isInteger(n) || n < 0 || n > max) return null;
      out.push(n);
    }
    return out;
  };
  const answers = intArr(b.answers, 9, 20);           // 보기 인덱스(여유 캡)
  const wrong = intArr(b.wrong, 19, 20);              // 문항 인덱스
  if (!answers || !wrong) return null;
  if (wrong.length !== 10 - correct) return null;      // 내부 정합: 틀린 개수 = 10 - 정답 수
  return { tool, qv, score, correct, answers, wrong };
}

export type QuizStatRow = { score: number; wrong: number[] | null };
export type QuizStats = {
  n: number;
  avgScore: number | null;
  scoreDist: Record<string, number>;                  // '0-20'|'30-40'|'50-60'|'70-80'|'90-100'
  wrongRate: { q: number; wrongCount: number; pct: number }[];  // 문항별 오답률(pct=%) — 오답률 높은 순
};

export function aggregateQuizStats(rows: QuizStatRow[], questionCount = 10): QuizStats {
  const n = rows.length;
  const dist: Record<string, number> = { '0-20': 0, '30-40': 0, '50-60': 0, '70-80': 0, '90-100': 0 };
  const wrongCounts = Array.from({ length: questionCount }, () => 0);
  let sum = 0;
  for (const r of rows) {
    sum += r.score;
    const s = r.score;
    dist[s >= 90 ? '90-100' : s >= 70 ? '70-80' : s >= 50 ? '50-60' : s >= 30 ? '30-40' : '0-20']++;
    for (const q of r.wrong || []) if (q >= 0 && q < questionCount) wrongCounts[q]++;
  }
  return {
    n,
    avgScore: n ? Math.round((sum / n) * 10) / 10 : null,
    scoreDist: dist,
    wrongRate: wrongCounts
      .map((c, q) => ({ q: q + 1, wrongCount: c, pct: n ? Math.round((c / n) * 100) : 0 }))
      .sort((a, b) => b.wrongCount - a.wrongCount),
  };
}
