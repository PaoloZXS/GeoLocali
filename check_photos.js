const { createClient } = require('@libsql/client');
const { DB_URL, DB_TOKEN } = require('./config');
(async()=>{
  const db = createClient({url:DB_URL,authToken:DB_TOKEN});
  const r = await db.execute('SELECT * FROM tblocali_photos');
  console.log('photos records:', r.rows);
  process.exit(0);
})();
