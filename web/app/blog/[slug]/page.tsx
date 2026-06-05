/**
 * /blog/[slug] — 앱 안에서 블로그(팁) 글 전문 읽기.
 * body_html은 발행 스크립트가 .md를 렌더해 blog_posts에 저장한 것 → 그대로 렌더.
 * 공개글은 RLS(public)로 비로그인도 열람. 하단탭은 '팁'(/community) 유지.
 */
import { createSupabaseServerAnon } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

async function getPost(slug: string) {
  const supabase = await createSupabaseServerAnon();
  const { data } = await supabase
    .from('blog_posts')
    .select('slug,series_no,track,phase,phase_name,title,headline,excerpt,body_html,after_html,published_at,status')
    .eq('slug', slug)
    .eq('status', 'public')
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: '밀프레드 팁' };
  return { title: `${post.title} — 밀프레드`, description: post.excerpt || post.headline || undefined };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <main className="max-w-md mx-auto w-full min-h-screen flex flex-col overflow-x-hidden" style={{ background: '#FFFDFB' }}>
      <header className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 z-10" style={{ background: 'rgba(255,253,251,0.94)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #F4ECE2' }}>
        <Link href="/community" style={{ fontSize: 14, fontWeight: 700, color: '#9a8a7a', textDecoration: 'none' }}>← 팁</Link>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#C45A00' }}>📰 밀프레드</span>
      </header>

      <article className="flex-1 px-5 pt-4 pb-10">
        <div className="flex flex-wrap items-center gap-2 mb-3" style={{ fontSize: 11, color: '#9CA3AF' }}>
          {post.track && <span style={{ fontWeight: 800, padding: '2px 9px', borderRadius: 100, background: post.track === '스낵' ? '#FFF1E2' : '#EEF2FF', color: post.track === '스낵' ? '#C45A00' : '#3949AB' }}>{post.track}</span>}
          {post.phase_name && <span style={{ fontWeight: 700, color: '#6B7280' }}>{post.phase ? `Phase ${post.phase} · ` : ''}{post.phase_name}</span>}
          {post.published_at && <time style={{ marginLeft: 'auto' }}>{post.published_at}</time>}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.3, color: '#1a2b4a', marginBottom: 18 }}>{post.title}</h1>

        <div className="blog-body" dangerouslySetInnerHTML={{ __html: post.body_html }} />
        {post.after_html && <div className="blog-after" dangerouslySetInnerHTML={{ __html: post.after_html }} />}
      </article>

      <BottomNav active="/community" />

      <style>{`
        .blog-body h2 { font-size: 19px; font-weight: 800; color: #C45A00; margin: 26px 0 10px; line-height: 1.4; }
        .blog-body h1 { font-size: 22px; font-weight: 800; color: #1a2b4a; margin: 8px 0 16px; }
        .blog-body p { font-size: 15.5px; line-height: 1.85; color: #2b3542; margin-bottom: 15px; }
        .blog-body ul { margin: 0 0 15px 18px; padding: 0; }
        .blog-body li { font-size: 15.5px; line-height: 1.8; margin-bottom: 6px; color: #2b3542; }
        .blog-body strong { font-weight: 800; color: #1a2b4a; }
        .blog-body a { color: #C45A00; text-decoration: underline; text-underline-offset: 3px; }
        .blog-body blockquote.quote-mark { background: #FFF1E2; border-left: 4px solid #FF6B1A; padding: 13px 15px; margin: 16px 0; font-size: 15px; line-height: 1.7; color: #1a2b4a; font-weight: 600; border-radius: 0 10px 10px 0; }
        .blog-after .blog-ps { background: #F0FAF6; border: 1px solid #A5D6C6; border-radius: 12px; padding: 13px 15px; margin-top: 22px; }
        .blog-after .blog-ps p { font-size: 13.5px; line-height: 1.7; color: #1B5E3A; }
        .blog-after .blog-citations { background: #FAFAF8; border: 1px solid #ECECEC; border-radius: 12px; padding: 14px 15px; margin-top: 16px; }
        .blog-after .blog-citations h4 { font-size: 12px; font-weight: 800; color: #6B7280; letter-spacing: 0.04em; margin-bottom: 8px; }
        .blog-after .blog-citations ul { list-style: none; margin: 0; padding: 0; }
        .blog-after .blog-citations li { font-size: 12px; color: #6B7280; line-height: 1.7; padding: 3px 0; word-break: break-word; }
        .blog-after .blog-citations a { color: #C45A00; }
        .blog-after .blog-hashtags { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
        .blog-after .blog-hashtags .ht { font-size: 11px; font-weight: 700; color: #9a8a7a; background: #F4F4F5; border-radius: 100px; padding: 3px 9px; }
      `}</style>
    </main>
  );
}
