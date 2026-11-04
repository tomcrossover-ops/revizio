const VERSION = '3.14'; // à garder identique à APP_VERSION dans app.js
const CACHE = 'revizio-' + VERSION;
const ASSETS = ['./', 'index.html', 'styles.css', 'core.js', 'theme.js', 'speech.js', 'ai.js', 'catalog.js', 'learn.js', 'exercise.js', 'cards.js', 'session.js', 'pack.js', 'chapter.js', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'fonts/TwemojiCountryFlags.woff2'];

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

// Réseau d'abord, mais si le réseau traîne (> NET_TIMEOUT ms) et qu'une copie existe, on sert la copie.
const NET_TIMEOUT = 4000;
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // API Claude: jamais en cache
  const net = fetch(req).then(res => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  });
  const timeout = new Promise(resolve => setTimeout(() => resolve(caches.match(req).then(m => m || net)), NET_TIMEOUT));
  e.respondWith(Promise.race([net, timeout]).catch(() => caches.match(req).then(m => m || Response.error())));
});
