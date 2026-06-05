/**
 * RecipeInfographic — 레시피를 이케아 설명서처럼: 재료 띠 + 번호 스텝 프레임(식재료 → 동사 + 메모 + 시간).
 * 훅 없음 = 서버(상세 페이지)·클라(빌더 미리보기) 공용.
 */
import { ingEmoji, verbEmoji, matsFromSteps, type RecipeStep } from '@/lib/recipe';

export default function RecipeInfographic({
  dish, tip, photoUrl, ingredients, steps, author, badge,
}: {
  dish: string; tip?: string | null; photoUrl?: string | null;
  ingredients?: string[]; steps: RecipeStep[]; author?: string | null; badge?: string | null;
}) {
  const mats = ingredients && ingredients.length ? ingredients : matsFromSteps(steps);
  return (
    <div>
      {/* hero */}
      <div className="flex items-center justify-center relative" style={{ height: 150, background: 'linear-gradient(135deg,#FFE8CC,#FFC89A)', borderRadius: 16, overflow: 'hidden' }}>
        {photoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          : <span style={{ fontSize: 60 }}>{ingEmoji(mats[0] || '')}</span>}
        {badge && <span className="absolute top-3 left-3 text-[10px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.92)', color: '#C45A00' }}>{badge}</span>}
      </div>

      <h1 className="mt-3" style={{ fontSize: 21, fontWeight: 800, color: '#1a2b4a' }}>{dish}</h1>
      {author && <div className="mt-0.5" style={{ fontSize: 12, fontWeight: 700, color: '#C45A00' }}>{author}</div>}
      {tip && <p className="mt-2" style={{ fontSize: 13, color: '#5a6575', lineHeight: 1.6, background: '#FBF7F2', borderLeft: '3px solid #FFB877', padding: '8px 11px', borderRadius: '0 8px 8px 0' }}>{tip}</p>}

      {/* 재료 */}
      <div className="mt-5 mb-1.5" style={{ fontSize: 12, fontWeight: 800, color: '#C45A00', letterSpacing: '0.04em' }}>🧺 재료</div>
      <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {mats.map((m) => (
          <div key={m} className="flex-shrink-0 text-center" style={{ width: 60 }}>
            <div className="mx-auto flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 14, background: '#FFF5EB', border: '1.5px solid #FFE0C0', fontSize: 26 }}>{ingEmoji(m)}</div>
            <div className="mt-1" style={{ fontSize: 10.5, fontWeight: 800, color: '#1a2b4a' }}>{m}</div>
          </div>
        ))}
      </div>

      {/* 만드는 순서 */}
      <div className="mt-5 mb-2" style={{ fontSize: 12, fontWeight: 800, color: '#C45A00', letterSpacing: '0.04em' }}>👩‍🍳 만드는 순서</div>
      <div>
        {steps.map((s, i) => (
          <div key={i}>
            {i > 0 && <div className="mx-auto" style={{ width: 2, height: 14, background: '#D8C8B8' }} />}
            <div className="flex items-center gap-3 relative" style={{ border: '2px solid #1a2b4a', borderRadius: 16, padding: '13px 14px', background: 'white' }}>
              <span className="absolute flex items-center justify-center" style={{ top: -11, left: 14, width: 24, height: 24, borderRadius: '50%', background: '#1a2b4a', color: 'white', fontSize: 12, fontWeight: 800 }}>{i + 1}</span>
              <span style={{ fontSize: 34, width: 44, textAlign: 'center', flexShrink: 0 }}>{ingEmoji(s.ing)}</span>
              <span style={{ fontSize: 20, color: '#C9B8A8' }}>→</span>
              <span className="flex-1 min-w-0">
                <span style={{ fontSize: 20 }}>{verbEmoji(s.verb)}</span>
                <span className="ml-1" style={{ fontSize: 15, fontWeight: 800, color: '#1a2b4a' }}>{s.verb}</span>
                {s.memo && <div style={{ fontSize: 11, color: '#7a6a5a', fontStyle: 'italic', marginTop: 2 }}>{s.memo}</div>}
              </span>
              {s.time && <span className="flex-shrink-0" style={{ fontSize: 11, fontWeight: 800, color: '#C45A00', background: '#FFF1E2', borderRadius: 100, padding: '4px 9px' }}>⏱ {s.time}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
