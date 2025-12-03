const CACHE_NAME = 'satoshi-tapper-cache-v2'; // Incremented version to force update
const urlsToCache = [
    '/backend/',
    '/backend/index.html',
    '/backend/manifest.json',
    // Add your icon files here with the full path
    '/backend/icon-192x192.png',
    '/backend/icon-512x512.png',
    '/backend/icon-maskable-192x192.png',
    '/backend/icon-maskable-512x512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
