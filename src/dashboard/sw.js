// ============================================================
// Service Worker — Camelot-IDE v2.6
// Strategia: Network-First (con fallback cache per offline)
// ============================================================

const CACHE_NAME = 'camelot-v2.6.7';
const ASSETS = [
  '/dashboard/index.html',
  '/dashboard/style.css',
  '/dashboard/app.js',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css'
];

// Install: Cache degli asset statici
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Pulizia vecchie cache
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

// Fetch: Network First, Fallback to Cache
self.addEventListener('fetch', (event) => {
  // Ignoriamo richieste non GET e richieste API/WS
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se la rete risponde, aggiorniamo la cache
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        // In caso di errore (offline), cerchiamo nella cache
        return caches.match(event.request);
      })
  );
});
