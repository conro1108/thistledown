// Minimal offline support: network-first, falling back to whatever's cached
// (and to the app shell if a page was never visited). Bump CACHE on releases
// that must invalidate old assets — there's no hashed-asset precache list
// here on purpose, this is a prototype-grade cache, not a build pipeline.
const CACHE = 'thistledown-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/'))),
  );
});
