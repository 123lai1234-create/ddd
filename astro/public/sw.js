// Service worker for donttalk portfolio.
// Bump CACHE_NAME to force clients to drop stale HTML/JS after a redeploy.
const BUILD_TAG = '2026-07-22-v6';
const CACHE_NAME = `portfolio-${BUILD_TAG}`;
const STATIC_ASSETS = [
  '/manifest.json',
  '/styles/shared.css',
  '/styles/polish.css',
  '/styles/dynamic.css',
  '/styles/immersive-experience.css',
  '/styles/index.css',
];

// On install: pre-cache the stable, hash-busted shell assets.
// We deliberately do NOT pre-cache the root HTML ('/') or '/index.html' here,
// because the SW served those last deploy and trapped users in the broken
// version. Caching them only after a successful network fetch below gives
// us a soft stale-while-revalidate behaviour.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Let external requests (CDN, Supabase, HF) pass through uncached
  if (url.origin !== location.origin) return;

  // Network-first for HTML navigations so users always see the latest deploy
  // and we do NOT hand back a stale cached page (which is what trapped us
  // in the broken v1 cache with duplicate scripts + fly.dev + mp4).
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/')))
    );
    return;
  }

  // Music/audio/lyrics files: network-first to avoid caching failed fetch responses
  // (cache-first would permanently poison the cache if a single request fails).
  if (url.pathname.startsWith('/music/')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, fonts) — they are content-hashed
  // by Astro so safe to cache aggressively.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
