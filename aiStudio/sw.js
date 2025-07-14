const CACHE_NAME = 'ollama-chat-cache-v1.0.0'; // Increment version on major changes to force update
const urlsToCache = [
  'index.html',
  'manifest.json',
  'sw.js',
  // You'll need to create this folder and icons
  'icon-192x192.png',
  'icon-512x512.png'
  // Add any other static assets you want to cache for offline use
  // e.g., 'styles.css', 'script.js', 'images/background.jpg', etc.
  // For this self-contained HTML file, most assets are in the HTML itself.
];

// Install event: Caching static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Service Worker: Failed to cache on install', error);
      })
  );
});

// Activate event: Cleaning up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event: Serving cached content or fetching from network
self.addEventListener('fetch', event => {
  // Always try to fetch from network first, then fall back to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If successful, cache the new response and return it
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // If network fails, try to serve from cache
        console.log('Service Worker: Network request failed, serving from cache:', event.request.url);
        return caches.match(event.request);
      })
  );

  // Special handling for Ollama API requests: Do NOT cache API calls
  // This ensures the chat interacts directly with the live Ollama server
  if (event.request.url.startsWith('http://localhost:11434/api/')) {
    return; // Don't intercept or cache Ollama API calls
  }
});

// Message event: Optional, for communication between page and service worker
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
