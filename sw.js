const CACHE_NAME = 'pidunet-cache-v9';
const STATIC_ASSETS = [
    '/',
    '/pdv.html',
    '/acceso.html',
    '/css/estilos.css',
    '/js/sistema.js',
    '/js/offline.js',
    '/manifest.json',
    '/images/pwa-icon-192.png',
    '/images/pwa-icon-512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Only cache GET requests
    if (e.request.method !== 'GET') return;
    
    // Don't intercept API calls here (handled in offline.js via IndexedDB)
    if (e.request.url.includes('/api/')) return;

    // Network-First strategy
    e.respondWith(
        fetch(e.request).then((fetchRes) => {
            return caches.open(CACHE_NAME).then((cache) => {
                cache.put(e.request, fetchRes.clone());
                return fetchRes;
            });
        }).catch(() => {
            return caches.match(e.request).then((response) => {
                if (response) return response;
                // Fallback for offline mode if HTML is requested
                if (e.request.headers.get('accept').includes('text/html')) {
                    return caches.match('/pdv.html');
                }
            });
        })
    );
});
