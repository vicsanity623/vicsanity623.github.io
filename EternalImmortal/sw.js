// A unique name for our cache
const CACHE_NAME = 'eternal-immortal-cache-v1';

// The list of files we want to cache. This is the "app shell".
const assetsToCache = [
  '/', // This caches the root URL, which serves index.html
  'index.html',
  'manifest.json',
  'icon-192x192.PNG',
  'icon-512x512.PNG',
  // External resources also need to be cached
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Roboto:wght@300;400;500;700&display=swap'
];

// 1. Install Event: Cache the app shell
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  // waitUntil() ensures the service worker doesn't install until the code inside has successfully completed.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(assetsToCache);
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        self.skipWaiting(); // Force the waiting service worker to become the active service worker.
      })
  );
});

// 2. Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // If a cache's name is not our current one, delete it.
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Become the controller for all clients within its scope.
});

// 3. Fetch Event: Serve cached content when offline
self.addEventListener('fetch', (event) => {
  // We use a "Cache First" strategy
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // If the request is in the cache, return the cached version.
        if (response) {
          // console.log('Service Worker: Found in cache', event.request.url);
          return response;
        }
        // If the request is not in the cache, fetch it from the network.
        // console.log('Service Worker: Not in cache, fetching', event.request.url);
        return fetch(event.request);
      })
  );
});