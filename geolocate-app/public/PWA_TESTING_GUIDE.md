# 🚀 PWA Locali - Implementazione Completa

## ✅ Stato Completamento

### Manifest e Configurazione
- ✅ `manifest.json` creato con metadati PWA
- ✅ Meta tag PWA aggiunti a tutti gli HTML (viewport, theme-color, apple-mobile-web-app, ecc.)
- ✅ Icon references configurate

### Service Worker
- ✅ `sw.js` creato con strategie di caching complete
- ✅ Network-first per API
- ✅ Stale-while-revalidate per asset statici
- ✅ Cache-first per risorse esterne
- ✅ IndexedDB sync queue integrato
- ✅ Background Sync API supporto
- ✅ Registrazione automatica in tutti gli HTML

### Offline Support
- ✅ `db.js` - IndexedDB wrapper completo
- ✅ `offline.js` - Rilevamento online/offline con UI
- ✅ `api-wrapper.js` - Wrapper API intelligente con offline queue
- ✅ Endpoint `/api/sync` nel server per processare operazioni offline

### Integrazione Frontend
- ✅ Moduli importati in `default.html`
- ✅ Moduli importati in `insert.html`
- ✅ Moduli importati in `admin.html`
- ✅ Moduli importati in `login.html`
- ✅ Moduli importati in `register.html`

### Server Updates
- ✅ Endpoint `/api/sync` implementato
- ✅ Supporto batch operations (create location, delete photo)
- ✅ Token validation

---

## 🧪 Come Testare la PWA

### 1. Verificare installazione Service Worker
```javascript
// In DevTools Console (F12 -> Console)
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Service Workers:', regs);
  regs[0].active && console.log('✓ Service Worker ACTIVE');
});
```

**Output atteso:**
```
Service Workers: [ServiceWorkerRegistration]
✓ Service Worker ACTIVE
```

### 2. Controllare IndexedDB
```javascript
// In DevTools Console
indexedDB.databases().then(dbs => {
  console.log('IndexedDB Databases:', dbs);
});
```

**Output atteso:**
```
IndexedDB Databases: [ 
  {name: "locali_app_db", version: 1}
]
```

### 3. Testare offline detection
```javascript
// In DevTools Console
import { getOnlineStatus, getSyncStats } from './offline.js';

console.log('Online:', getOnlineStatus());
getSyncStats().then(stats => console.log('Sync Stats:', stats));
```

### 4. Simulare offline nel browser
1. Apri DevTools (F12)
2. Vai a **Network** tab
3. Spunta "Offline" checkbox
4. Il banner "Offline" dovrebbe apparire in alto
5. Prova ad aggiungere una location - verrà messa in coda

### 5. Testare installazione come app
1. Apri http://localhost:3000
2. Cerca "Install" nella barra degli indirizzi (Chrome)
3. Clicca su "Install Locali" 
4. L'app si installerà come applicazione nativa
5. Aprila dal menu applicazioni

### 6. Verificare cache Service Worker
```javascript
// In DevTools Console
caches.keys().then(names => {
  console.log('Cache names:', names);
  names.forEach(name => {
    caches.open(name).then(cache => {
      cache.keys().then(requests => {
        console.log(`\n${name}:`);
        requests.forEach(req => console.log('  -', req.url));
      });
    });
  });
});
```

### 7. Testare operazioni offline in coda
```javascript
// In DevTools Console
import db from './db.js';

// Vedere operazioni in coda
db.getPendingSyncOps().then(ops => {
  console.log(`${ops.length} operazioni in coda at ${new Date().toISOString()}`);
  ops.forEach(op => {
    console.log(`  ID=${op.id}, status=${op.status}, method=${op.method}`);
  });
});
```

---

## 📊 Flusso Offline Completo

### Scenario: User offline vuole aggiungere location

```
1. User navigate a http://localhost:3000/insert
2. Connection cade (WiFi off)
3. Banner arancione appare: "Sei offline - I dati verranno sincronizzati"
4. User compila form location e clicca "Aggiungi"
5. Richiesta POST viene intercettata da api-wrapper
6. Operazione salvata in IndexedDB con status: "pending"
7. Badge "1" appare su Sincronizzazione button
8. Notifica toast: "Richiesta salvata localmente, verrà sincronizzata online"
9. User spegne il telefono, location è persistente

10. User accende il telefono (WiFi torna online)
11. Event "online" triggerato
12. Banner scompare
13. Background Sync iniza automaticamente
14. Service Worker legge coda da IndexedDB
15. Chiama POST /api/sync (batch) con operazione
16. Server processa operazione:
    - Crea la location nel database
    - Ritorna risultato successo
17. Service Worker marca operazione come "synced" in IndexedDB
18. Badge scompare
19. Notifica: "✓ Sincronizzazione completata"
20. Location è ora online nel server
```

