/* AP Repair CRM Service Worker
   - Caches the app shell for instant load
   - Network-first for Turso API calls (always fresh data)
   - Falls back to cache if offline */
const CACHE = "ap-crm-v9";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => null)));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Turso API: network first, no cache
  if (url.hostname.includes("turso.io") || url.pathname.includes("/v2/")) {
    return; // default network
  }
  // App shell: cache first, fallback network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp.ok && (e.request.method === "GET")) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => null);
        }
        return resp;
      }).catch(() => cached);
    })
  );
});

self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});
