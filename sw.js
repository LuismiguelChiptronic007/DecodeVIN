const CACHE_NAME = 'decodevin-v1';
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

// instalar Service Worker e Cachear Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('PWA: Cacheando arquivos essenciais para modo offline...');
      return cache.addAll(ASSETS);
    })
  );
});

// ftivar e Limpar Caches Antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// interceptar Requisições (Cache First Strategy)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Se estiver no cache, retorna. Senão, vai buscar na rede.
      return response || fetch(event.request).catch(() => {
        // Fallback caso falte internet e não esteja no cache (opcional)
        console.warn('PWA: Requisição falhou e não há cache disponível para:', event.request.url);
      });
    })
  );
});