// Onyx Folio service worker.
// App code (html/js/css/json) is served network-first, so a deploy always shows
// up on the next load — no more stale modules from the GitHub Pages cache.
// Heavy static assets (fonts, images) are cache-first for speed, with a network
// fill on first miss.
const CACHE = 'onyx-cache-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isAsset = /\.(?:ttf|otf|woff2?|png|jpe?g|webp|gif|svg|ico)$/i.test(url.pathname);

  if (isAsset) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  } else {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req)),
    );
  }
});
