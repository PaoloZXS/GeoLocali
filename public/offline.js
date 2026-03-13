// offline.js - Offline detection and UI indicators
import db from "./db.js";

let isOnline = navigator.onLine;
let syncInProgress = false;
let pendingSyncCount = 0;

const STATUS_ELEMENT_ID = "offline-status-bar";
const SYNC_INDICATOR_ID = "sync-indicator";

/**
 * Initialize offline detection
 */
export function initOfflineDetection() {
  // Set initial online state
  updateOnlineStatus(navigator.onLine);

  // Listen to online/offline events
  window.addEventListener("online", () => {
    console.log("✓ Connection restored");
    updateOnlineStatus(true);
    triggerBackgroundSync();
  });

  window.addEventListener("offline", () => {
    console.log("✗ Connection lost");
    updateOnlineStatus(false);
  });

  // Listen for Service Worker messages
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.controller?.addEventListener("message", (event) => {
      if (event.data?.type === "SYNC_IN_PROGRESS") {
        showSyncIndicator(true);
      } else if (event.data?.type === "SYNC_COMPLETE") {
        showSyncIndicator(false);
        updatePendingSyncBadge();
      }
    });
  }

  // Update pending sync count on init
  updatePendingSyncBadge();

  console.log("[Offline] Detection initialized, online:", isOnline);
}

/**
 * Update online status and UI
 */
function updateOnlineStatus(online) {
  isOnline = online;

  if (online) {
    hideBanner();
    showNotification("✓ Sei online", "success");
  } else {
    showBanner();
    showNotification(
      "✗ Sei offline - I dati verranno sincronizzati quando sei online",
      "warning"
    );
  }

  // Dispatch custom event for app-wide awareness
  window.dispatchEvent(
    new CustomEvent("online-status-changed", { detail: { isOnline } })
  );
}

/**
 * Show offline banner at top of page
 */
function showBanner() {
  let banner = document.getElementById(STATUS_ELEMENT_ID);

  if (!banner) {
    banner = document.createElement("div");
    banner.id = STATUS_ELEMENT_ID;
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(90deg, #ff9800 0%, #f57c00 100%);
      color: white;
      padding: 8px 16px;
      text-align: center;
      font-weight: 500;
      font-size: 14px;
      z-index: 9998;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    banner.innerHTML = `
      <span class="material-symbols-outlined" style="font-size: 20px;">cloud_off</span>
      <span>Sei offline - I dati verranno sincronizzati automaticamente</span>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
  }

  banner.style.display = "flex";

  // Adjust body margin if header exists
  const header = document.querySelector(".header");
  if (header) {
    header.style.marginTop = "48px";
  }
}

/**
 * Hide offline banner
 */
function hideBanner() {
  const banner = document.getElementById(STATUS_ELEMENT_ID);
  if (banner) {
    banner.style.display = "none";
    const header = document.querySelector(".header");
    if (header) {
      header.style.marginTop = "0";
    }
  }
}

/**
 * Show sync indicator
 */
function showSyncIndicator(show = true) {
  let indicator = document.getElementById(SYNC_INDICATOR_ID);

  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = SYNC_INDICATOR_ID;
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #2196F3;
      color: white;
      padding: 12px 20px;
      border-radius: 24px;
      font-size: 14px;
      z-index: 9999;
      display: none;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease-out;
    `;

    // Add animation styles
    if (!document.querySelector("style[data-sync-animation]")) {
      const style = document.createElement("style");
      style.setAttribute("data-sync-animation", "true");
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .sync-spinner {
          animation: spin 1s linear infinite;
        }
      `;
      document.head.appendChild(style);
    }

    indicator.innerHTML = `
      <span class="material-symbols-outlined sync-spinner" style="font-size: 20px;">sync</span>
      <span id="sync-text">Sincronizzazione in corso...</span>
    `;
    document.body.appendChild(indicator);
  }

  if (show) {
    indicator.style.display = "flex";
  } else {
    indicator.style.display = "none";
  }
}

/**
 * Show notification
 */
function showNotification(message, type = "info") {
  let notificationContainer = document.getElementById(
    "app-notification-container"
  );

  if (!notificationContainer) {
    notificationContainer = document.createElement("div");
    notificationContainer.id = "app-notification-container";
    notificationContainer.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      z-index: 10000;
      max-width: 400px;
    `;
    document.body.appendChild(notificationContainer);
  }

  const notification = document.createElement("div");
  const bgColor =
    {
      success: "#4caf50",
      warning: "#ff9800",
      error: "#f44336",
      info: "#2196F3"
    }[type] || "#2196F3";

  notification.style.cssText = `
    background: ${bgColor};
    color: white;
    padding: 12px 16px;
    border-radius: 4px;
    margin-bottom: 8px;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    animation: fadeInOut 3s ease-in-out;
  `;
  notification.textContent = message;
  notificationContainer.appendChild(notification);

  // Add fade animation if not exists
  if (!document.querySelector("style[data-notification-animation]")) {
    const style = document.createElement("style");
    style.setAttribute("data-notification-animation", "true");
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // Remove after animation
  setTimeout(() => notification.remove(), 3000);
}

/**
 * Update pending sync badge
 */
export async function updatePendingSyncBadge() {
  try {
    const pendingOps = await db.getPendingSyncOps();
    pendingSyncCount = pendingOps.length;

    const badge = document.getElementById("sync-badge");
    if (badge) {
      if (pendingSyncCount > 0) {
        badge.textContent = pendingSyncCount;
        badge.style.display = "inline-block";
      } else {
        badge.style.display = "none";
      }
    }

    // Log sync queue status
    if (pendingSyncCount > 0) {
      console.log(`[Offline] ${pendingSyncCount} operations pending sync`);
    }
  } catch (error) {
    console.error("[Offline] Error updating sync badge:", error);
  }
}

/**
 * Trigger background sync
 */
async function triggerBackgroundSync() {
  if (syncInProgress) {
    console.log("[Offline] Sync already in progress");
    return;
  }

  syncInProgress = true;
  showSyncIndicator(true);

  try {
    // If Service Worker supports Background Sync API
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.sync
          .register("sync-queue")
          .then(() => console.log("[Offline] Background sync registered"))
          .catch((err) =>
            console.warn(
              "[Offline] Background sync not available:",
              err.message
            )
          );
      });
    }

    // Fallback: Manual sync via Service Worker message
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          if (event.data?.type === "SYNC_RESULT") {
            console.log("[Offline] Manual sync result:", event.data);
            resolve(event.data);
          }
        };

        navigator.serviceWorker.controller.postMessage({ type: "SYNC_NOW" }, [
          messageChannel.port2
        ]);

        // Timeout after 30 seconds
        setTimeout(resolve, 30000);
      });
    }

    syncInProgress = false;
    showSyncIndicator(false);
    updatePendingSyncBadge();
    showNotification("✓ Sincronizzazione completata", "success");
  } catch (error) {
    console.error("[Offline] Sync error:", error);
    syncInProgress = false;
    showSyncIndicator(false);
    showNotification("✗ Errore durante la sincronizzazione", "error");
  }
}

