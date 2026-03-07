// Simple helper script to import one or more CSV lines into tblocali.
// Usage examples:
//   node import.js "44.85,7.72,Via Test UI,Test UI,hotel,21,Carmagnola,venerdì"
//   echo "44.85,7.72,Via Test UI,Test UI,hotel,21,Carmagnola,venerdì" | node import.js
//   node import.js data.csv   (reads every line from file)
// The expected fields are: latitude,longitude,address,name,type,civic,city,closingDay

const fs = require('fs');
const readline = require('readline');
const { createClient } = require('@libsql/client');
const { DB_URL, DB_TOKEN } = require('./config');

async function main() {
  const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

  const processLine = async (line) => {
    // strip BOM if present
    if (line.charCodeAt(0) === 0xFEFF) {
      line = line.slice(1);
    }
    line = line.trim();
    if (!line) return;
    // skip header row if it looks like one (non-numeric latitude)
    const maybeHeader = line.split(/[,;]\s*/)[0];
    // if the first field is non-empty and not a number, treat as header
    if (maybeHeader !== '' && isNaN(parseFloat(maybeHeader))) {
      // found header text such as "latitude"; ignore it
      return;
    }
    // allow comma or semicolon as separator
    const parts = line.split(/[,;]\s*/);
    if (parts.length < 8) {
      console.error('skipping malformed line (need 8 fields):', line);
      return;
    }
    const [latitude, longitude, address, name, type, civic, city, closingDay] = parts;
    // convert empty strings to null and parse numbers safely
    // parse coordinates and fall back to zero if missing or invalid
    let latVal = parseFloat(latitude);
    let lonVal = parseFloat(longitude);
    if (!isFinite(latVal)) latVal = 0;
    if (!isFinite(lonVal)) lonVal = 0;
    try {
      const result = await db.execute(
        'INSERT INTO tblocali (latitude, longitude, address, name, type, civic, city, closingDay) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [latVal, lonVal, address||null, name||null, type||null, civic||null, city||null, closingDay||null]
      );
      console.log('inserted row id', result.lastInsertRowid);
    } catch (err) {
      console.error('error inserting line:', err.message);
    }
  };

  const args = process.argv.slice(2);
  if (args.length === 0) {
    // read from stdin
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      await processLine(line);
    }
  } else if (args.length === 1 && fs.existsSync(args[0])) {
    // treat argument as filename
    console.log('import.js: reading file', args[0]);
    const rl = readline.createInterface({ input: fs.createReadStream(args[0], { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of rl) {
      console.log('import.js: file line ->', line);
      await processLine(line);
    }
  } else {
    // treat arguments as a single CSV line
    await processLine(args.join(' '));
  }
}

main().catch(err => {
  console.error('import script error', err);
  process.exit(1);
});