---

## 🔧 Struttura File

```
public/
├── manifest.json          # PWA metadata
├── sw.js                  # Service Worker
├── db.js                  # IndexedDB wrapper (ES6 module)
├── offline.js             # Offline detection & UI (ES6 module)
├── api-wrapper.js         # API wrapper con offline queue (ES6 module)
├── OFFLINE_INTEGRATION.md # Documentation
│
├── default/
│   └── default.html       # Map page (integrato offline)
├── insert/
│   └── insert.html        # Add location page (integrato offline)
├── admin/
│   └── admin.html         # Admin panel (integrato offline)
├── login/
│   └── login.html         # Login (integrato offline)
├── register/
│   └── register.html      # Registration (integrato offline)
│
├── icons/
│   ├── icon-192x192.svg   # App icon small
│   └── icon-512x512.svg   # App icon large
└── screenshots/           # App store screenshots (vuoto per ora)

server.js
├── POST /api/sync         # Batch offline sync endpoint
├── [altre routes...]
```

---

## 🐛 Debugging

### Service Worker non registrato
**Problema:** Console mostra errore "Failed to register service worker"

**Soluzione:**
1. Verificare che `/sw.js` sia accessibile
2. Verificare CORS headers
3. Controllare che il file `sw.js` non abbia syntax errors
4. Unregister tutti i SW vecchi:
```javascript
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(reg => reg.unregister());
});
```

### Offline banner non appare
**Problema:** Banner offline non visibile quando connection cade

**Soluzione:**
1. Verificare che `offline.js` sia importato correttamente
2. Verificare che `initOfflineDetection()` sia chiamato
3. Controllare console per errori
4. Provare a disabilitare e riabilitare WiFi

### Operazioni offline non sincronizzate
**Problema:** Operazioni restano in coda anche quando online

**Soluzione:**
1. Verificare che il server abbia endpoint `/api/sync`
2. Verificare che l'utente sia autenticato (token in localStorage)
3. Testare `/api/sync` manualmente:
```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"operations": []}'
```
4. Controllare server logs per errori

### IndexedDB quota exceeded
**Problema:** "QuotaExceededError" quando salvo dati offline

**Soluzione:**
1. Browser default: 50MB
2. Pulire vecchie operazioni sincronizzate:
```javascript
import db from './db.js';
// Elimina operazioni sincronizzate > 7 giorni fa
```
3. Disabilitare private/incognito mode (no persistence)

---

## 📈 Prossimi Passi Opzionali

### Phase 2: Foto Offline
- [ ] Implementare blob storage per foto offline
- [ ] Ridimensionamento foto client-side
- [ ] Preview prima di upload

### Phase 3: Merge Intelligente
- [ ] Aggiungere `version` field alle locations
- [ ] Implementare merge per conflitti di edit
- [ ] Notification user di conflitti

### Phase 4: Analytics
- [ ] Tracciare usage offline vs online
- [ ] Dashboard sync success rate
- [ ] User feedback collection

---

## 📱 Installazione su Mobile

### Android Chrome
1. Apri http://localhost:3000 (se in LAN su stesso network)
2. Tap menu (3 dots)
3. Tap "Installa app"
4. Tap "Installa"
5. App disponibile in home screen

### iOS Safari
1. Apri http://localhost:3000
2. Tap Share button
3. Tap "Aggiungi a Home"
4. App disponibile in home screen (come web clip)
5. Si aprirà in fullscreen

---

## 🚀 Production Deployment

### Vercel (Recommended)
```bash
# Deploy current state
vercel --prod

# Assign custom domain
vercel env add PRODUCTION_URL
```

### Manual Deployment
1. Assicurati che manifest.json sia servito con correct MIME type
2. SW.js deve essere su root (`/sw.js`)
3. HTTPS obbligatorio (eccetto localhost)
4. Test con Lighthouse audit

**Lighthouse PWA Audit:**
```bash
# In Chrome DevTools -> Lighthouse
# Run PWA audit to verify:
- ✓ Installable
- ✓ Works offline
- ✓ Responsive
- ✓ Has service worker
```

---

## 📞 Support Notes

- **Browser Support:** Chrome 40+, Firefox 44+, Safari 11.1+, Opera 27+
- **Offline Duration:** Operations stay in queue for 7 days max
- **Storage Quota:** Check browser limit (usually 50MB+)
- **Sync Interval:** User-triggered + automatic on reconnect + periodic (if supported)

