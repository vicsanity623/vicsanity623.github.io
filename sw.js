// A version number for your cache. Change this when you update files.
const CACHE_VERSION = 'v1.0.4'; // Use a new version number
const CACHE_NAME = `tap-guardian-cache-${CACHE_VERSION}`;

// A list of the essential files your game needs to work.
// ONLY list files that actually exist in your project right now.
const FILES_TO_CACHE = [
  '/', // Caches the root of your site
  './rpg.html',
  './game.js',
  // Add 'rift.js' and other files here ONLY when they are created and uploaded.
  './player.PNG',
  './clouds.PNG',
  './egg.png',
  './main.mp3',
  './battle.mp3',
  './expedition.mp3'
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
        // This forces the waiting service worker to become the active service worker.
        console.log('[ServiceWorker] Skip waiting on install');
        return self.skipWaiting();
      })
  );
});

// The 'activate' event is fired when the service worker is activated.
// This is a good place to clean up old caches.
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        // If a cache's name is not our current cache name, delete it.
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
    .then(() => {
        // This tells the service worker to take control of the page immediately.
        console.log('[ServiceWorker] Claiming clients');
        return self.clients.claim();
    })
  );
});

// The 'fetch' event is fired for every network request the page makes.
self.addEventListener('fetch', (event) => {
  // We only want to handle GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    // Cache-first strategy: Check the cache for a response to this request.
    caches.match(event.request)
      .then((response) => {
        // If a response is found in the cache, return it.
        // Otherwise, fetch the resource from the network.
        return response || fetch(event.request);
      })
  );
});
