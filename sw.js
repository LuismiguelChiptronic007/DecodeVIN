const CACHE_NAME = 'decodevin-v3';
const ASSETS = [
  './',
  './index.html',
  './index.css',
  './src/app.js',
  './src/decoder.js',
  './decodevin-integracao.js',
  './data/manufacturers.json',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js'
];

// Prepara o cache offline com os arquivos essenciais da aplicação.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('PWA: Cacheando arquivos essenciais para modo offline...');
      return cache.addAll(ASSETS);
    })
  );
});

// Remove versões antigas do cache e ativa imediatamente o novo service worker.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Prioriza rede e usa cache como fallback quando o usuário está offline.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {

        const url = new URL(event.request.url);
        if (ASSETS.includes(url.pathname) || ASSETS.some(a => url.pathname.endsWith(a.replace('./', '')))) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {

        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          console.warn('PWA: Offline e sem cache para:', event.request.url);
        });
      })
  );
});
