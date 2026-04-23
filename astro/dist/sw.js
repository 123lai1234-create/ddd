/**
 * Service Worker — Interactive Tech Lab PWA
 * Cache-first strategy for static assets, network-first for API calls.
 */

const CACHE_NAME = 'techlab-v1';
const STATIC_ASSETS = [
  '/interactive-showcase.html',
  '/styles/shared.css',
  '/styles/polish.css',
  '/styles/dynamic.css',
  '/styles/interactive-showcase.css',
  '/scripts/interactive-showcase.js',
  '/scripts/nav.js',
  '/scripts/app-config.js',
  '/manifest.json',
  '/offline.html',
];

const PREFETCH_PAGES = ['/', '/about_me', '/works', '/gene_ai'];

/* ── Install: cache static assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* ── Activate: clean old caches + prefetch key pages ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() =>
        caches.open(CACHE_NAME).then(cache =>
          Promise.allSettled(PREFETCH_PAGES.map(url => cache.add(url)))
        )
      )
  );
  self.clients.claim();
});

/* ── Fetch: stale-while-revalidate for pages, cache-first for assets ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and external CDN (let them go through)
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // API calls — network first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response('{"error":"offline"}', {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Navigation requests — network-first with offline.html fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Static assets — stale-while-revalidate
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

/* ── Push Notifications ── */
self.addEventListener('push', event => {
  const data = event.data?.json() ?? { title: '互動技術展示館', body: '新通知' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/interactive-showcase.html'));
});
