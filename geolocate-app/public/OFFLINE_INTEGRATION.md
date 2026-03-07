# PWA Offline Support - Integration Guide

## Overview

La PWA ora include supporto completo per offline con:
- ✅ Caching automatico degli asset  
- ✅ Operazioni offline in coda (IndexedDB)
- ✅ Background sync automatico al reconnect
- ✅ UI indicators per lo stato online/offline

## Moduli Disponibili

### 1. `db.js` - IndexedDB Data Persistence
Gestisce lo storage offline:

```javascript
import db from './db.js';

// Salvare una location offline
const location = {
  id: 'loc-123',
  name: 'Locale test',
  type: 'bar',
  lat: 45.5,
  lon: 12.3,
  address: 'Via Roma 1',
};
await db.saveLocation(location);

// Recuperare locations offline (tutte)
const allLocations = await db.getLocations();

// Recuperare locations offline (solo sincronizzate)
const syncedLocations = await db.getLocations(true);

// Salvare una foto offline
const photo = {
  id: 'photo-456',
  locale_id: 'loc-123',
  url: 'data:image/jpeg;base64,...',
  dropbox_path: '/photos/photo-456.jpg',
};
await db.savePhoto(photo);

// Recuperare foto di una location
const photos = await db.getPhotosByLocale('loc-123');

// Eliminare una foto
await db.deletePhoto('photo-456');

// Statistiche database
const stats = await db.getDBStats();
// Output: { locations: 5, photos: 12, pending_sync: 2, ... }
```

### 2. `offline.js` - Offline Detection & UI

Rileva cambiamenti online/offline e mostra UI indicators:

```javascript
import { initOfflineDetection, getOnlineStatus, updatePendingSyncBadge, forceSyncNow } from './offline.js';

// Initializzare al caricamento pagina
window.addEventListener('load', () => {
  initOfflineDetection();
});

// Verificare stato connessione
const isOnline = getOnlineStatus(); // true/false

// Updatare badge con operazioni in coda
await updatePendingSyncBadge(); // Mostra "3 in coda" se ci sono 3 operazioni

// Forzare sync manualmente
await forceSyncNow(); // Sincronizza tutte le operazioni in coda

// Ascoltare cambamenti di connessione
window.addEventListener('online-status-changed', (event) => {
  if (event.detail.isOnline) {
    console.log('✓ Back online');
  } else {
    console.log('✗ Offline');
  }
});
```

### 3. `api-wrapper.js` - API Calls with Offline Queue

Wrapper per le API che automaticamente mette in coda offline:

```javascript
import { apiFetch, api } from './api-wrapper.js';

// GET - Network first con cache fallback
const response = await apiFetch('/api/locations');
const locations = await response.json();

// POST - Automaticamente in coda se offline
const response = await apiFetch('/api/locations', {
  method: 'POST',
  body: {
    name: 'Locale ',
    type: 'restaurant',
    lat: 45.5,
    lon: 12.3,
  },
});

// Usare le funzioni helper di alto livello
const locations = await api.getLocations();
const newLocale = await api.createLocation({ name: 'Bar', type: 'bar', ... });
const photos = await api.getPhotos('locale-id');
await api.uploadPhoto('locale-id', fileObject);
await api.deletePhoto('photo-id');
```

## Integrazione nelle Pagine HTML

### Step 1: Importare i moduli
```html
<script type="module">
  import { initOfflineDetection } from './offline.js';
  import { api } from './api-wrapper.js';
  
  // Inizializzare offline detection
  window.addEventListener('load', () => {
    initOfflineDetection();
  });
</script>
```

### Step 2: Usare le API con offline support
```javascript
// Caricare locations
async function loadLocations() {
  try {
    const locations = await api.getLocations();
    renderLocations(locations);
  } catch (error) {
    console.error('Error loading locations:', error);
  }
}

// Aggiungere una location (funziona offline)
async function addNewLocation(formData) {
  try {
    const result = await api.createLocation(formData);
    
    // Se offline, la richiesta è in coda
    if (result.offline && result.queued) {
      showNotification('✓ Location salvata localmente. Sarà sincronizzata online.');
    } else {
      showNotification('✓ Location creata online!');
    }
  } catch (error) {
    showNotification('✗ Errore: ' + error.message, 'error');
  }
}

// Eliminare una foto (funziona offline)
async function deletePhotoOffline(photoId) {
  try {
    await api.deletePhoto(photoId);
    showNotification('✓ Foto elimina');
  } catch (error) {
    // In offline era già stata messa in coda
    showNotification('✗ Errore: ' + error.message);
  }
}
```

### Step 3: Aggiungere badge "In coda"
```html
<!-- Nel header o admin panel -->
<button id="syncBtn">
  Sincronizza
  <span id="sync-badge" style="display:none; background:#d32f2f; color:white; border-radius:50%; padding:2px 6px; font-size:0.8em; margin-left:4px;">0</span>
</button>

<script type="module">
  import { forceSyncNow, updatePendingSyncBadge } from './offline.js';
  
  // Update badge on init
  updatePendingSyncBadge();
  
  // Sync button handler
  document.getElementById('syncBtn').addEventListener('click', async () => {
    await forceSyncNow();
    await updatePendingSyncBadge();
  });
</script>
```

