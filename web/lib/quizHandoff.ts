/**
 * quizHandoff — 쿠키 상식점수(mealfred.com/cookie-quiz.html) → 앱 홈 자연 전환.
 *
 * 퀴즈 결과 CTA가 qz(점수 0~100)·qzw(오답 문항 원본 인덱스 CSV)를 실어 보내면,
 * 앱 홈 비로그인 배너가 '아까 그 점수'로 환영해 퀴즈→앱이 한 대화처럼 이어진다.
 * 인덱스는 cookie-quiz.html QUIZ 배열의 문항 순서(0~9) — 문항 세트(qv)가 바뀌면 아래 훅 표도 함께 갱신할 것.
 */
export type QuizHandoff = { score: number; wrong: number[] };

// 오답 문항 → 부모가 방금 헷갈린 개념 한 줄(배너에서 "아까 그 문제"로 호명해 연속감을 만든다)
export const WRONG_HOOK: Record<number, string> = {
  0: "'반복 노출 8~15번'",
  1: "'조용히 치우기' 대응",
  2: "'같은 식탁'의 힘",
  3: "'그릇 비우기'의 함정",
  4: "'몰래 갈아넣기'의 한계",
  5: "'크면 나아진다'의 진실",
  6: "'식전 간식' 용의자",
  7: "'역할 분담' 원칙",
  8: "'새 반찬 배치법'",
  9: "'한 입만'의 역효과",
};

/** URL 쿼리에서 퀴즈 핸드오프 파싱. qz가 0~100 숫자가 아니면 null(핸드오프 없음). */
export function parseQuizHandoff(q: URLSearchParams): QuizHandoff | null {
  const raw = q.get('qz');
  if (raw == null || raw === '') return null;
  const s = Number(raw);
  if (!Number.isFinite(s) || s < 0 || s > 100) return null;
  const wrong = (q.get('qzw') || '')
    .split(',')
    .filter((v) => v.trim() !== '')   // ''.split(',')→[''] 이고 Number('')===0 — 만점자에게 유령 오답 0번이 생기는 것 차단
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 9);
  return { score: Math.round(s), wrong };
}

/** 점수대·첫 오답에 맞춘 환영 배너 카피 — 퀴즈 결과 화면의 어투(70점 경계)와 동일하게 잇는다. */
export function quizWelcome(h: QuizHandoff): { title: string; body: string } {
  const hook = h.wrong.length ? WRONG_HOOK[h.wrong[0]] : null;
  if (h.score >= 70) {
    return {
      title: `💯 편식 상식 ${h.score}점 — 이론은 합격이에요`,
      body: hook
        ? `남은 과목은 '우리 아이 실전'. 아까 헷갈린 ${hook}부터 코치가 우리 아이 기록 기준으로 매일 알려드려요.`
        : `남은 과목은 '우리 아이 실전' — 식단만 기록하면 코치가 매일 실전 한 수를 보내드려요.`,
    };
  }
  return {
    title: `💯 편식 상식 ${h.score}점으로 오셨네요`,
    body: hook
      ? `괜찮아요, 다들 그렇게 배워왔어요. 아까 헷갈린 ${hook}부터 — 오답노트 외울 필요 없이 코치가 우리 아이 기준으로 하루 하나씩 알려드려요.`
      : `오답노트 외울 필요 없어요 — 코치가 우리 아이 상황 기준으로 하루 하나씩 알려드려요.`,
  };
}
