// Service worker for the College Pets PWA.
//
// Update strategy is tuned for rapid iteration (push → reload on phone):
//   • App code (HTML navigations, src/*.js, css/*) is NETWORK-FIRST, so an
//     online reload always shows the latest deploy; the cache is only a
//     fallback when offline. This avoids the classic "my PWA won't update" trap.
//   • Big immutable runtime files (vendor/** — three.js + addons — and the
//     *.glb models) are CACHE-FIRST for instant, offline-friendly loads.
// skipWaiting + clients.claim make a new worker take over immediately.

// Bump this whenever a cache-first asset (vendor/** or a *.glb model) changes in
// place — the activate handler purges every cache except the current one, so the
// new bytes are refetched instead of served stale. (e.g. the retextured Aura body.)
const CACHE = 'cp-cache-v5';
const PRECACHE = ['./', './index.html', './css/style.css', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // don't touch cross-origin requests

  const immutable = url.pathname.includes('/vendor/') || url.pathname.endsWith('.glb');
  event.respondWith(immutable ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}
