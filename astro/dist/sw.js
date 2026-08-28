// Service Worker for donttalk portfolio
// - Cache static assets and pages for offline
// - Network-first for HTML, cache-first for static assets
// - Robust against 404s and network errors

const CACHE_VERSION = 'v3';
const CACHE_NAME = `portfolio-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Core assets that are guaranteed to exist on every build.
// Other URLs (pages, fonts) are cached opportunistically on first fetch.
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Use add() one-by-one so a single 404 doesn't abort the whole precache.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] precache failed for', url, err.message);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isCacheable(response) {
  if (!response) return false;
  if (response.status !== 200) return false;
  if (response.type === 'opaque' || response.type === 'opaqueredirect') return false;
  return true;
}

async function safeCachePut(cache, request, response) {
  if (!isCacheable(response)) return;
  try {
    await cache.put(request, response);
  } catch (err) {
    // Cache.put can throw if the request/response pair is invalid
    // (e.g. CORS-opaque, network error during Range requests).
    console.warn('[SW] cache.put failed for', request.url, err.message);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin requests: never cache, just pass through.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request).catch(() => {
        if (request.destination === 'image') {
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="100%" height="100%" fill="#000"/></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
        return new Response('', { status: 503 });
      })
    );
    return;
  }

  // HTML navigations: network-first, fall back to cache, then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (isCacheable(res)) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => safeCachePut(cache, request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Static assets: cache-first, fall back to network, opportunistically cache.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (isCacheable(res)) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => safeCachePut(cache, request, clone));
          }
          return res;
        })
        .catch(() => {
          // For images, return a tiny transparent SVG so the layout doesn't break.
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="100%" height="100%" fill="#000"/></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
          return new Response('', { status: 503, statusText: 'Service Unavailable' });
        });
    })
  );
});