## Flusso Offline Completo

### Scenario: Utente aggiunge location mentre offline

1. **User è online, caricare pagina**
   - Service Worker cache gli asset
   - IndexedDB sincronizzato con server

2. **Connection persa (va offline)**
   - Banner "Offline" appare in alto
   - Form rimane funzionante

3. **Utente compila e invia form offline**
   - POST viene intercettato
   - Operazione salvata in IndexedDB con status `pending`
   - Badge "1 in coda" appare
   - Notifica: "Verrà sincronizzato quando sei online"

4. **Connection ripristinata (torna online)**
   - Event `online` triggerato
   - Banner "Offline" scompare
   - Background Sync inzia automaticamente
   - Service Worker processa coda da IndexedDB
   - Toglie di coda quando sync completato
   - Notifica: "✓ Sincronizzazione completata"

### Endpoint Server: `/api/sync`

Il server espone un endpoint per processare le operazioni offline:

```
POST /api/sync
Content-Type: application/json
Authorization: Bearer <token>

{
  "operations": [
    {
      "id": 1,
      "url": "/api/locations",
      "method": "POST",
      "body": {
        "name": "Locale",
        "type": "bar",
        "lat": 45.5,
        "lon": 12.3
      },
      "timestamp": 1700000000000
    },
    {
      "id": 2,
      "url": "/api/delete-photo",
      "method": "POST",
      "body": {
        "photo_id": "photo-123"
      },
      "timestamp": 1700000001000
    }
  ]
}

Response:
{
  "success": true,
  "processed": 2,
  "successCount": 2,
  "failureCount": 0,
  "results": [
    {
      "id": 1,
      "success": true,
      "result": {
        "message": "Location created",
        "changes": 1
      }
    },
    {
      "id": 2,
      "success": true,
      "result": {
        "message": "Photo deleted"
      }
    }
  ]
}
```

## Debugging

### Verificare se Service Worker è registrato
```javascript
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Service Workers:', regs);
});
```

### Monitorare IndexedDB
```javascript
// In DevTools Console
indexedDB.databases().then(dbs => {
  console.log('IndexedDB Databases:', dbs);
});
```

### Controllare cache
```javascript
caches.keys().then(names => {
  console.log('Cache names:', names);
  names.forEach(name => {
    caches.open(name).then(cache => {
      cache.keys().then(requests => {
        console.log(`Cache '${name}':`, requests.map(r => r.url));
      });
    });
  });
});
```

### Monitorare operazioni offline
```javascript
// In DevTools Console
import db from './db.js';

// Vedere operazioni in coda
db.getPendingSyncOps().then(ops => {
  console.log('Pending operations:', ops);
});

// Vedere stats database
db.getDBStats().then(stats => {
  console.log('DB Stats:', stats);
});
```

## Supporto Browser

- ✅ Chrome/Edge 40+
- ✅ Firefox 44+
- ✅ Safari 11.1+
- ✅ Opera 27+
- ❌ Internet Explorer (non supportato)

### Feature Availability:
- Service Worker: Tutti i browser moderni
- IndexedDB: Tutti i browser moderni
- Background Sync API: Chrome, Edge (non in Safari)
- Fallback: Sync manuale via SW message per browser senza Background Sync

## Troubleshooting

### Service Worker non si registra
- Verificare che il file `sw.js` sia accessibile su `/sw.js`
- Controllare che il HTTPS sia abilitato (o localhost per sviluppo)
- Verificare la console per errori di sintassi

### IndexedDB non funziona
- Verificare che il browser supporti IndexedDB
- Controllare le quote di storage (solitamente 50MB+)
- Disabilitare browe's private mode

### Operazioni non vengono sincronizzate
- Verificare che l'utente sia autenticato (token in localStorage)
- Controllare la console per errori di rete
- Verifica che il server abbia endpoint `/api/sync`

## Best Practices

1. **Sempre initializzare offline detection**
   ```javascript
   window.addEventListener('load', () => initOfflineDetection());
   ```

2. **Fornire feedback UI per operazioni offline**
   ```javascript
   const result = await api.createLocation(data);
   if (result.offline && result.queued) {
     showBanner('Salvato localmente, sincronizzazione in corso...');
   }
   ```

3. **Permettere agli utenti di controllare la sincronizzazione**
   ```javascript
   // Bottone "Sincronizza ora" nell'UI
   syncNowBtn.addEventListener('click', () => forceSyncNow());
   ```

4. **Gestire conflitti durante sync**
   - Il server usa "last-write-wins" per semplicitànb
   - Per merging complesso, aggiungere un `version` field nelle locations

5. **Pulire vecchie operazioni**
   - Operazioni più vecchie di 7 giorni vengono scartate dal sync
   - Utenti con operazioni non sincronizzate dovrebbero sincronizzare entro 7 giorni

## Roadmap future

- [ ] Sincronizzazione foto offline (ridimensionamento client-side)
- [ ] Merge intelligente per conflitti di edit
- [ ] Storage quota management UI
- [ ] Statistiche di sync dettagliate
- [ ] Periodic sync fallback per iOS
