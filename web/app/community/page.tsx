/**
 * /community — 마을(도감 노하우 커뮤니티). 도감=식재료별 사전, 마을=시간·사람·활동 중심 피드.
 * 콜드스타트: 제철 챌린지 + 코치 PICK 시드로 UGC가 적어도 꽉 차게.
 */
'use client';
import { useState, useEffect, useCallback } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import LoginCta from '@/components/LoginCta';
import CommunityWrite from '@/components/CommunityWrite';
import CommunityPostCard from '@/components/CommunityPostCard';
import { allSeeds, seasonalChallenge } from '@/lib/community';

type Post = { id: string; body: string; ingredients: string[]; method_type?: string | null; traits?: string[]; seed?: boolean; like_count?: number; tried_count?: number; author_nick?: string | null; child_age_label?: string | null; liked_by_me?: boolean; tried_by_me?: boolean };

const MONTH = ['', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export default function CommunityPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [sort, setSort] = useState<'new' | 'hot'>('new');
  const [loading, setLoading] = useState(true);
  const [write, setWrite] = useState<{ open: boolean; ing?: string }>({ open: false });

  const month = new Date().getMonth() + 1;
  const seasonal = seasonalChallenge(month);
  const seeds = allSeeds();

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/community/posts?sort=${sort}&limit=30`)
      .then((r) => r.json()).then((j) => { setPosts(j.posts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sort]);

  useEffect(() => { createSupabaseBrowser().auth.getUser().then(({ data }) => setLoggedIn(!!data.user)); }, []);
  useEffect(() => { load(); }, [load]);

  // 피드 = 실제 글 먼저 + 코치 PICK 시드(콜드스타트 채움). 같은 식재료 시드가 실제 글로 이미 덮였으면 굳이 숨기진 않음(시드는 보조).
  const seedCards: Post[] = seeds.map((s) => ({ id: s.id, body: s.body, ingredients: [s.ingredient], method_type: s.method_type, traits: s.traits, seed: true, like_count: 0, tried_count: 0 }));
  const feed: Post[] = sort === 'new' ? [...posts, ...seedCards] : [...posts, ...seedCards];

  return (
    <main className="max-w-md mx-auto w-full min-h-screen flex flex-col overflow-x-hidden" style={{ background: '#FFFDFB' }}>
      <header className="flex items-center justify-between px-5 pt-6 pb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>🏡 마을</h1>
          <span className="text-[11px] font-bold" style={{ color: '#9CA3AF' }}>엄마들의 편식 노하우</span>
        </div>
        {!loggedIn && <LoginCta />}
      </header>

      {/* 글쓰기 CTA */}
      <div className="px-5 pb-3">
        <button onClick={() => setWrite({ open: true })} className="w-full rounded-2xl py-3.5 text-sm font-extrabold flex items-center justify-center gap-2" style={{ background: '#FF6B1A', color: 'white' }}>
          ✏️ 우리 아이 노하우 나누기
        </button>
        <p className="text-[11px] text-center mt-1.5" style={{ color: '#9CA3AF' }}>첫 노하우엔 <b style={{ color: '#C45A00' }}>+500P</b> · 따라 한 엄마가 ‘해봤어요’로 응답해요</p>
      </div>

      {/* 이번 달 제철 챌린지 */}
      <div className="px-5 pb-3">
        <div className="rounded-2xl p-4" style={{ background: '#F0FAF6', border: '1px solid #A5D6C6' }}>
          <div className="text-[13px] font-extrabold mb-1" style={{ color: '#1B7A3D' }}>🌱 {MONTH[month]} 제철 챌린지</div>
          <p className="text-[12px] mb-2.5" style={{ color: '#3a6b52' }}>지금이 제철인 식재료예요. 노하우를 남기면 도감이 채워져요.</p>
          <div className="flex flex-wrap gap-1.5">
            {seasonal.map((ing) => (
              <button key={ing} onClick={() => setWrite({ open: true, ing })} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: 'white', color: '#1B7A3D', border: '1px solid #A5D6C6' }}>{ing} +</button>
            ))}
          </div>
        </div>
      </div>

      {/* 피드 */}
      <div className="px-5 pb-2 flex items-center justify-between">
        <div className="text-[13px] font-extrabold" style={{ color: '#1a2b4a' }}>📋 노하우</div>
        <div className="flex gap-1">
          {(['new', 'hot'] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)} className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: sort === s ? '#1a2b4a' : '#FAFAF7', color: sort === s ? 'white' : '#9CA3AF', border: `1px solid ${sort === s ? '#1a2b4a' : '#E5E7EB'}` }}>{s === 'new' ? '최신' : '인기'}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-5 pb-4">
        {loading && posts.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: '#9CA3AF' }}>불러오는 중…</div>
        ) : (
          <>
            {posts.length === 0 && (
              <div className="rounded-2xl p-4 mb-3 text-center" style={{ background: '#FFF5EB', border: '1px solid #FFD0A0' }}>
                <div className="text-2xl mb-1">🌟</div>
                <p className="text-[13px] font-bold" style={{ color: '#C45A00' }}>아직 마을이 한적해요</p>
                <p className="text-[12px] mt-0.5" style={{ color: '#8a7a6a' }}>아래는 코치가 정리한 노하우예요. 첫 글을 남기면 이 식재료의 <b>1호 마스터</b>가 돼요!</p>
              </div>
            )}
            {feed.map((p) => <CommunityPostCard key={p.id} post={p} />)}
          </>
        )}
      </div>

      {write.open && <CommunityWrite ingredient={write.ing} onClose={() => setWrite({ open: false })} onPosted={load} />}
      <BottomNav active="/community" />
    </main>
  );
}
