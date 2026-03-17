const CACHE_NAME = 'decodevin-v2';
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

// Instalar Service Worker e Cachear Assets
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forçar ativação imediata
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('PWA: Cacheando arquivos essenciais para modo offline...');
      return cache.addAll(ASSETS);
    })
  );
});

// Ativar e Limpar Caches Antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim(); // Assumir controle imediato
});

// Interceptar Requisições (Network First Strategy)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se a rede respondeu, atualizamos o cache se for um asset conhecido
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
        // Se a rede falhar, tentamos o cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          console.warn('PWA: Offline e sem cache para:', event.request.url);
        });
      })
  );
});
