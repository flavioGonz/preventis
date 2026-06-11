const CACHE = 'preventis-v127';
const DATA = 'preventis-data-v35';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/logo_es.png', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => { const c = await caches.open(CACHE); try { await c.addAll(SHELL); } catch (err) {} self.skipWaiting(); })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k !== DATA).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Datos (GET /api y /uploads): network-first, fallback a cache (para uso offline)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    e.respondWith((async () => {
      const c = await caches.open(DATA);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200) c.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await c.match(req);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // Navegaciones: red con fallback al shell
  const esDoc = req.mode === 'navigate' || req.destination === 'document' || (req.headers.get('accept') || '').includes('text/html');
  if (esDoc) {
    e.respondWith((async () => {
      try { return await fetch(req); }
      catch { const c = await caches.open(CACHE); return (await c.match('/index.html')) || (await c.match('/')) || Response.error(); }
    })());
    return;
  }
  // Estaticos: stale-while-revalidate
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const cached = await c.match(req);
    const fetchP = fetch(req).then(res => { if (res && res.status === 200) c.put(req, res.clone()); return res; }).catch(() => null);
    const res = cached || await fetchP;
    if (res) return res;
    const idx = (await c.match('/index.html')) || (await c.match('/'));
    if (idx) return idx;
    return new Response('', { status: 504, statusText: 'offline' });
  })());
});
