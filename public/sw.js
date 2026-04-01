const CACHE_NAME = 'miu-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/api/') ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
