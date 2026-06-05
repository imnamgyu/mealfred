/**
 * BlogFeedCard — 밀프레드 발행 글을 부모 노하우 피드 사이에 '같은 카드 포맷'으로 끼워 넣음.
 * 작성자만 밀프레드. 탭하면 /blog/[slug] 전문. 추천 사유(reason) 있으면 작게 노출.
 */
import Link from 'next/link';
import type { BlogCard } from '@/lib/blog';

export default function BlogFeedCard({ blog }: { blog: BlogCard & { reason?: string | null } }) {
  return (
    <Link href={`/blog/${blog.slug}`} className="block rounded-2xl p-4 mb-2.5 shadow-sm" style={{ background: 'white', border: '1px solid #F0E8E0', textDecoration: 'none' }}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[12px] font-extrabold" style={{ color: '#1a2b4a' }}>밀프레드</span>
        <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: '#EEF2FF', color: '#3949AB' }}>📰 밀프레드 글</span>
        {blog.reason && <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: '#EAF7F0', color: '#16A085' }}>🎯 {blog.reason}</span>}
      </div>

      <p className="text-[14.5px] font-extrabold leading-snug mb-1" style={{ color: '#1a2b4a' }}>{blog.title}</p>
      {blog.excerpt && <p className="text-[13px] leading-relaxed mb-2.5" style={{ color: '#5a6575', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{blog.excerpt}</p>}

      <div className="flex items-center gap-2 pt-1">
        <span className="text-[12px] font-bold px-3 py-1.5 rounded-full" style={{ background: '#FFF0E0', color: '#C45A00' }}>글 읽기 →</span>
        {blog.published_at && <span className="text-[11px]" style={{ color: '#C9B8A8' }}>{blog.published_at}</span>}
      </div>
    </Link>
  );
}
