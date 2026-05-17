// Cypher Net minimal service worker.
// Caches the app shell on install; serves cached shell when offline. Network-first
// for everything else so live data still reaches the audience when online.

const CACHE = 'cn-shell-v1';
const SHELL = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // Don't cache Supabase or other API calls — let them fail/succeed naturally.
  if (e.request.url.indexOf('supabase.co') > -1) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.status === 200 && new URL(e.request.url).origin === self.location.origin) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (cached) {
        return cached || caches.match('/');
      });
    })
  );
});
