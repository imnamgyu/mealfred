// Service Worker — 밀프레드 Food Bridge MVP
// 2026-05-14 · Sprint M-A · T700~T705 골격
//
// 전략:
//   - shell(HTML/CSS/JS/manifest) = cache-first (오프라인 진입 가능)
//   - API 호출(supabase.co) = network-only (캐시 금지, 항상 fresh)
//   - 시드 JSON = stale-while-revalidate (빠른 표시 + 백그라운드 갱신)

const VERSION = "v1-mvp-2026-05-14";
const SHELL_CACHE = `foodbridge-shell-${VERSION}`;
const DATA_CACHE = `foodbridge-data-${VERSION}`;

const SHELL_ASSETS = [
  "/foodbridge/mvp/",
  "/foodbridge/mvp/index.html",
  "/foodbridge/mvp/manifest.json",
  "/foodbridge/mvp/css/style.css",
  "/foodbridge/mvp/js/app.js",
  "/foodbridge/mvp/js/chain.js",
  "/foodbridge/mvp/js/api.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // GET만 캐싱 (POST 등은 network passthrough)
  if (request.method !== "GET") return;

  // Supabase API 호출 → network-only
  if (url.hostname.endsWith("supabase.co")) {
    return; // 기본 fetch (캐시 미사용)
  }

  // 시드 JSON + Mock 응답 JSON → stale-while-revalidate
  if (
    url.pathname.endsWith("/data/food_seed.json") ||
    url.pathname.endsWith("/data/mock_responses.json")
  ) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached ?? networkPromise;
      }),
    );
    return;
  }

  // PWA shell → cache-first
  if (url.pathname.startsWith("/foodbridge/mvp/")) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => caches.match("/foodbridge/mvp/index.html")),
      ),
    );
  }
});
