const CACHE_NAME = 'pidunet-cache-v5';
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
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                return caches.delete(key);
            }));
        })
    );
    self.registration.unregister();
});

self.addEventListener('fetch', (e) => {
    // Bypass all caches
});
