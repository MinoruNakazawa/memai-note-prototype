// Cache only the patient shell. API responses and patient data are never cached here.
const CACHE = 'memai-patient-shell-github-prototype-v1';
const ASSETS = ['/memai-note-prototype/', '/memai-note-prototype/index.html', '/memai-note-prototype/patient/patient.css', '/memai-note-prototype/patient/app.js', '/memai-note-prototype/patient/model.mjs', '/memai-note-prototype/patient/storage.mjs', '/memai-note-prototype/patient/icon.svg', '/memai-note-prototype/patient/icon-192.png', '/memai-note-prototype/patient/icon-512.png', '/memai-note-prototype/patient/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('memai-patient-shell-github-prototype-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    return cached || new Response('オフラインで開けません。接続して再度お試しください。', { status: 503, headers: { 'content-type': 'text/plain;charset=utf-8' } });
  }));
});