/**
 * Check if online
 */
export function getOnlineStatus() {
  return isOnline;
}

/**
 * Force sync (for manual testing)
 */
export async function forceSyncNow() {
  console.log("[Offline] Forcing sync...");
  await triggerBackgroundSync();
}

/**
 * Get sync stats
 */
export async function getSyncStats() {
  try {
    const dbStats = await db.getDBStats();
    const pendingOps = await db.getPendingSyncOps();

    return {
      online: isOnline,
      syncInProgress,
      pendingSyncCount: pendingOps.length,
      dbStats
    };
  } catch (error) {
    console.error("[Offline] Error getting sync stats:", error);
    return {
      online: isOnline,
      syncInProgress,
      pendingSyncCount: 0,
      error: error.message
    };
  }
}

/**
 * Make API calls with offline fallback
 */
export async function apiFetchWithOfflineSupport(url, options = {}) {
  const { method = "GET", body = null, fallbackToCache = true } = options;

  try {
    // Try network request
    const response = await fetch(url, {
      ...options,
      method,
      body,
      headers: {
        ...options.headers,
        // Add Authorization header from localStorage if available
        ...(localStorage.getItem("authToken") && {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`
        })
      }
    });

    if (!response.ok && !isOnline) {
      throw new Error("Network offline");
    }

    return response;
  } catch (error) {
    console.log("[Offline] Network error:", error.message);

    if (isOnline) {
      // We're online but request failed - this is a real error
      throw error;
    }

    // We're offline - try cache or queue for sync
    if (method !== "GET") {
      // Queue mutation for sync
      const syncOp = {
        url,
        method,
        body,
        timestamp: Date.now()
      };

      const opId = await db.addPendingSync(syncOp);
      updatePendingSyncBadge();

      return new Response(
        JSON.stringify({
          offline: true,
          queued: true,
          message: "Richiesta in coda. Verrà inviata quando sarai online.",
          queueId: opId
        }),
        {
          status: 202,
          statusText: "Queued",
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Try service worker cache
    if ("caches" in window && fallbackToCache) {
      const cached = await caches.match(url);
      if (cached) {
        console.log("[Offline] Using cached response for:", url);
        return cached;
      }
    }

    // No fallback available
    throw new Error("Offline and no cached data available");
  }
}

export default {
  initOfflineDetection,
  updatePendingSyncBadge,
  getOnlineStatus,
  forceSyncNow,
  getSyncStats,
  apiFetchWithOfflineSupport
};
};
