/* Pulse Arena service worker.
 *
 * The game is one self-contained HTML file with no network calls during play, so "offline
 * support" only means holding onto that file and its icons. The strategy is deliberately
 * network-first for the page itself: a cache-first game would keep serving a stale build
 * after a deploy, and players would have no way to know they were behind. The cache is the
 * fallback when the network is genuinely unavailable, not the default source of truth.
 *
 * Bump CACHE_VERSION on every release — the activate handler deletes every other cache, so
 * a version bump is what actually evicts the old build.
 */
const CACHE_VERSION = 'pulse-arena-v3';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // one bad URL would reject addAll and abort the whole install, leaving no cache at all,
      // so each entry is allowed to fail on its own
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // leave cross-origin requests alone entirely — the game makes none, and proxying them
  // through here would only add a failure mode
  if (url.origin !== self.location.origin) return;
  // Analytics is same-origin only because it is reverse-proxied, so it would otherwise land
  // in the cache. Serving a stale analytics library helps nobody, and worse, the offline
  // fallback below would answer a failed beacon with the app shell — handing a 200 of HTML
  // to something expecting a script. Let these through to the network untouched.
  if (url.pathname.startsWith('/ingest') || url.pathname.startsWith('/_vercel')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // opaque/error responses are not worth caching over a known-good copy
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
