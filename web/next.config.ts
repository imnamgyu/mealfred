import type { NextConfig } from "next";

const DATA_CACHE = "public, max-age=300, stale-while-revalidate=86400";      // 배포 때만 바뀌는 정적 데이터 JSON
const ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=604800";  // 아이콘·이미지(거의 불변)

const nextConfig: NextConfig = {
  // /public 정적 자산에 캐시 헤더 부여 — Next는 해시 자산(_next/static)만 자동 캐시하고
  // /public의 JSON·아이콘은 헤더가 없어 매 방문마다 새로 받는다(도감·홈 체감 지연 원인).
  // CDN/브라우저가 캐시하고 stale-while-revalidate로 배포 후 자동 갱신.
  async headers() {
    return [
      { source: "/ingredients-light.json", headers: [{ key: "Cache-Control", value: DATA_CACHE }] },
      { source: "/kit-guide.json", headers: [{ key: "Cache-Control", value: DATA_CACHE }] },
      { source: "/ingredient-recipes.json", headers: [{ key: "Cache-Control", value: DATA_CACHE }] },
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: ASSET_CACHE }] },
    ];
  },
};

export default nextConfig;
