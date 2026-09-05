// Offline support, so the game still plays on a tablet with no signal.
//
// The caching strategy is split deliberately:
//
//   - Navigations (the HTML) go to the network first. Vite fingerprints every
//     asset filename, so the HTML is the one file whose URL never changes. If
//     it were served cache-first, a deployed update would never reach anyone
//     already running the game - they would be frozen on whatever version they
//     first loaded, which is the classic way a PWA strands its users.
//   - Everything else is cache-first, because a fingerprinted URL's contents
//     can never change.
const CACHE = 'roxy-run-v3';

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready rather than waiting for every
  // tab to close - children never close tabs.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('./')));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) void store(request, response.clone());
    return response;
  } catch {
    // Offline: the cached page is better than an error page.
    const hit = await caches.match(request);
    return hit ?? (await caches.match('./')) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') void store(request, response.clone());
    return response;
  } catch {
    return (await caches.match('./')) ?? Response.error();
  }
}

async function store(request, response) {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  } catch {
    // A full or unavailable cache must never break the page.
  }
}
