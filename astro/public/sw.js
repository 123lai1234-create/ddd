// Service Worker for donttalk portfolio
// Strategy: network-first with cache fallback. Skip caching for any
// request with a ?v=... cache-bust query string (used by music page).

const CACHE_VERSION = 'v6';
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

  // 帶 ?v=... cache-bust 參數的請求：永遠 network-first，不走 cache
  // 這避免舊版 JS/CSS 被 cache 留住造成更新沒生效
  if (url.search.length > 1) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
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
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
