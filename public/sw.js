const CACHE = "geolocali-v2";
const ASSETS = [
  "/",
  "/admin/admin.html",
  "/admin/style.css",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  // Activate the new service worker immediately.
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    e.request.url.includes("/api/") || e.request.method !== "GET"
      ? fetch(e.request)
      : caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
