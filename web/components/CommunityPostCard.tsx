/**
 * components/CommunityPostCard.tsx — 노하우 카드(피드·도감 §6 공용).
 * 실제 글 = 좋아요/해봤어요 토글(포인트 X·신호)·신고. 시드(코치 PICK) = 정적 표시.
 */
'use client';
import { useState } from 'react';
import type { CommunityPost } from '@/lib/community';

type CardPost = Partial<CommunityPost> & { id: string; body: string; ingredients: string[]; seed?: boolean; method_type?: string | null };

export default function CommunityPostCard({ post, showIng = true }: { post: CardPost; showIng?: boolean }) {
  const [like, setLike] = useState(!!post.liked_by_me);
  const [tried, setTried] = useState(!!post.tried_by_me);
  const [likeN, setLikeN] = useState(post.like_count || 0);
  const [triedN, setTriedN] = useState(post.tried_count || 0);
  const [reported, setReported] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const author = post.author_nick || (post.child_age_label ? `${post.child_age_label} 아이 엄마` : '익명의 엄마');

  async function react(kind: 'like' | 'tried') {
    if (post.seed || busy) return;
    const on = kind === 'like' ? !like : !tried;
    // optimistic
    if (kind === 'like') { setLike(on); setLikeN((n) => n + (on ? 1 : -1)); }
    else { setTried(on); setTriedN((n) => n + (on ? 1 : -1)); }
    setBusy(true);
    try {
      const r = await fetch('/api/community/react', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post_id: post.id, kind, on }) });
      const j = await r.json();
      if (!j.ok) { // 롤백
        if (kind === 'like') { setLike(!on); setLikeN((n) => n + (on ? -1 : 1)); }
        else { setTried(!on); setTriedN((n) => n + (on ? -1 : 1)); }
      }
    } catch { /* keep optimistic */ }
    setBusy(false);
  }

  async function report() {
    if (post.seed || !confirm('이 노하우를 신고할까요? (비난·강압·위험·판매 등)')) return;
    setReported(true);
    try { const r = await fetch('/api/community/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post_id: post.id }) }); const j = await r.json(); if (j.ok) setHidden(true); } catch { /* noop */ }
  }

  if (hidden) return <div className="rounded-2xl p-4 mb-2.5 text-center text-xs" style={{ background: '#FAFAF7', color: '#9CA3AF', border: '1px solid #E5E7EB' }}>신고해 주셔서 감사해요. 검토할게요.</div>;

  return (
    <div className="rounded-2xl p-4 mb-2.5 shadow-sm" style={{ background: 'white', border: '1px solid #F0E8E0' }}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[12px] font-extrabold" style={{ color: '#1a2b4a' }}>{author}</span>
        {post.seed && <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: '#F0FAF6', color: '#1B7A3D' }}>🩺 코치 PICK</span>}
        {post.method_type && <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#EAF2FF', color: '#2B5CB8' }}>{post.method_type}</span>}
        {!post.seed && <button onClick={report} className="ml-auto text-[11px]" style={{ color: '#C9C0B6' }}>{reported ? '신고됨' : '⋯'}</button>}
      </div>

      <p className="text-[14px] leading-relaxed mb-2.5" style={{ color: '#2a3545' }}>{post.body}</p>

      {post.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.photo_url} alt="" loading="lazy" className="w-full rounded-xl object-cover mb-2.5" style={{ maxHeight: 260 }} />
      )}

      {showIng && post.ingredients?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {post.ingredients.map((i) => (
            <a key={i} href={`/foods/${encodeURIComponent(i)}`} className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#FFF0E0', color: '#C45A00' }}>{i}</a>
          ))}
        </div>
      )}

      {(post.traits?.length || 0) > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {post.traits!.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#FAFAF7', color: '#9CA3AF' }}>#{t}</span>)}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => react('like')} disabled={post.seed} className="text-[12px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
          style={{ background: like ? '#FFE8D0' : '#FAFAF7', color: like ? '#C45A00' : '#6B7280', border: `1px solid ${like ? '#FFD0A0' : '#E5E7EB'}`, opacity: post.seed ? 0.55 : 1 }}>
          👍 좋아요{likeN > 0 ? ` ${likeN}` : ''}
        </button>
        <button onClick={() => react('tried')} disabled={post.seed} className="text-[12px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
          style={{ background: tried ? '#EAF7F0' : '#FAFAF7', color: tried ? '#1B7A3D' : '#6B7280', border: `1px solid ${tried ? '#A5D6C6' : '#E5E7EB'}`, opacity: post.seed ? 0.55 : 1 }}>
          🙌 해봤어요{triedN > 0 ? ` ${triedN}` : ''}
        </button>
      </div>
    </div>
  );
}
