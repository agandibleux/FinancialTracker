/* App-shell cache so the planner opens offline (all data is local anyway). Bump VERSION to force a refresh of cached assets. */
const VERSION = 'v3';
const CACHE = `planner-${VERSION}`;
const ROOT = self.registration.scope; // works under a sub-path like /repo/
const SHELL = ['', 'index.html', 'manifest.webmanifest', 'icon.svg'].map(p => ROOT + p);

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (/\/api\//.test(url.pathname)) return; // never cache API/proxy responses
  if (url.origin !== location.origin) return; // Google sign-in, Drive API and the quote proxy always go to the network

  // page loads: network first (picks up new deployments), fall back to the cached shell when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { caches.open(CACHE).then(c => c.put(ROOT + 'index.html', r.clone())); return r; })
      .catch(() => caches.match(ROOT + 'index.html')));
    return;
  }
  // hashed build assets (js/css/wasm): cache first
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) caches.open(CACHE).then(c => c.put(req, r.clone()));
    return r;
  })));
});
