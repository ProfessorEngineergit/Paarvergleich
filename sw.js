/*
 * Service Worker: macht prio.coach installierbar und offline nutzbar.
 * Strategie „stale-while-revalidate“: sofort aus dem Cache antworten, im Hintergrund
 * aktualisieren. Neue Versionen sind damit spätestens beim nächsten Öffnen da.
 * Anfragen an Supabase (Konto, Daten) laufen immer direkt übers Netz.
 */
const CACHE = 'prio-v3';
const SHELL = [
  './', './index.html', './style.css', './engine.js', './week.js', './app.js', './sync.js',
  './manifest.webmanifest', './impressum.html', './datenschutz.html',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
];
const CDN = ['https://cdn.jsdelivr.net/', 'https://cdnjs.cloudflare.com/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !CDN.some(p => req.url.startsWith(p))) return; // z. B. Supabase: immer Netz
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: same });
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => hit || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
    return hit || net;
  }));
});
