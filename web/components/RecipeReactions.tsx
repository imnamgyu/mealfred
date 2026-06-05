'use client';
/** 레시피 좋아요/해봤어요 토글 버튼(상세 페이지). 포인트 X — 선정 신호. */
import { useState } from 'react';

export default function RecipeReactions({ recipeId, like, tried, likedByMe, triedByMe }: {
  recipeId: string; like: number; tried: number; likedByMe: boolean; triedByMe: boolean;
}) {
  const [liked, setLiked] = useState(likedByMe);
  const [didTry, setDidTry] = useState(triedByMe);
  const [lc, setLc] = useState(like);
  const [tc, setTc] = useState(tried);

  async function toggle(kind: 'like' | 'tried') {
    const on = kind === 'like' ? !liked : !didTry;
    if (kind === 'like') { setLiked(on); setLc((n) => n + (on ? 1 : -1)); } else { setDidTry(on); setTc((n) => n + (on ? 1 : -1)); }
    try {
      const r = await fetch('/api/community/recipe/react', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: recipeId, kind, on }),
      });
      const j = await r.json();
      if (!j.ok) { // 롤백
        if (kind === 'like') { setLiked(!on); setLc((n) => n + (on ? -1 : 1)); } else { setDidTry(!on); setTc((n) => n + (on ? -1 : 1)); }
      }
    } catch {
      if (kind === 'like') { setLiked(!on); setLc((n) => n + (on ? -1 : 1)); } else { setDidTry(!on); setTc((n) => n + (on ? -1 : 1)); }
    }
  }

  const btn = (active: boolean) => ({ flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 800, border: `1.5px solid ${active ? '#FF6B1A' : '#F0E6DC'}`, background: active ? '#FFF1E2' : '#FAF7F3', color: active ? '#C45A00' : '#6B7280', cursor: 'pointer' } as const);

  return (
    <div className="flex gap-2 mt-5">
      <button onClick={() => toggle('like')} style={btn(liked)}>{liked ? '♥' : '♡'} 좋아요 {lc > 0 ? lc : ''}</button>
      <button onClick={() => toggle('tried')} style={btn(didTry)}>🙋 해봤어요 {tc > 0 ? tc : ''}</button>
    </div>
  );
}
