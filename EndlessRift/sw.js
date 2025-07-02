// Updated cache name for versioning
const CACHE_NAME = 'survive-it-cache-v1.1.3';
const urlsToCache = [
'/',
'index.html',
'apple-touch-icon.png',
'favicon-16x16.png',
'favicon-32x32.png',
'favicon.ico',
'icon-192.png',
'icon-512.png',
'styles.css',
'systemsmanager.js',
'player.js',
'enemies.js',
'attacks_skills.js',
'rift.js',
'https://fonts.googleapis.com/css2?family=Roboto:wght@700&family=Press+Start+2P&display=swap',
'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4.woff2',
'https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2'
];

self.addEventListener('install', event => {
console.log('[ServiceWorker] Install');
// Skip waiting to force the new service worker to activate immediately.
self.skipWaiting();

event.waitUntil(
caches.open(CACHE_NAME)
.then(cache => {
console.log('[ServiceWorker] Caching app shell');
return cache.addAll(urlsToCache);
})
);
});

self.addEventListener('activate', event => {
console.log('[ServiceWorker] Activate');
const cacheWhitelist = [CACHE_NAME];

// Claiming clients forces the new service worker to take control of open pages.
event.waitUntil(
clients.claim().then(() => {
// Clean up old caches after claiming clients
return caches.keys().then(cacheNames => {
return Promise.all(
cacheNames.map(cacheName => {
if (cacheWhitelist.indexOf(cacheName) === -1) {
console.log('[ServiceWorker] Deleting old cache:', cacheName);
return caches.delete(cacheName);
}
})
);
});
})
);
});

self.addEventListener('fetch', event => {
event.respondWith(
caches.match(event.request)
.then(response => {
// Cache hit - return response
if (response) {
return response;
}
// Not in cache - fetch from network
    return fetch(event.request);
  }
)
);
});
