const VERSION = '2.7'; // à garder identique à APP_VERSION dans app.js
const CACHE = 'revizio-' + VERSION;
const ASSETS = ['./', 'index.html', 'styles.css', 'core.js', 'ai.js', 'catalog.js', 'learn.js', 'cards.js', 'app.js', 'manifest.webmanifest', 'icon.svg'];

// Pas de skipWaiting automatique : la nouvelle version attend que l'utilisateur clique sur « Mettre à jour ».
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // API Claude: jamais en cache
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
