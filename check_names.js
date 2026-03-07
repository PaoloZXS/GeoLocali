const { createClient } = require('@libsql/client');
const { DB_URL, DB_TOKEN } = require('./config');
(async () => {
  const db = createClient({ url: DB_URL, authToken: DB_TOKEN });
  const r = await db.execute("SELECT id, name, type FROM tblocali LIMIT 20");
  console.log(r.rows);
})();