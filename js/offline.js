console.log('OFFLINE.JS LOADED');

// 1. Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('PWA Service Worker registered.'))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}

// 2. Initialize IndexedDB Database
const DB_NAME = 'pidunet_offline';
const DB_VERSION = 1;
let dbPromise;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('api_cache')) {
                db.createObjectStore('api_cache', { keyPath: 'url' });
            }
            if (!db.objectStoreNames.contains('offline_sales')) {
                db.createObjectStore('offline_sales', { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getDB() {
    if (!dbPromise) dbPromise = initDB();
    return await dbPromise;
}

async function cacheApiResponse(url, data) {
    try {
        const db = await getDB();
        const tx = db.transaction('api_cache', 'readwrite');
        tx.objectStore('api_cache').put({ url, data, timestamp: Date.now() });
        return new Promise(resolve => tx.oncomplete = resolve);
    } catch(e) { console.error('IndexedDB Error', e); }
}

async function getCachedApiResponse(url) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('api_cache', 'readonly');
            const request = tx.objectStore('api_cache').get(url);
            request.onsuccess = () => resolve(request.result ? request.result.data : null);
            request.onerror = () => reject(request.error);
        });
    } catch(e) { return null; }
}

async function queueOfflineSale(payload) {
    try {
        const db = await getDB();
        const tx = db.transaction('offline_sales', 'readwrite');
        tx.objectStore('offline_sales').add({ payload, timestamp: Date.now() });
        return new Promise(resolve => tx.oncomplete = resolve);
    } catch(e) { console.error('IndexedDB Error queueing sale', e); }
}

window.isSyncing = false;
async function syncOfflineSales() {
    if (window.isSyncing || !navigator.onLine) return;
    window.isSyncing = true;
    updateOfflineIndicator();
    
    try {
        const db = await getDB();
        const tx = db.transaction('offline_sales', 'readonly');
        const store = tx.objectStore('offline_sales');
        const request = store.getAll();
        
        request.onsuccess = async () => {
            const sales = request.result;
            if (sales.length === 0) {
                window.isSyncing = false;
                updateOfflineIndicator();
                return;
            }
            
            console.log(`Syncing ${sales.length} offline sales...`);
            let syncCount = 0;
            
            for (const sale of sales) {
                try {
                    const res = await originalFetch('/api/sales', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-tenant-slug': sessionStorage.getItem('tenant_slug') || ''
                        },
                        body: JSON.stringify(sale.payload)
                    });
                    
                    if (res.ok) {
                        const deleteTx = db.transaction('offline_sales', 'readwrite');
                        deleteTx.objectStore('offline_sales').delete(sale.id);
                        syncCount++;
                    }
                } catch(err) {
                    console.error('Failed to sync sale', sale.id, err);
                    break;
                }
            }
            
            if (syncCount > 0 && typeof window.showNotification === 'function') {
                window.showNotification('Sincronización', `Se sincronizaron ${syncCount} ventas locales con éxito.`);
            }
            
            window.isSyncing = false;
            updateOfflineIndicator();
        };
    } catch(err) {
        console.error('Error in syncOfflineSales', err);
        window.isSyncing = false;
        updateOfflineIndicator();
    }
}

// 3. Intercept Fetch
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    // If it's a Request object
    let url = '';
    let method = 'GET';
    let body = null;

    if (typeof args[0] === 'string') {
        url = args[0];
        if (args[1]) {
            method = args[1].method || 'GET';
            body = args[1].body;
        }
    } else if (args[0] instanceof Request) {
        url = args[0].url;
        method = args[0].method;
    }

    const isApi = url.includes('/api/');
    
    try {
        const response = await originalFetch(...args);
        
        if (response.ok && isApi && method !== 'POST' && method !== 'DELETE') {
            const clone = response.clone();
            clone.json().then(data => {
                const urlPath = new URL(url, window.location.origin).pathname;
                cacheApiResponse(urlPath, data);
            }).catch(() => {});
        }
        
        return response;
        
    } catch (err) {
        if (isApi) {
            const urlPath = new URL(url, window.location.origin).pathname;
            
            if (method === 'GET') {
                const cachedData = await getCachedApiResponse(urlPath);
                if (cachedData) {
                    console.warn(`[OFFLINE] Serving ${urlPath} from IndexedDB Cache`);
                    return new Response(JSON.stringify(cachedData), { 
                        status: 200, 
                        headers: { 'Content-Type': 'application/json' } 
                    });
                }
            } else if (method === 'POST' && urlPath === '/api/sales') {
                if (body) {
                    console.warn(`[OFFLINE] Queueing sale locally`);
                    await queueOfflineSale(JSON.parse(body));
                    return new Response(JSON.stringify({ success: true, message: 'Venta guardada localmente', offline: true }), { status: 200 });
                }
            }
        }
        
        throw err;
    }
};

// 4. UI Indicator
function updateOfflineIndicator() {
    let indicator = document.getElementById('offlineIndicator');
    if (!indicator) {
        const nav = document.querySelector('.navbar');
        if (nav) {
            indicator = document.createElement('div');
            indicator.id = 'offlineIndicator';
            indicator.style.padding = '5px 10px';
            indicator.style.borderRadius = '20px';
            indicator.style.fontSize = '0.85rem';
            indicator.style.fontWeight = 'bold';
            indicator.style.marginLeft = 'auto';
            indicator.style.marginRight = '15px';
            indicator.style.transition = 'all 0.3s ease';
            indicator.style.zIndex = '9999';
            // Insert before the user menu
            const userMenu = nav.querySelector('.user-menu');
            if (userMenu) {
                nav.insertBefore(indicator, userMenu);
            } else {
                nav.appendChild(indicator);
            }
        }
    }
    
    if (indicator) {
        if (!navigator.onLine) {
            indicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Modo Sin Conexión (Guardando local)';
            indicator.style.backgroundColor = '#ffebee';
            indicator.style.color = '#c62828';
            indicator.style.display = 'block';
        } else if (window.isSyncing) {
            indicator.innerHTML = '<i class="fas fa-sync fa-spin"></i> Sincronizando ventas...';
            indicator.style.backgroundColor = '#fff8e1';
            indicator.style.color = '#f57f17';
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    }
}

window.addEventListener('online', () => {
    updateOfflineIndicator();
    syncOfflineSales();
});

window.addEventListener('offline', () => {
    updateOfflineIndicator();
});

document.addEventListener('DOMContentLoaded', () => {
    updateOfflineIndicator();
    if (navigator.onLine) {
        setTimeout(syncOfflineSales, 3000);
    }
});
