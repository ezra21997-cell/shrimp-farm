// Caches the whole game so it opens instantly and works offline.
// Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = 'shrimpfarm-v3';
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/economy.js',
  'js/scene.js',
  'js/models.js',
  'vendor/three.module.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first (so updates arrive), falling back to the cache when offline.
// Only good responses are cached, so a 404/500 mid-deploy can't replace a
// working file. Page navigations fall back to the cached index.html.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          e.waitUntil(caches.open(VERSION).then((c) => c.put(e.request, copy)));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(e.request, { ignoreSearch: true });
        if (hit) return hit;
        if (e.request.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      }),
  );
});
