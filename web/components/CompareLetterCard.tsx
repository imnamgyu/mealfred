/**
 * components/CompareLetterCard.tsx — 코치 편지 A/B 비교 카드 (WBS v2-하이브리드 EPIC F · F-03)
 *
 * ① 기존(Letter A · v2 메인 letter) ② 새 설계(Letter B · context.altLetter) 두 카드를 라벨과 함께 세로로 나란히.
 * ⭐ altB가 null이면(다른 자녀·실패/스킵) 둘째 카드를 그리지 않아 기존 단일 카드와 시각적으로 동일하다(무영향).
 *
 * 이 앱의 코치 편지 카드 스타일(app/page.tsx 583행: #FFF8E1 그라데이션·#F9A825 보더·#1a2b4a 네이비 글자·#16A085 강조)을
 * 그대로 재사용한다(design-spec: 다크배경 금지·네이비 글자·강조색만). 부모 앱은 'use client'(app/page.tsx와 동일).
 */
'use client';
import type { AltLetter } from '@/lib/altLetter';

export type LetterVariant = 'A' | 'B';
export type LetterRating = 'up' | 'down' | 'repeat';

const RATINGS: readonly (readonly [LetterRating, string])[] = [
  ['up', '👍 도움됐어요'],
  ['down', '👎 별로'],
  ['repeat', '🔁 또 비슷해요'],
] as const;

/** 한 카드 안의 1탭 피드백 줄(A·B 공용). variant별로 자기 선택만 하이라이트(서로 독립). */
function FeedbackRow({
  variant, selected, onFeedback,
}: {
  variant: LetterVariant;
  selected: LetterRating | null;
  onFeedback: (variant: LetterVariant, rating: LetterRating) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
      <span className="text-[10.5px] font-semibold" style={{ color: '#9A6A1A' }}>이 편지 어땠어요?</span>
      {RATINGS.map(([r, lbl]) => (
        <button
          key={r}
          onClick={() => onFeedback(variant, r)}
          className="text-[10.5px] font-bold px-2 py-1 rounded-full"
          style={{
            background: selected === r ? '#F9A825' : '#FFF3DD',
            color: selected === r ? 'white' : '#9A6A1A',
            border: '1px solid #F0D8A0',
          }}
        >
          {lbl}
        </button>
      ))}
      {selected && <span className="text-[10.5px] font-semibold" style={{ color: '#16A085' }}>고마워요! 더 나은 편지로 보답할게요</span>}
    </div>
  );
}

export default function CompareLetterCard({
  letterA, altB, dateLabel, isMockup,
  feedback, onFeedback,
}: {
  letterA: string;
  altB: AltLetter | null;
  /** 이미 사람이 읽는 라벨(오늘/어제/M월 D일)로 변환된 문자열. A·B 같은 날짜. */
  dateLabel: string;
  isMockup: boolean;
  /** variant별 현재 선택. 비교 모드(altB 있음)에서만 의미. */
  feedback: { A: LetterRating | null; B: LetterRating | null };
  onFeedback: (variant: LetterVariant, rating: LetterRating) => void;
}) {
  // altB가 없으면 비교 UI를 띄울 이유가 없다 → 라벨 배지 없이 A 본문만(상위가 기존 단일 카드 렌더로 폴백하므로
  // 통상 이 경로엔 altB가 있을 때만 진입하지만, 방어적으로 단일 표시도 지원).
  const compare = !!altB && !isMockup;

  return (
    <>
      {/* ① 기존(Letter A · v2) */}
      <div>
        {compare && (
          <div className="inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full mb-1.5" style={{ background: '#FFF3DD', color: '#9A6A1A', border: '1px solid #F0D8A0' }}>
            ① 기존
          </div>
        )}
        <div className="text-[13px] font-semibold leading-relaxed" style={{ color: '#1a2b4a' }}>{letterA}</div>
        {compare && (
          <FeedbackRow variant="A" selected={feedback.A} onFeedback={onFeedback} />
        )}
      </div>

      {/* ② 새 설계(Letter B · context.altLetter) — altB 있을 때만 */}
      {compare && altB && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px dashed #F0D8A0' }}>
          <div className="inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full mb-1.5" style={{ background: '#E6F7F3', color: '#16A085', border: '1px solid #B7E4D8' }}>
            ② 새 설계
          </div>
          {dateLabel && <span className="text-[10px] font-semibold ml-1.5" style={{ color: '#9A6A1A' }}>· {dateLabel}</span>}
          <div className="text-[13px] font-semibold leading-relaxed" style={{ color: '#1a2b4a' }}>{altB.letter}</div>
          {altB.oneliner && (
            <div className="text-[11.5px] leading-relaxed mt-1" style={{ color: '#5a4a3a' }}><span className="italic">{altB.oneliner}</span></div>
          )}
          {altB.mirror && (
            <div className="text-[10px] leading-relaxed mt-1" style={{ color: '#9CA3AF' }}>🪞 {altB.mirror}</div>
          )}
          <FeedbackRow variant="B" selected={feedback.B} onFeedback={onFeedback} />
        </div>
      )}
    </>
  );
}
