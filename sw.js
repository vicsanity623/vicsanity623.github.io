// A version number for your cache. Change this when you update files.
const CACHE_VERSION = 'v1.3';
const CACHE_NAME = `tap-guardian-cache-${CACHE_VERSION}`;

// A list of all the files your game needs to work offline.
const FILES_TO_CACHE = [
  './rpg.html',
  // Your JS files
  './Stats.js',
  './Combat.js',
  './Ui.js',
  './game.js',
  // Your image files
  './player.PNG',
  './egg.png',
  './player-192x192.PNG',
  './player-512x512.PNG',
  './player-maskable-512x512.PNG',
  // Your sound files
  './main.mp3',
  './battle.mp3',
  './expedition.mp3'
];

// The 'install' event is fired when the service worker is first installed.
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  // waitUntil() ensures the service worker doesn't install until the code inside has finished.
  event.waitUntil(
    // Open the cache.
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app shell');
        // Add all the files from our list to the cache.
        return cache.addAll(FILES_TO_CACHE);
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
  );
  return self.clients.claim();
});

// The 'fetch' event is fired for every network request the page makes.
self.addEventListener('fetch', (event) => {
  // We only want to handle GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  console.log('[ServiceWorker] Fetch', event.request.url);
  // respondWith() hijacks the request and lets us control the response.
  event.respondWith(
    // Check the cache for a response to this request.
    caches.match(event.request)
      .then((response) => {
        // If a response is found in the cache, return it.
        // Otherwise, fetch the resource from the network.
        return response || fetch(event.request);
      })
  );
});
