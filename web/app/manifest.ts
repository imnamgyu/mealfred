import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '밀프레드 — 우리 아이 식습관',
    short_name: '밀프레드',
    description: '영유아 편식 개선 · 식사 기록 · 영양 진단',
    start_url: '/care',
    display: 'standalone',
    background_color: '#FFFDFB',
    theme_color: '#FF6B1A',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
