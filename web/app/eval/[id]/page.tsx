import type { Metadata } from 'next';
import { getEvalSnapshot } from '@/lib/evalSnapshot';
import Redirect from './Redirect';

// 공유링크(카톡 등)로 들어오는 바운스 페이지 — 결과 스냅샷은 불변이라 id별로 ISR 캐싱.
// 같은 링크 재진입·크롤러 미리보기가 매번 Supabase를 안 타고 즉시 뜨도록 5분 단위로만 재생성.
export const revalidate = 300;

const SHARE_BASE = 'https://www.mealfred.com/daycare-eval.html';
const OG_IMAGE = 'https://www.mealfred.com/samples/og-daycare-eval.jpg';

// 공유 링크의 카톡/SNS 미리보기 — 결과별 등급·점수를 제목에 노출 (바이럴)
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const snap = await getEvalSnapshot(id);
  const description = '사진 1장이면 30초로 한 달치 영양 진단 — 8축 학술 기준 · 끼니별 분석 · 가정 보충 가이드.';
  const title = snap
    ? `${snap.grade ?? ''} ${snap.total_score ?? ''}점 · 우리 아이 식단표 평가`.trim()
    : '우리 아이 식단표 평가 — 밀프레드';
  const images = [{ url: OG_IMAGE, width: 1200, height: 630 }];
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', url: `https://app.mealfred.com/eval/${id}`, images },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE] },
  };
}

const wrap: React.CSSProperties = {
  minHeight: '100dvh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 14,
  fontFamily: 'Pretendard, -apple-system, sans-serif', padding: 24, textAlign: 'center',
};
const cta: React.CSSProperties = {
  background: '#FF6B1A', color: '#fff', padding: '13px 24px',
  borderRadius: 100, fontWeight: 700, textDecoration: 'none',
};

export default async function EvalSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snap = await getEvalSnapshot(id);

  if (!snap) {
    return (
      <main style={wrap}>
        <p style={{ fontSize: 16, color: '#4B5563' }}>이 결과 링크는 만료됐어요 (공유 후 3일).</p>
        <a href={SHARE_BASE} style={cta}>새로 평가받기 →</a>
      </main>
    );
  }

  const target = `${SHARE_BASE}?r=${encodeURIComponent(id)}`;
  return (
    <main style={wrap}>
      <div style={{ fontSize: 44, fontWeight: 800, color: '#1a2b4a' }}>{snap.grade} · {snap.total_score}점</div>
      <p style={{ color: '#6B7280' }}>결과를 불러오는 중…</p>
      <a href={target} style={cta}>결과 자세히 보기 →</a>
      <Redirect url={target} />
    </main>
  );
}
