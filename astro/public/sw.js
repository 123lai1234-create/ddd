// Service Worker for donttalk portfolio
// Strategy: network-first with cache fallback. Skip caching for any
// request with a ?v=... cache-bust query string (used by music page).

// 2026-09-24 v8: line 91 fetch() 加 .catch()，避免 network 抖動時
//   throw `Uncaught (in promise) TypeError: Failed to fetch`。
// 2026-09-30 v10: bump 強制重裝清舊 cache（修 deploy 切換期間 SW 對 /stock/macro
//   /rebalance 回 Response.error() 導致頁面沒 fallback 內容）；同時把 catch
//   block 從 `Response.error()` 改成 navigation fallback 到 offline.html，
//   避免 transient network 抖動讓使用者看到空白頁。
const CACHE_VERSION = 'v10';
const CACHE_NAME = `portfolio-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Only assets that we *know* are static and small enough to safely cache
// at install time. Anything else is fetched through the network.
const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            fetch(url, { credentials: 'same-origin' })
              .then((res) => {
                if (res && res.status === 200 && res.type === 'basic') {
                  return cache.put(url, res);
                }
                return null;
              })
              .catch((err) => {
                console.warn('[SW] precache skipped', url, err && err.message);
              })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

// 接收 Base.astro 發出的 SKIP_WAITING 訊息，立即接管所有 clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        // 刪除所有舊版 cache (不只 v5)
        Promise.all(keys.filter((k) => k.startsWith('portfolio-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin: never cache, never intercept errors.
  if (url.origin !== self.location.origin) {
    return; // let the browser handle it normally
  }

  // 帶 ?v=... cache-bust 參數的請求：永遠 network-only，失敗讓瀏覽器自己 fallback
  // 不 fallback caches.match（避免 0.1 KB 404 緩存被拿來當作 v=... 的內容）
  if (url.search.length > 1) {
    event.respondWith(fetch(request));
    return;
  }

  // Only handle safe, same-origin basic requests.
  if (request.cache === 'no-store' || request.mode === 'no-cors') {
    return;
  }

  // Network-first for HTML navigations: fall back to cache, then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // 其他資源：cache-first（但 cache 是空的，新策略不 cache 進來）
  // 2026-09-24: 加 .catch() 避免網路錯誤拋 Uncaught (in promise) TypeError
  // 2026-09-30: navigation fallback 到 offline.html，避免 Response.error() 空白
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).catch((err) => {
      console.warn('[SW] resource fetch failed', request.url, err && err.message);
      // Accept: text/html → 視為 navigation 失敗，給 offline.html；其他→ Response.error()
      if ((request.headers.get('Accept') || '').includes('text/html')) {
        return caches.match(OFFLINE_URL).then((off) => off || Response.error());
      }
      return Response.error();
    }))
  );
});
