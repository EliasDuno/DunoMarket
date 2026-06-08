const CACHE_NAME = 'pidunet-cache-v2';
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

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS).catch(e => console.warn('PWA: Some assets failed to cache', e)))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Ignorar rutas de la API, las maneja offline.js
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // Network-first para navegación (archivos HTML)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request).then(res => res || caches.match('/pdv.html')))
        );
    } else {
        // Cache-first para assets estáticos (CSS, JS, Imágenes)
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) return cachedResponse;
                
                return fetch(event.request).then(response => {
                    // Guardar en caché dinámicamente
                    if (event.request.method === 'GET' && response.status === 200 && !url.protocol.startsWith('chrome-extension')) {
                        const resClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, resClone);
                        });
                    }
                    return response;
                }).catch(() => {
                    // Falla silenciosa si no hay red para un asset no crítico
                });
            })
        );
    }
});
