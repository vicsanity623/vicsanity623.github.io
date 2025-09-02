// A unique name for the cache, with a version number.
// Change the version number when you update the app's core files.
const CACHE_NAME = 'miniwow-cache-v0.0.1';

// A list of all the files that make up the "app shell".
// This is the minimum needed for the app to load and run offline.
const URLS_TO_CACHE = [
  './', // This caches the root URL (your index.html)
  './manifest.json',
  './wow.html',
  './V2.html'
  // NOTE: Chart.js is loaded from a CDN and will not be cached for offline use by default.
  // The app will function offline, but the chart will not render without an internet connection.
];

// Install Event: Caches the app shell upon installation.
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell...');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => {
        console.log('Service Worker: Installation complete.');
        // Force the waiting service worker to become the active service worker.
        return self.skipWaiting();
      })
  );
});

// Activate Event: Cleans up old caches.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // If a cache's name is different from the current CACHE_NAME, delete it.
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        // Tell the active service worker to take control of the page immediately.
        return self.clients.claim();
    })
  );
});

// Fetch Event: Serves cached content when offline.
self.addEventListener('fetch', (event) => {
  // We only want to handle GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    // 1. Try to find a match in the cache.
    caches.match(event.request)
      .then((response) => {
        // 2. If a cached response is found, return it.
        if (response) {
          // console.log('Service Worker: Serving from cache:', event.request.url);
          return response;
        }
        // 3. If not in cache, fetch from the network.
        // console.log('Service Worker: Fetching from network:', event.request.url);
        return fetch(event.request);
      })
      .catch((error) => {
        // Handle network errors, e.g., by returning a fallback offline page.
        // For this app, we'll just let the browser's default error show.
        console.error('Service Worker: Fetch failed:', error);
      })
  );
});
