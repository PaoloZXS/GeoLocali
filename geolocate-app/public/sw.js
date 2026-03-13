// Service Worker v1.0 - Complete offline-first PWA
const CACHE_NAME = "locali-v2";
const API_CACHE_NAME = "locali-api-v2";
const NETWORK_TIMEOUT = 5000; // 5 seconds

// Assets to cache on install
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/default/default.html",
  "/admin/admin.html",
  "/insert/insert.html",
  "/login/login.html",
  "/register/register.html",
  "/default/style.css",
  "/admin/style.css",
  "/insert/style.css",
  "/login/style.css",
  "/register/style.css",
  "/manifest.json",
  "/icons/icon-192x192.svg",
  "/icons/icon-512x512.svg"
];

// External CDN resources (fonts, leaflet, etc)
const EXTERNAL_ASSETS = [
  "https://fonts.googleapis.com/css2?family=Rubik:wght@400&display=swap",
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

// API endpoints that should use network-first strategy
const API_ENDPOINTS = [
  "/api/",
  "/pending-users",
  "/approved-users",
  "/locations",
  "/session",
  "/photos",
  "/delete-photo",
  "/approve-user",
  "/reject-user",
  "/revoke-user"
];

// ===== SERVICE WORKER LIFECYCLE =====

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  event.waitUntil(
    (async () => {
      try {
        // Cache static assets
        const staticCache = await caches.open(CACHE_NAME);
        await staticCache.addAll(STATIC_ASSETS);
        console.log("[SW] Static assets cached");

        // Pre-cache external resources (don't fail if unavailable)
        const apiCache = await caches.open(API_CACHE_NAME);
        EXTERNAL_ASSETS.forEach((url) => {
          fetch(url)
            .then((response) => {
              if (response.ok) {
                apiCache.put(url, response.clone());
              }
            })
            .catch(() => console.log(`[SW] Could not cache ${url}`));
        });

        self.skipWaiting();
      } catch (error) {
        console.error("[SW] Install error:", error);
      }
    })()
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const cachesToDelete = cacheNames.filter(
        (name) => name !== CACHE_NAME && name !== API_CACHE_NAME
      );

      await Promise.all(
        cachesToDelete.map((name) => {
          console.log("[SW] Deleting old cache:", name);
          return caches.delete(name);
        })
      );

      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "SW_UPDATED" }));
      });

      return self.clients.claim();
    })()
  );
});

// ===== FETCH STRATEGY =====

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (we'll handle POST separately for offline data)
  if (request.method !== "GET") {
    // For POST/PUT/DELETE: try network, fallback to offline queue
    event.respondWith(handleNonGetRequest(request));
    return;
  }

  // For API calls: Network-first (try online, fallback to cache)
  if (isApiEndpoint(url.pathname)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // For external resources (fonts, CDN): Cache-first
  if (isExternalResource(url.href)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // For static assets: Stale-while-revalidate (quick response + background update)
  event.respondWith(staleWhileRevalidateStrategy(request));
});

// ===== CACHE STRATEGIES =====

async function networkFirstStrategy(request) {
  try {
    // Try network with timeout
    const networkResponse = await fetchWithTimeout(request, NETWORK_TIMEOUT);

    // Cache successful API responses
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // Fall back to cache
    console.log("[SW] Network failed, using cache for:", request.url);
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // If no cache and offline, queue for sync
    if (!navigator.onLine) {
      console.log("[SW] Offline - queueing sync for:", request.url);
      await queueForSync(request);
    }

    // Return offline response
    return new Response(
      JSON.stringify({
        offline: true,
        message: "Sei offline. Data verrà sincronizzato quando sei online.",
        url: request.url
      }),
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // If not in cache, try network
    const networkResponse = await fetchWithTimeout(request, NETWORK_TIMEOUT);
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log("[SW] Cache-first failed for:", request.url);
    return new Response("Risorsa non disponibile offline", { status: 503 });
  }
}

async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetchWithTimeout(request, NETWORK_TIMEOUT)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => {
      console.log("[SW] Background refresh failed for:", request.url);
      return cachedResponse || new Response("Offline", { status: 503 });
    });

  // Return cached response immediately, then update in background
  return cachedResponse || fetchPromise;
}

