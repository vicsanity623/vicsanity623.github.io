// A unique name for your cache
const CACHE_NAME = 'eternal-immortal-cache-v0.0.6';

// The list of files to cache on install
// This should include all your core assets.
const URLS_TO_CACHE = [
  '/', // The root of your site (index.html)
  '// A unique name for your cache
const CACHE_NAME = 'eternal-immortal-cache-v0.0.3';

// The list of files to cache on install
// This should include all your core assets.
const URLS_TO_CACHE = [
  '/', // The root of your site (index.html)
  'index.html', // Explicitly cache index.html
  'manifest.json',
  'music.mp3',
  'icon-192x192.PNG',
  'icon-512x512.PNG',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css' // The external stylesheet
  // Note: The service worker will also cache the font files (.woff2) that the above CSS requests during the first online visit.
];

// Install event: Caches the core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching core assets');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Fetch event: Serves cached content when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    // 1. Try to find the request in the cache
    caches.match(event.request)
      .then(cachedResponse => {
        // 2. If it's in the cache, return it.
        //    Otherwise, fetch it from the network.
        return cachedResponse || fetch(event.request).then(networkResponse => {
          // Optional: Cache the newly fetched resource for future offline use
          // This is useful for assets not in the initial cache list (like fonts)
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
      .catch(() => {
        // If both cache and network fail (e.g., offline and not cached)
        // you could return a fallback page here if you had one.
      })
  );
});

// Activate event: Cleans up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});', // Explicitly cache index.html
  'manifest.json',
  'icon-192x192.PNG',
  'icon-512x512.PNG',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css' // The external stylesheet
  // Note: The service worker will also cache the font files (.woff2) that the above CSS requests during the first online visit.
];

// Install event: Caches the core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching core assets');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Fetch event: Serves cached content when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    // 1. Try to find the request in the cache
    caches.match(event.request)
      .then(cachedResponse => {
        // 2. If it's in the cache, return it.
        //    Otherwise, fetch it from the network.
        return cachedResponse || fetch(event.request).then(networkResponse => {
          // Optional: Cache the newly fetched resource for future offline use
          // This is useful for assets not in the initial cache list (like fonts)
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
      .catch(() => {
        // If both cache and network fail (e.g., offline and not cached)
        // you could return a fallback page here if you had one.
      })
  );
});

// Activate event: Cleans up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
