// db.js - IndexedDB wrapper for offline-first data persistence
const DB_NAME = 'locali_app_db';
const DB_VERSION = 1;

const STORES = {
  LOCATIONS: 'locations',
  PHOTOS: 'photos',
  PENDING_SYNC: 'pending_sync',
  USER_PREFERENCES: 'user_preferences',
};

let db = null;

/**
 * Initialize IndexedDB
 */
export async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[DB] Error opening database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('[DB] Database initialized');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Locations store
      if (!database.objectStoreNames.contains(STORES.LOCATIONS)) {
        const locStore = database.createObjectStore(STORES.LOCATIONS, { keyPath: 'id' });
        locStore.createIndex('timestamp', 'timestamp', { unique: false });
        locStore.createIndex('synced', 'synced', { unique: false });
        console.log('[DB] Created locations store');
      }

      // Photos store
      if (!database.objectStoreNames.contains(STORES.PHOTOS)) {
        const photoStore = database.createObjectStore(STORES.PHOTOS, { keyPath: 'id' });
        photoStore.createIndex('locale_id', 'locale_id', { unique: false });
        photoStore.createIndex('synced', 'synced', { unique: false });
        console.log('[DB] Created photos store');
      }

      // Pending sync operations
      if (!database.objectStoreNames.contains(STORES.PENDING_SYNC)) {
        const syncStore = database.createObjectStore(STORES.PENDING_SYNC, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('status', 'status', { unique: false });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[DB] Created pending_sync store');
      }

      // User preferences
      if (!database.objectStoreNames.contains(STORES.USER_PREFERENCES)) {
        database.createObjectStore(STORES.USER_PREFERENCES, { keyPath: 'key' });
        console.log('[DB] Created user_preferences store');
      }
    };
  });
}

/**
 * Add or update a location
 */
export async function saveLocation(location) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.LOCATIONS], 'readwrite');
    const store = transaction.objectStore(STORES.LOCATIONS);
    const data = {
      ...location,
      timestamp: location.timestamp || Date.now(),
      synced: location.synced || false,
    };
    const request = store.put(data);

    request.onsuccess = () => {
      console.log('[DB] Location saved:', data.id);
      resolve(data);
    };

    request.onerror = () => {
      console.error('[DB] Error saving location:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Get all locations (local cache)
 */
export async function getLocations(syncedOnly = false) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.LOCATIONS], 'readonly');
    const store = transaction.objectStore(STORES.LOCATIONS);

    let request;
    if (syncedOnly) {
      const index = store.index('synced');
      request = index.getAll(true);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      console.log('[DB] Retrieved', request.result.length, 'locations');
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('[DB] Error getting locations:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Get a single location by ID
 */
export async function getLocation(id) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.LOCATIONS], 'readonly');
    const store = transaction.objectStore(STORES.LOCATIONS);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Save a photo
 */
export async function savePhoto(photo) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PHOTOS], 'readwrite');
    const store = transaction.objectStore(STORES.PHOTOS);
    const data = {
      ...photo,
      timestamp: photo.timestamp || Date.now(),
      synced: photo.synced || false,
    };
    const request = store.put(data);

    request.onsuccess = () => {
      console.log('[DB] Photo saved:', data.id);
      resolve(data);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Get photos for a location
 */
export async function getPhotosByLocale(localeId) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PHOTOS], 'readonly');
    const store = transaction.objectStore(STORES.PHOTOS);
    const index = store.index('locale_id');
    const request = index.getAll(localeId);

    request.onsuccess = () => {
      console.log('[DB] Retrieved', request.result.length, 'photos for locale', localeId);
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Delete a photo
 */
export async function deletePhoto(photoId) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PHOTOS], 'readwrite');
    const store = transaction.objectStore(STORES.PHOTOS);
    const request = store.delete(photoId);

    request.onsuccess = () => {
      console.log('[DB] Photo deleted:', photoId);
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Add pending sync operation
 */
export async function addPendingSync(operation) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PENDING_SYNC], 'readwrite');
    const store = transaction.objectStore(STORES.PENDING_SYNC);
    const data = {
      ...operation,
      timestamp: operation.timestamp || Date.now(),
      status: 'pending',
      retries: 0,
    };
    const request = store.add(data);

    request.onsuccess = () => {
      console.log('[DB] Sync operation queued:', request.result);
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('[DB] Error queueing sync:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Get all pending sync operations
 */
export async function getPendingSyncOps() {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PENDING_SYNC], 'readonly');
    const store = transaction.objectStore(STORES.PENDING_SYNC);
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      console.log('[DB] Retrieved', request.result.length, 'pending sync operations');
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Update sync operation status
 */
export async function updateSyncOpStatus(id, status, result = null) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PENDING_SYNC], 'readwrite');
    const store = transaction.objectStore(STORES.PENDING_SYNC);
    
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const operation = getRequest.result;
      operation.status = status;
      operation.result = result;
      operation.syncedAt = Date.now();

      const updateRequest = store.put(operation);
      updateRequest.onsuccess = () => {
        console.log('[DB] Sync operation', id, 'marked as', status);
        resolve(operation);
      };
      updateRequest.onerror = () => reject(updateRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Mark location as synced
 */
export async function markLocationAsSynced(localeId) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.LOCATIONS], 'readwrite');
    const store = transaction.objectStore(STORES.LOCATIONS);
    
    const getRequest = store.get(localeId);
    getRequest.onsuccess = () => {
      const location = getRequest.result;
      if (location) {
        location.synced = true;
        const updateRequest = store.put(location);
        updateRequest.onsuccess = () => resolve(location);
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve(null);
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Clear all data (for logout)
 */
export async function clearAllData() {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [STORES.LOCATIONS, STORES.PHOTOS, STORES.PENDING_SYNC],
      'readwrite'
    );

    Object.values(STORES).forEach(storeName => {
      try {
        transaction.objectStore(storeName).clear();
      } catch (e) {
        // Store might not exist, that's ok
      }
    });

    transaction.oncomplete = () => {
      console.log('[DB] All data cleared');
      resolve();
    };

    transaction.onerror = () => {
      console.error('[DB] Error clearing data:', transaction.error);
      reject(transaction.error);
    };
  });
}

/**
 * Get database stats
 */
export async function getDBStats() {
  const database = await initDB();
  const stats = {};

  for (const storeName of Object.values(STORES)) {
    try {
      const transaction = database.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const countRequest = store.count();

      await new Promise((resolve) => {
        countRequest.onsuccess = () => {
          stats[storeName] = countRequest.result;
          resolve();
        };
        countRequest.onerror = () => {
          stats[storeName] = 0;
          resolve();
        };
      });
    } catch (e) {
      stats[storeName] = 0;
    }
  }

  console.log('[DB] Database stats:', stats);
  return stats;
}

export default {
  initDB,
  saveLocation,
  getLocations,
  getLocation,
  savePhoto,
  getPhotosByLocale,
  deletePhoto,
  addPendingSync,
  getPendingSyncOps,
  updateSyncOpStatus,
  markLocationAsSynced,
  clearAllData,
  getDBStats,
};