async function handleNonGetRequest(request) {
  try {
    // Try network first for mutations
    return await fetchWithTimeout(request, NETWORK_TIMEOUT);
  } catch (error) {
    console.log("[SW] POST/PUT/DELETE failed, queueing:", request.url);

    // Queue for sync if offline
    if (!navigator.onLine) {
      await queueForSync(request);
    }

    return new Response(
      JSON.stringify({
        offline: true,
        queued: true,
        message: "Richiesta in coda. Verrà inviata quando sarai online."
      }),
      {
        status: 202,
        statusText: "Queued",
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

// ===== UTILITIES =====

function fetchWithTimeout(request, timeout) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout")), timeout)
    )
  ]);
}

function isApiEndpoint(pathname) {
  return API_ENDPOINTS.some((endpoint) => pathname.includes(endpoint));
}

function isExternalResource(url) {
  return (
    url.includes("fonts.googleapis.com") ||
    url.includes("unpkg.com") ||
    url.includes("cdnjs.cloudflare.com")
  );
}

// ===== OFFLINE SYNC QUEUE =====

const DB_NAME = "locali_sync_db";
const QUEUE_STORE = "sync_queue";

async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, {
          keyPath: "id",
          autoIncrement: true
        });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };
  });
}

async function queueForSync(request) {
  try {
    const db = await initDB();
    const body = request.method !== "GET" ? await request.clone().text() : null;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([QUEUE_STORE], "readwrite");
      const store = transaction.objectStore(QUEUE_STORE);

      const queueItem = {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body,
        timestamp: Date.now(),
        status: "pending",
        retries: 0
      };

      const addRequest = store.add(queueItem);

      addRequest.onerror = () => {
        console.error("[SW] Queue error:", addRequest.error);
        reject(addRequest.error);
      };

      addRequest.onsuccess = () => {
        console.log("[SW] Queued request ID:", addRequest.result);
        resolve(addRequest.result);
      };

      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error("[SW] Could not queue request:", error);
  }
}

async function processSyncQueue() {
  try {
    const db = await initDB();
    let processed = 0;
    let failed = 0;

    return new Promise((resolve) => {
      const transaction = db.transaction([QUEUE_STORE], "readwrite");
      const store = transaction.objectStore(QUEUE_STORE);
      const index = store.index("status");
      const range = IDBKeyRange.only("pending");

      const getAllRequest = index.getAll(range);

      getAllRequest.onsuccess = async () => {
        const items = getAllRequest.result;
        console.log("[SW] Processing", items.length, "queued requests");

        for (const item of items) {
          try {
            const response = await fetch(item.url, {
              method: item.method,
              headers: item.headers,
              body: item.body ? item.body : undefined
            });

            if (response.ok) {
              // Mark as synced
              item.status = "synced";
              item.syncedAt = Date.now();
              const updateRequest = store.put(item);

              updateRequest.onsuccess = () => {
                processed++;
                console.log("[SW] Synced:", item.url);
              };
            } else {
              failed++;
              item.retries = (item.retries || 0) + 1;
              if (item.retries < 3) {
                item.status = "pending";
              } else {
                item.status = "failed";
              }
              store.put(item);
            }
          } catch (error) {
            console.error("[SW] Sync error for", item.url, ":", error);
            failed++;
            item.retries = (item.retries || 0) + 1;
            item.status = item.retries < 3 ? "pending" : "failed";
            store.put(item);
          }
        }

        transaction.oncomplete = () => {
          console.log(
            "[SW] Sync complete:",
            processed,
            "synced,",
            failed,
            "failed"
          );
          resolve({ processed, failed });
        };
      };

      transaction.onerror = () => {
        console.error("[SW] Transaction error:", transaction.error);
        resolve({ processed: 0, failed: 0 });
      };
    });
  } catch (error) {
    console.error("[SW] Sync queue error:", error);
  }
}

// ===== BACKGROUND SYNC =====

self.addEventListener("sync", (event) => {
  console.log("[SW] Background sync triggered:", event.tag);

  if (event.tag === "sync-queue") {
    event.waitUntil(processSyncQueue());
  }
});

// Listen for online event
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "SYNC_NOW") {
    processSyncQueue().then((result) => {
      event.ports[0].postMessage({ type: "SYNC_RESULT", ...result });
    });
  }
});

// Periodic sync (if supported)
if ("periodicSync" in self.registration) {
  self.addEventListener("periodicsync", (event) => {
    if (event.tag === "sync-queue") {
      event.waitUntil(processSyncQueue());
    }
  });
}

console.log("[SW] Service Worker loaded");
