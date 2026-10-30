const CACHE_NAME = "turnforge-shell-v3";

const FILES = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/algorithms.js",
  "/algorithms.json",
  "/manifest.json"
];

// INSTALL
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // API requests must not be cached.
  if (url.pathname.startsWith("/api/")) return;

  // Use cached application files offline.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, copy));
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);

        if (cached) return cached;

        if (request.mode === "navigate") {
          return caches.match("/index.html");
        }

        return new Response("Offline", {
          status: 503,
          headers: {
            "Content-Type": "text/plain"
          }
        });
      })
  );
});
