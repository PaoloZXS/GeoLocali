// populate_addresses.js
//
// Scan tblocali for rows that have latitude/longitude values but missing
// address/city/civic fields.  For each such row request a reverse geocode
// from a public service (Nominatim in this example) and update the record.
//
// Usage: `node populate_addresses.js` (requires same config.js as other scripts)
//
// The script respects a small delay between requests to avoid hammering the
// geocoding service.  You can switch to a commercial API by replacing the
// reverseGeocode() helper.

const { createClient } = require('@libsql/client');
const { DB_URL, DB_TOKEN } = require('./config');
// prefer built-in fetch when available (Node 18+), otherwise fall back to node-fetch
const fetch = (typeof global.fetch === 'function') ? global.fetch : require('node-fetch');

async function reverseGeocode(lat, lon) {
  if (lat == null || lon == null) return null;

  // helpers to read keys (env takes precedence)
  const cfg = require('./config');
  const liq = process.env.LOCATIONIQ_KEY || cfg.LOCATIONIQ_KEY;
  const ocg = process.env.OPENCAGE_KEY  || cfg.OPENCAGE_KEY;

  // 1. try LocationIQ if key present
  if (liq) {
    const url =
      `https://us1.locationiq.com/v1/reverse.php?key=${encodeURIComponent(liq)}` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=json`;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        return d.address || null;
      } else {
        console.error('locationiq HTTP', r.status, r.statusText);
        const txt = await r.text();
        console.error('  body:', txt.substring(0,200));
      }
    } catch (e) {
      console.error('locationiq error', e.message);
    }
    // fall through below if it fails
  }

  // 2. try OpenCage if key present
  const publicOpenCageKey = 'edbf0421af0f4e19882ac0d0aa9d0d71';
  const ocgKey = ocg || publicOpenCageKey;
  if (ocgKey) {
    const url =
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(lat+' '+lon)}` +
      `&key=${encodeURIComponent(ocgKey)}&no_annotations=1&language=it`;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        if (d.status && d.status.code === 200 && d.results && d.results.length)
          return d.results[0].components || d.results[0].formatted || null;
      } else {
        console.error('opencage HTTP', r.status, r.statusText);
        const txt = await r.text();
        console.error('  body:', txt.substring(0,200));
      }
    } catch (e) {
      console.error('opencage error', e.message);
    }
    // fall through to nominatim if that fails
  }

  // 3. fallback to OSM Nominatim
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'geolocate-app/1.0 (you@example.com)' }
    });
    if (!res.ok) {
      console.error('reverse geocode HTTP', res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    return data.address || null;
  } catch (e) {
    console.error('reverse geocode error', e.message);
    return null;
  }
}

async function main() {
  const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

  const rows = await db.execute(
    "SELECT id, latitude, longitude FROM tblocali WHERE (address IS NULL OR address='') AND latitude IS NOT NULL AND longitude IS NOT NULL"
  );

  for (const r of rows.rows) {
    console.log('reverse geocoding', r.id, r.latitude, r.longitude);
    const addr = await reverseGeocode(r.latitude, r.longitude);
    if (addr) {
      const address = addr.road || addr.pedestrian || addr.cycleway || '';
      const civic = addr.house_number || '';
      const city = addr.city || addr.town || addr.village || '';
      await db.execute(
        'UPDATE tblocali SET address=?, city=?, civic=? WHERE id=?',
        [address, city, civic, r.id]
      );
      console.log('  updated', { address, city, civic });
    } else {
      console.log('  failed to reverse geocode');
    }
    // polite delay
    await new Promise(res => setTimeout(res, 1100));
  }
  console.log('done');
}

main().catch(err => { console.error(err); process.exit(1); });