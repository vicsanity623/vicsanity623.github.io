// A version number for your cache. Change this to a new value every time you update any of the files.
const CACHE_VERSION = 'v1.2.3'; // <-- Increment this number for every update!
const CACHE_NAME = `demucsstems-${CACHE_VERSION}`;

// A list of the essential files your game needs to run offline.
const FILES_TO_CACHE = [
  './', // Caches the root of your site
  './index.html',
];

// The 'install' event is fired when the service worker is first installed.
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => {
        // --- THIS IS THE FIX ---
        // This forces the waiting service worker to become the active service worker.
        console.log('[ServiceWorker] Skip waiting and activate immediately.');
        return self.skipWaiting();
      })
  );
});

// The 'activate' event is fired when the service worker becomes active.
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        // Delete all old caches that don't match the current version.
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
    .then(() => {
      // --- THIS IS THE FIX ---
      // This tells the new service worker to take control of all open pages.
      console.log('[ServiceWorker] Claiming clients.');
      return self.clients.claim();
    })
  );
});

// The 'fetch' event is fired every time the browser tries to request a resource.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // If the file is in the cache, serve it. Otherwise, fetch it from the network.
        return response || fetch(event.request);
      })
  );
});
