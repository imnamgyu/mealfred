/**
 * /community — 팁 탭. 위=밀프레드가 발행하는 글(블로그), 아래=엄마들 노하우 커뮤니티.
 * 콜드스타트: 제철 챌린지 + 코치 PICK 시드로 UGC가 적어도 꽉 차게.
 * (블로그 정렬은 Phase 2에서 개인 맞춤 추천엔진으로 교체 예정 — 현재는 최신 발행순.)
 */
'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import LoginCta from '@/components/LoginCta';
import CommunityWrite from '@/components/CommunityWrite';
import CommunityPostCard from '@/components/CommunityPostCard';
import { allSeeds, seasonalChallenge } from '@/lib/community';
import type { BlogCard } from '@/lib/blog';

type Post = { id: string; body: string; ingredients: string[]; method_type?: string | null; traits?: string[]; seed?: boolean; like_count?: number; tried_count?: number; author_nick?: string | null; child_age_label?: string | null; liked_by_me?: boolean; tried_by_me?: boolean };

const MONTH = ['', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export default function CommunityPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [blogs, setBlogs] = useState<(BlogCard & { reason?: string | null })[]>([]);
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
  // 밀프레드 발행 글(블로그) — 개인 맞춤 추천 순서(로그인 시). 비로그인은 최신순 폴백.
  useEffect(() => {
    fetch('/api/blog/feed?limit=12').then((r) => r.json()).then((j) => setBlogs(j.posts || [])).catch(() => {});
  }, []);

  // 피드 = 실제 글 먼저 + 코치 PICK 시드(콜드스타트 채움). 같은 식재료 시드가 실제 글로 이미 덮였으면 굳이 숨기진 않음(시드는 보조).
  const seedCards: Post[] = seeds.map((s) => ({ id: s.id, body: s.body, ingredients: [s.ingredient], method_type: s.method_type, traits: s.traits, seed: true, like_count: 0, tried_count: 0 }));
  const feed: Post[] = sort === 'new' ? [...posts, ...seedCards] : [...posts, ...seedCards];

  return (
    <main className="max-w-md mx-auto w-full min-h-screen flex flex-col overflow-x-hidden" style={{ background: '#FFFDFB' }}>
      <header className="flex items-center justify-between px-5 pt-6 pb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>📰 팁</h1>
          <span className="text-[11px] font-bold" style={{ color: '#9CA3AF' }}>매일 새 글 · 엄마들 노하우</span>
        </div>
        {!loggedIn && <LoginCta />}
      </header>

      {/* 밀프레드 발행 글(블로그) — 팁 최상단. 현재 최신순, Phase 2에서 개인 맞춤 추천순. */}
      {blogs.length > 0 && (
        <section className="pb-3">
          <div className="px-5 pb-2 flex items-center gap-2">
            <div className="text-[13px] font-extrabold" style={{ color: '#1a2b4a' }}>📰 밀프레드의 글</div>
            <span className="text-[11px]" style={{ color: '#9CA3AF' }}>매일 한 편, 근거 있는 편식 이야기</span>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: 'none' }}>
            {blogs.map((b) => (
              <Link key={b.slug} href={`/blog/${b.slug}`} className="flex-shrink-0 rounded-2xl p-3.5" style={{ width: 220, background: 'white', border: '1px solid #F0E6DC', boxShadow: '0 2px 9px rgba(0,0,0,0.03)', textDecoration: 'none' }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: b.track === '스낵' ? '#FFF1E2' : '#EEF2FF', color: b.track === '스낵' ? '#C45A00' : '#3949AB' }}>{b.track || '글'}</span>
                  {b.phase_name && <span className="text-[10px] font-bold" style={{ color: '#9CA3AF' }}>{b.phase_name}</span>}
                </div>
                {b.reason && <div className="text-[10.5px] font-extrabold mb-1 flex items-center gap-1" style={{ color: '#16A085' }}>🎯 {b.reason}</div>}
                <div className="text-[14px] font-extrabold leading-snug" style={{ color: '#1a2b4a' }}>{b.title}</div>
                {b.excerpt && <p className="text-[11.5px] mt-1.5 leading-relaxed" style={{ color: '#8a7a6a', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.excerpt}</p>}
                {b.published_at && <div className="text-[10px] mt-2" style={{ color: '#C9B8A8' }}>{b.published_at}</div>}
              </Link>
            ))}
          </div>
        </section>
      )}

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
                <p className="text-[13px] font-bold" style={{ color: '#C45A00' }}>아직 노하우가 한적해요</p>
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
