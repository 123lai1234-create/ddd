const CACHE_NAME = 'portfolio-v2';
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/styles/shared.css',
  '/styles/polish.css',
  '/styles/dynamic.css',
  '/styles/immersive-experience.css',
  '/styles/index.css',
  '/styles/index-content.css',
  '/styles/index-live.css',
  '/styles/performance-optimized.css',
  '/styles/immersive-experience.css',
  '/manifest.json',
];

// App shell pages for offline
const APP_SHELL_PAGES = [
  '/about_me.html',
  '/works.html',
  '/report.html',
  '/ngs.html',
  '/gene_ai.html',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Pre-cache static assets
      await cache.addAll(STATIC_ASSETS);
      // Warm up app shell pages
      await Promise.allSettled(
        APP_SHELL_PAGES.map(page =>
          fetch(page).then(r => r.ok ? cache.put(page, r.clone()) : null).catch(() => null)
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // External requests: network only, no cache
  if (url.origin !== location.origin) {
    event.respondWith(fetch(request).catch(() => {
      // For images, return a transparent 1x1 pixel
      if (request.destination === 'image') {
        return new Response(
          'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwMDAiLz48L3N2Zz4=',
          { headers: { 'Content-Type': 'image/svg+xml' } }
        );
      }
      // For navigation, return offline page
      if (request.mode === 'navigate') {
        return caches.match(OFFLINE_URL);
      }
      return new Response('Network error', { status: 503 });
    }));
    return;
  }

  // Same-origin: cache-first for static, network-first for pages
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') {
          return res;
        }
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return res;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
        // Non-navigation requests: return a proper Response so respondWith()
        // does not throw "Failed to convert value to 'Response'".
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

// Background sync for form submissions
self.addEventListener('sync', event => {
  if (event.tag === 'contact-form') {
    event.waitUntil(syncContactForm());
  }
});

async function syncContactForm() {
  // Sync any pending contact form submissions
  const pending = await getPendingSubmissions();
  for (const data of pending) {
    try {
      await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      await removePendingSubmission(data.id);
    } catch (e) {
      console.error('Sync failed:', e);
    }
  }
}

async function getPendingSubmissions() {
  // Placeholder - implement IndexedDB storage if needed
  return [];
}

async function removePendingSubmission(id) {
  // Placeholder
}
