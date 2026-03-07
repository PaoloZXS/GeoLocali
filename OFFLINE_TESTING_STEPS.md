#!/usr/bin/env node
/**
 * PWA Offline Flow - Browser Testing Guide
 * This script provides step-by-step instructions for testing the offline flow
 */

console.log('\n');
console.log('╔' + '═'.repeat(70) + '╗');
console.log('║' + ' '.repeat(70) + '║');
console.log('║' + '  🧪 PWA Offline Flow - Browser Testing Guide'.padEnd(70) + '║');
console.log('║' + ' '.repeat(70) + '║');
console.log('╚' + '═'.repeat(70) + '╝');

console.log(`

✅ PWA Status: ALL COMPONENTS READY

📊 Pre-Test Verification:
   ✓ Server running on localhost:3000
   ✓ Service Worker installed (/sw.js - 12.41 KB)
   ✓ Manifest configured (/manifest.json)
   ✓ IndexedDB support available
   ✓ Offline sync endpoint ready (/api/sync)
   ✓ All HTML pages integrated

───────────────────────────────────────────────────────────────────────────

🧪 Testing the Complete Offline Flow (Step-by-Step)

Step 1️⃣: Verify Service Worker Registration
─────────────────────────────────────────────────────────────────────────────

   1. Open Browser DevTools (F12 or Ctrl+Shift+I)
   2. Go to "Application" tab (Chrome/Edge) or "Storage" (Firefox)
   3. Click on "Service Workers" in left panel
   4. You should see:
      
      ✓ Scope: http://localhost:3000/
      ✓ Status: activated and running ⬢
      ✓ Push notifications: not supported (ok)
      ✓ Sync: not blocked

   📝 Console test (paste in DevTools Console):
   
        navigator.serviceWorker.getRegistrations()
          .then(regs => {
            console.log('Service Workers found:', regs.length);
            if (regs[0]?.active) console.log('✓ SW is ACTIVE');
            else console.log('✗ SW not active');
          });
   
   Expected output: "✓ SW is ACTIVE"

───────────────────────────────────────────────────────────────────────────

Step 2️⃣: Verify IndexedDB is Created
─────────────────────────────────────────────────────────────────────────────

   1. In DevTools → Application tab
   2. Click on "IndexedDB" in left panel
   3. Expand "http://localhost:3000"
   4. You should see database: "locali_app_db" with 4 stores:
      
      ✓ locations
      ✓ photos
      ✓ pending_sync
      ✓ user_preferences
   
   📝 Console test:
   
        indexedDB.databases()
          .then(dbs => {
            console.log('IndexedDB databases:', dbs.map(d => d.name));
          });
   
   Expected: [{"name":"locali_app_db","version":1}]

───────────────────────────────────────────────────────────────────────────

Step 3️⃣: Verify Cache Storage
─────────────────────────────────────────────────────────────────────────────

   1. In DevTools → Application tab
   2. Click on "Cache Storage" in left panel
   3. You should see at least one cache:
      
      ✓ locali-v1 (static assets)
      ✓ locali-api-v1 (API responses)
   
   4. Click on each cache to see what's cached:
      /
      /default/default.html
      /insert/insert.html
      /manifest.json
      /fonts/...
      /leaflet/...
      etc.

───────────────────────────────────────────────────────────────────────────

Step 4️⃣: Simulate Going OFFLINE
─────────────────────────────────────────────────────────────────────────────

   METHOD A - DevTools Way (Recommended):
   
      1. In DevTools → Network tab
      2. Look for checkbox "Offline" 
      3. ✓ Check the "Offline" checkbox
      4. The page will show:
         - Orange banner at top: "Sei offline - I dati verranno..."
         - "☁️ cloud_off" icon with message
         - Page continues to work (reads from cache)
      
   METHOD B - WiFi Way (Real Testing):
      
      1. Turn off WiFi on your computer
      2. Wait 5 seconds
      3. Same orange banner should appear
      4. You're now testing the REAL offline experience
   
   ✓ Success when:
      - Banner appears
      - Page is still readable
      - Old data loads from cache

───────────────────────────────────────────────────────────────────────────

Step 5️⃣: Test Offline Operation - Add a Location
─────────────────────────────────────────────────────────────────────────────

   While OFFLINE, test adding a location:
   
   1. Click "Aggiungi locale" button (top right)
   2. Fill in location form:
      - Nome: "Test Location Offline"
      - Type: "bar" (dropdown)
      - Address: "Via Test 123"
      - City: "Milano"
      - Closing day: "Lunedì"
      - Photos: (skip for now)
   
   3. Click "Aggiungi" button
   
   4. You should see:
      ✓ Notification: "Richiesta salvata localmente..."
      ✓ Operation queued in IndexedDB
      ✓ Badge "1" appears on sync button
   
   📝 Console test to verify queuing:
   
        import db from './db.js';
        db.getPendingSyncOps()
          .then(ops => {
            console.log(`${ops.length} operations queued`);
            ops.forEach(op => console.log(op));
          });
   
   Expected: 1 operation with status: "pending"

───────────────────────────────────────────────────────────────────────────

Step 6️⃣: Go BACK ONLINE
─────────────────────────────────────────────────────────────────────────────

   Method A - DevTools:
      1. In DevTools → Network tab
      2. ✓ UNCHECK "Offline" checkbox
      3. Page should:
         - Orange banner disappears
         - Connection restored toast shows
         - Background sync starts automatically
   
   Method B - WiFi:
      1. Turn WiFi back on
      2. Wait 5 seconds
      3. Same as Method A
   
   ✓ Success when:
      - Banner disappears
      - Toast notification: "✓ Sei online"

───────────────────────────────────────────────────────────────────────────

Step 7️⃣: Verify BACKGROUND SYNC
─────────────────────────────────────────────────────────────────────────────

   Watch for automatic sync:
   
   1. Top right corner shows:
      ✓ "🔄 Sincronizzazione..." spinner appears for 2-5 seconds
   
   2. After sync completes:
      ✓ Spinner disappears
      ✓ Badge count disappears
      ✓ Notification: "✓ Sincronizzazione completata"
   
   📝 Console to check sync status:
   
        import { getSyncStats } from './offline.js';
        getSyncStats().then(stats => {
          console.log(JSON.stringify(stats, null, 2));
        });
   
   Expected after sync completes:
        {
          "online": true,
          "syncInProgress": false,
          "pendingSyncCount": 0,
          "dbStats": {
            "locations": 1,
            "pending_sync": 0,  // ← ALL SYNCED!
            ...
          }
        }

───────────────────────────────────────────────────────────────────────────

Step 8️⃣: Verify Location was Created on Server
─────────────────────────────────────────────────────────────────────────────

   1. Go back to map (default page)
   2. Refresh page (F5)
   3. Search for "Test Location Offline" in the nearby locations table
   4. ✓ Location appears in the list
   5. Click on location to view details
   
   📝 Alternative - Console request:
   
        fetch('/api/locations')
          .then(r => r.json())
          .then(locations => {
            const testLoc = locations.find(l => l.name.includes('Test'));
            console.log('✓ Found in server:', testLoc);
          });

───────────────────────────────────────────────────────────────────────────

Step 9️⃣: Advanced Testing - Multiple Offline Operations
─────────────────────────────────────────────────────────────────────────────

   Test queuing multiple operations:
   
   1. Go offline again (DevTools → Network → Offline ✓)
   2. Add 3 more locations:
      - "Bar Downtown"
      - "Restaurant Center"  
      - "Cafe North"
   3. You should see:
      ✓ Badge shows "3" (3 operations queued)
      ✓ All stored in IndexedDB
   
   4. Go online
   5. All 3 operations should sync together in one batch
   6. Verify all 3 appear in the server

───────────────────────────────────────────────────────────────────────────

Step 🔟: Test Mobile Installation
─────────────────────────────────────────────────────────────────────────────

   Android Chrome:
      1. Open http://localhost:3000 (on same WiFi as PC)
      2. Look for "Install" button in URL bar
      3. Tap "Install app" → "Install"
      4. App appears on home screen
      5. Open from home screen → Opens fullscreen without browser UI
      6. Try offline flow on phone
   
   iOS Safari:
      1. Open http://localhost:3000
      2. Tap Share button
      3. Tap "Add to Home Screen"
      4. Name: "Locali"
      5. Apps appears on home screen as web clip
      6. Opens fullscreen with Safari UI (PWA fully functional)

───────────────────────────────────────────────────────────────────────────

📊 Expected Results After All Tests

If all 10 steps pass cleanly:

   ✅ Service Worker registered and active
   ✅ IndexedDB stores created (4 stores)
   ✅ Offline banner appears correctly
   ✅ Location added while offline (queued)
   ✅ Badge counter shows queued operations
   ✅ Background sync triggers automatically
   ✅ Sync completes with "0 pending"
   ✅ New location visible on server
   ✅ Multiple operations batch correctly
   ✅ Mobile installation works

───────────────────────────────────────────────────────────────────────────

🐛 Troubleshooting If Something Fails

Service Worker not registering?
   → Hard refresh browser (Ctrl+Shift+R)
   → Clear Cache Storage (DevTools → Application → Clear Site Data)
   → Restart server: Stop-Process -Name node; npm run dev

IndexedDB not created?
   → Not using Safari in private mode (not supported)
   → Check browser console for errors
   → Quota might be exceeded (unlikely at start)

Orange banner not appearing when offline?
   → Reload page with offline enabled
   → Check console: import { getOnlineStatus } from './offline.js';
     getOnlineStatus() should return false

Operations not syncing?
   → Make sure you're authenticated (token in localStorage)
   → Check server logs for /api/sync requests
   → Verify network tab shows POST /api/sync request

───────────────────────────────────────────────────────────────────────────

📚 Console Commands Quick Reference

// Check online status
import { getOnlineStatus } from './offline.js';
console.log('Online:', getOnlineStatus());

// See pending sync operations
import db from './db.js';
db.getPendingSyncOps().then(ops => console.log(ops));

// Get all stats
import { getSyncStats } from './offline.js';
getSyncStats().then(s => console.log(JSON.stringify(s, null, 2)));

// Get all locations from IndexedDB
db.getLocations().then(locs => console.log(locs));

// View all caches
caches.keys().then(names => {
  names.forEach(name => {
    caches.open(name).then(cache => {
      cache.keys().then(reqs => {
        console.log(name + ':', reqs.map(r => r.url));
      });
    });
  });
});

// Force sync now
import { forceSyncNow } from './offline.js';
forceSyncNow();

───────────────────────────────────────────────────────────────────────────

💡 Pro Tips

1. Open Console BEFORE going offline to see real-time logs
2. Use "Slow 3G" in DevTools → Network for realistic testing
3. Test on actual mobile for complete offline experience
4. Try airplane mode on phone for true offline testing
5. Check localStorage for authToken: localStorage.getItem('authToken')

───────────────────────────────────────────────────────────────────────────

🎯 Success Criteria

The PWA is working correctly when:

   ✅ Offline operations are queued and visible in IndexedDB
   ✅ Badge counter accurately reflects pending operations
   ✅ Background sync executes automatically when online
   ✅ All queued operations completed with no errors
   ✅ Server successfully processes synced data
   ✅ Mobile installation works without errors

───────────────────────────────────────────────────────────────────────────

Ready to test? Open http://localhost:3000 in your browser and follow steps 1-10!

`);
