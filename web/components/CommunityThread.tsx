/**
 * components/CommunityThread.tsx — 도감 상세 §6 '엄마들의 노하우' 스레드(식재료별).
 * 코치 PICK 시드(콜드스타트) + 실제 UGC + 이 식재료로 바로 글쓰기.
 */
'use client';
import { useState, useEffect, useCallback } from 'react';
import CommunityWrite from './CommunityWrite';
import CommunityPostCard from './CommunityPostCard';
import { seedsForIngredient } from '@/lib/community';

type Post = { id: string; body: string; ingredients: string[]; method_type?: string | null; traits?: string[]; seed?: boolean; like_count?: number; tried_count?: number; author_nick?: string | null; child_age_label?: string | null; liked_by_me?: boolean; tried_by_me?: boolean };

export default function CommunityThread({ ingredient }: { ingredient: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [write, setWrite] = useState(false);
  const seeds = seedsForIngredient(ingredient);

  const load = useCallback(() => {
    fetch(`/api/community/posts?ing=${encodeURIComponent(ingredient)}&limit=20`)
      .then((r) => r.json()).then((j) => setPosts(j.posts || [])).catch(() => { });
  }, [ingredient]);
  useEffect(() => { load(); }, [load]);

  const seedCards: Post[] = seeds.map((s) => ({ id: s.id, body: s.body, ingredients: [s.ingredient], method_type: s.method_type, traits: s.traits, seed: true }));
  const all: Post[] = [...posts, ...seedCards];

  return (
    <section className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
      <h2 className="text-sm font-extrabold mb-1" style={{ color: '#1a2b4a' }}>
        💬 엄마들의 {ingredient} 노하우 {posts.length > 0 && <span className="font-normal text-[11px]" style={{ color: '#9CA3AF' }}>· {posts.length}명이 나눴어요</span>}
      </h2>
      <p className="text-[11px] mb-3" style={{ color: '#8a7a6a' }}>이 식재료를 잘 먹인 다른 엄마들의 방법이에요. 따라 해보고 ‘해봤어요’로 응답해 주세요.</p>

      {all.length === 0 ? (
        <div className="rounded-xl p-3.5 mb-2 text-center" style={{ background: '#FFF5EB', border: '1px solid #FFD0A0' }}>
          <p className="text-[12.5px] font-bold" style={{ color: '#C45A00' }}>아직 노하우가 없어요</p>
          <p className="text-[11.5px] mt-0.5" style={{ color: '#8a7a6a' }}>첫 글을 남기면 이 {ingredient}의 <b>1호 마스터 엄마</b>가 돼요!</p>
        </div>
      ) : (
        <div className="mb-1">{all.map((p) => <CommunityPostCard key={p.id} post={p} showIng={false} />)}</div>
      )}

      <button onClick={() => setWrite(true)} className="w-full rounded-xl py-2.5 text-[13px] font-extrabold mt-1" style={{ background: '#FFF0E0', color: '#C45A00', border: '1px solid #FFD0A0' }}>
        ✏️ 내 {ingredient} 노하우 남기기
      </button>

      {write && <CommunityWrite ingredient={ingredient} onClose={() => setWrite(false)} onPosted={load} />}
    </section>
  );
}
