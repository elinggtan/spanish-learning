/* ============================================================
   ÁNDALE — Service Worker (task 4: PWA offline support)
   Cache-first for the app shell (index.html + manifest); the app itself
   uses localStorage for all learning data, so there is no API layer to
   worry about here — this SW's only job is "let the page load with no
   network".
   Fonts (fonts.googleapis.com / fonts.gstatic.com) use
   stale-while-revalidate: serve the cached version instantly if we have
   one, refresh it in the background, and if the network request fails
   (offline) we simply don't intercept — the browser's own CSS fallback
   chain ( -apple-system / Segoe UI / etc.) takes over silently.
   ============================================================ */

const CACHE_VERSION = "andale-v1";
const PRECACHE_URLS = ["./index.html", "./manifest.webmanifest"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith("andale-") && name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept non-GET

  const url = new URL(req.url);

  // ---- Fonts: stale-while-revalidate ----
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => null); // offline: no font update, no crash — CSS fallback handles it
        return cached || network || Response.error();
      })
    );
    return;
  }

  // ---- App shell (same-origin): cache-first ----
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return cached || Response.error();
        }
      })
    );
  }
  // everything else (cross-origin, non-font): let the browser handle it normally
});
