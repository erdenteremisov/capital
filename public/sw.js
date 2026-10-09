/* Service Worker: кэширует ТОЛЬКО статические файлы приложения (same-origin GET). Финансовые данные лежат в IndexedDB и сюда не попадают; внешних запросов нет. */
const V = 'my-capital-v2';
const PRE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(V); await c.addAll(PRE);
  const html = await (await fetch('./index.html', { cache: 'reload' })).text();
  const assets = [...html.matchAll(/(?:src|href)="(\.?\/assets\/[^"]+)"/g)].map(m => m[1]); await c.addAll(assets); await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; }).catch(() => (r.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
