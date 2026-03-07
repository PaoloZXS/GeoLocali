// create_photos_table.js
// small helper to ensure tblocali_photos exists in the Turso database

const { createClient } = require('@libsql/client');
const { DB_URL, DB_TOKEN } = require('./config');

async function main() {
    const db = createClient({ url: DB_URL, authToken: DB_TOKEN });
    const sql = `
CREATE TABLE IF NOT EXISTS tblocali_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locale_id INTEGER NOT NULL,
  url TEXT NOT NULL
);
`;
    try {
        await db.execute(sql);
        console.log('tblocali_photos table ensured');
    } catch (e) {
        console.error('error creating table', e.message);
    }
}

main().catch(err=>{ console.error(err); process.exit(1); });