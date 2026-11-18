// Offline support: always try the network first (so updates show up right away),
// fall back to the saved copy when offline.
const CACHE = 'diet-v4';
const SHELL = ['./', 'index.html', 'config.js', 'css/app.css', 'vendor/vendor.js', 'manifest.webmanifest',
  'js/main.js', 'js/calc.js', 'js/db.js', 'js/ui.js', 'js/today.js', 'js/add.js', 'js/library.js', 'js/scan.js', 'js/progress.js', 'js/more.js', 'js/recipes.js', 'js/calculator.js',
  'icons/icon-192.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // database & CDNs: straight to network
  // cache: 'no-cache' = always ask GitHub if there's a newer file (cheap when nothing changed)
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
