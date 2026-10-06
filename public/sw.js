/* Life Hub service worker — offline shell + runtime caching.
   Strategy:
   - App shell (HTML navigations): network-first, fallback to offline page
   - Static assets (_next/static, fonts, icons): cache-first (immutable)
   - API calls: network-only (private couple data — never cached on disk)
*/
const VERSION = "v1";
const STATIC_CACHE = `lh-static-${VERSION}`;
const PAGES_CACHE = `lh-pages-${VERSION}`;

const PRECACHE = [
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith("lh-") || (!k.includes(VERSION) && k !== PAGES_CACHE && k !== STATIC_CACHE)).map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // never cache private API data
  if (url.pathname.startsWith("/api/")) return;

  // static assets: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // page navigations: network-first → cache → offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGES_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/offline.html"))),
    );
  }
});
