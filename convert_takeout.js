// convert_takeout.js
//
// Usage: node convert_takeout.js "path/to/luoghi preferiti.csv"
// writes converted.csv in the current directory.

const fs = require('fs');
const readline = require('readline');

if (process.argv.length !== 3) {
  console.error('usage: node convert_takeout.js file.csv');
  process.exit(1);
}

const inFile = process.argv[2];
const outStream = fs.createWriteStream('converted.csv', { encoding: 'utf8' });
outStream.write('latitude,longitude,address,name,type,civic,city,closingDay\n');

// helper to pause between requests (complies with Nominatim policy)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// try to obtain coordinates by downloading the Google Maps page and
// extracting the lat/lon pair embedded in the "pb" parameter.
async function fetchCoordsFromGoogle(gmapUrl) {
  if (!gmapUrl) return null;
  try {
    const res = await fetch(gmapUrl, { redirect: 'follow' });
    const text = await res.text();
    const m = text.match(/2d(-?\d+\.\d+)%213d(-?\d+\.\d+)/);
    if (m) {
      // group1 = lon, group2 = lat
      return { lat: m[2], lon: m[1] };
    }
  } catch (e) {
    console.error('google scrape error for', gmapUrl, e.message);
  }
  return null;
}


async function run() {
  const rl = readline.createInterface({ input: fs.createReadStream(inFile, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    // split on commas outside quotes
    const parts = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/);
    if (parts[0] === 'Titolo') continue;
    const [title,, url] = parts;
    if (!title) continue;

    // attempt to parse coords from URL
    let lat = '', lon = '';
    const m = url && url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) {
      lat = m[1];
      lon = m[2];
    }

    // if coordinates still missing, fetch Google Maps page and scrape them
    if ((!lat || !lon) && url) {
      const g = await fetchCoordsFromGoogle(url);
      if (g) {
        lat = g.lat;
        lon = g.lon;
      }
      await sleep(500); // be polite
    }

    // ensure we always output something
    if (!lat) lat = '0';
    if (!lon) lon = '0';

    outStream.write(
      `${lat},${lon},,,${title.trim().replace(/\"/g,'\"\"')},,,\n`
    );
  }
  outStream.end();
  console.log('wrote converted.csv – edit it as needed');
}

run().catch(err => { console.error(err); process.exit(1); });
