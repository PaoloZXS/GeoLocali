// fix_names.js
// Move values from type->name when name is empty
const { createClient } = require('@libsql/client');
const { DB_URL, DB_TOKEN } = require('./config');
(async () => {
  const db = createClient({url: DB_URL, authToken: DB_TOKEN});
  const result = await db.execute(`
    UPDATE tblocali SET name = type, type = NULL
    WHERE (name IS NULL OR name = '') AND (type IS NOT NULL AND type <> '')
  `);
  console.log('updated', result); // not all drivers return rowcount
  const check = await db.execute('SELECT id,name,type FROM tblocali ORDER BY id LIMIT 20');
  console.log(check.rows);
})();