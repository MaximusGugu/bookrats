const CACHE = 'bookrats-shell-v16';
const SHELL = [
  './', './index.html', './styles.css?v=16', './mobile.css?v=16', './theme.css?v=14',
  './firebase-config.js?v=12', './auth.bundle.js?v=14', './app.js?v=16',
  './manifest.webmanifest', './brand/logo-branco.png', './brand/logo-claro.png',
  './brand/logo-escuro.png', './brand/app-icon-192.png', './brand/app-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(response => response || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
