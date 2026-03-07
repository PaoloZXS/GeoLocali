// update_coords.js
//
// Scan tblocali for rows that have a non-empty address but either latitude or
// longitude is zero.  Attempt to fetch real coordinates using a geocoding
// service and update the row.
//
// Usage: `node update_coords.js` (requires same config.js as other scripts)
//
// NOTE: your CSV import above populated addresses only for the test entry.  If
// often the table contains blank addresses, there is nothing to geocode.  You
// should fill address data manually before running this.

const { createClient } = require('@libsql/client');
const { DB_URL, DB_TOKEN } = require('./config');
const fetch = require('node-fetch');

// choose a geocoding function here; the example uses Nominatim (may be blocked
// from your location) and falls back to a Google-scraping helper.
async function geocodeAddress(addr) {
  if (!addr) return null;
  // first try Nominatim
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&q=' +
                encodeURIComponent(addr);
    const res = await fetch(url, {headers:{'User-Agent':'geolocate-app/1.0 (you@example.com)'}});
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        return { lat: data[0].lat, lon: data[0].lon };
      }
    }
  } catch (e) {
    console.error('nominatim error', e.message);
  }
  // fallback: scrape Google maps search result (similar to earlier logic)
  try {
    const searchUrl = 'https://www.google.com/maps/search/' + encodeURIComponent(addr);
    const r2 = await fetch(searchUrl, {redirect:'follow'});
    const txt = await r2.text();
    const m = txt.match(/2d(-?\d+\.\d+)%213d(-?\d+\.\d+)/);
    if (m) return { lat: m[2], lon: m[1] };
  } catch (e) {
    console.error('google scrape error', e.message);
  }
  return null;
}

async function main() {
  const db = createClient({url:DB_URL, authToken:DB_TOKEN});

  const rows = await db.execute(
    "SELECT id, address, latitude, longitude FROM tblocali WHERE address IS NOT NULL AND address<>'' AND (latitude=0 OR longitude=0)"
  );
  for (const r of rows.rows) {
    console.log('geocoding', r.id, r.address);
    const g = await geocodeAddress(r.address);
    if (g) {
      console.log('  got', g);
      await db.execute('UPDATE tblocali SET latitude=?, longitude=? WHERE id=?', [parseFloat(g.lat), parseFloat(g.lon), r.id]);
    } else {
      console.log('  failed to geocode', r.address);
    }
    // respect polite rate limit
    await new Promise(res=>setTimeout(res, 1100));
  }
  console.log('done');
}

main().catch(err=>{console.error(err); process.exit(1);});