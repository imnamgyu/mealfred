import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import GaLoader from "@/components/GaLoader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.mealfred.com"),
  title: "밀프레드 — 우리 아이 식습관 파트너",
  description: "영유아 식재료 도감 · 식단 평가 · 개인화 추천. 초등 입학 전 반드시 먹어야 할 식재료 204종.",
  // 카톡 등 공유(바이럴 /r 링크) 미리보기 — 아린이 사진 + 무료 혜택 후킹
  openGraph: {
    title: "우리 아이 편식, 매일 코칭 — 밀프레드",
    description: "35가지 국제 편식 이론으로 매일 분석·코칭. 🎁 첫 달 무료 + 친구 초대마다 한 달 무료.",
    url: "https://app.mealfred.com",
    siteName: "밀프레드",
    images: [{ url: "/og-arin.png", width: 1200, height: 630, alt: "당근을 맛있게 먹는 아이" }],
    type: "website",
    locale: "ko_KR",
  },
};

// 모바일 뷰포트 — 없으면 페이지가 device-width로 안 맞춰져 가로 넘침/좁은 컬럼 깨짐 발생
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* GA는 GaLoader가 경로 보고 주입 — 어드민(/admin*)은 전면 제외(내부 트래픽 노이즈 방지) */}
        <GaLoader />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
