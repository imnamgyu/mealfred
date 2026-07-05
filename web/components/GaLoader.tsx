'use client';
/**
 * GA 로더 — 어드민(/admin*)은 전면 제외 (이사님 2026-07-05: 내부 트래픽이 GA 노이즈).
 *  - 어드민 직행: 스크립트 자체를 안 심음.
 *  - 앱 → 어드민 클라 내비게이션: 이미 로드된 gtag도 공식 opt-out 플래그(ga-disable-측정ID)로 전송 차단
 *    (GA4 enhanced measurement가 history 변경 page_view를 쏘는 것까지 막음). 어드민 → 앱 복귀 시 재개.
 */
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const GA_ID = 'G-3FRTKL3NFL';

export default function GaLoader() {
  const pathname = usePathname() || '';
  const isAdmin = pathname.startsWith('/admin');

  useEffect(() => {
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = isAdmin;
  }, [isAdmin]);

  if (isAdmin) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">{`
        window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
        gtag('js',new Date());gtag('config','${GA_ID}');
      `}</Script>
    </>
  );
}
