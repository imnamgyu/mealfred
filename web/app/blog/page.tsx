/**
 * /blog — 밀프레드 팁(블로그) 전체 목록. 팁 탭 개편(→키트)으로 홈 피드(최신 5건) 밖의 글이
 * 앱 안에서 도달 불가능해지는 회귀를 막는 인덱스. 공개글 전량, 최신 발행순.
 */
import Link from 'next/link';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';

export const revalidate = 3600;   // 공개글 목록 — 쿠키無(admin·status='public')라 정적 생성 + 1시간 재생성

type Row = { slug: string; title: string; excerpt: string | null; track: string | null; published_at: string | null };

export default async function BlogIndexPage() {
  const { data } = await createSupabaseAdmin()
    .from('blog_posts')
    .select('slug,title,excerpt,track,published_at')
    .eq('status', 'public')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('series_no', { ascending: false });
  const posts = (data as Row[] | null) || [];

  return (
    <main className="max-w-md mx-auto w-full min-h-screen flex flex-col overflow-x-hidden" style={{ background: '#FFFDFB' }}>
      <header className="flex items-center justify-between px-5 pt-6 pb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>📰 밀프레드 팁</h1>
          <span className="text-[11px] font-bold" style={{ color: '#9CA3AF' }}>편식 코치가 쓴 글 {posts.length}편</span>
        </div>
        <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: '#9a8a7a', textDecoration: 'none' }}>← 홈</Link>
      </header>

      <div className="flex-1 px-5 pb-4">
        {posts.length === 0 ? (
          <p className="text-center py-10 text-sm" style={{ color: '#9CA3AF' }}>아직 발행된 글이 없어요</p>
        ) : posts.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="block rounded-2xl p-4 mb-2.5 shadow-sm" style={{ background: 'white', border: '1px solid #F0E8E0', textDecoration: 'none' }}>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {p.track && <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: p.track === '스낵' ? '#FFF1E2' : '#EEF2FF', color: p.track === '스낵' ? '#C45A00' : '#3949AB' }}>{p.track}</span>}
              {p.published_at && <span className="text-[10.5px]" style={{ color: '#C9B8A8' }}>{p.published_at}</span>}
            </div>
            <p className="text-[14.5px] font-extrabold leading-snug" style={{ color: '#1a2b4a' }}>{p.title}</p>
            {p.excerpt && <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: '#5a6575', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.excerpt}</p>}
          </Link>
        ))}
      </div>
      <BottomNav active="/" />
    </main>
  );
}
