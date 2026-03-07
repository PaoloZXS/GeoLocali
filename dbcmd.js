const { createClient } = require('@libsql/client');
const { DB_URL, DB_TOKEN } = require('./config');
const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

console.log('adding name column...');
db.execute('ALTER TABLE user ADD COLUMN name TEXT;')
  .then(r => {
    console.log('result', r);
    process.exit();
  })
  .catch(err => {
    console.error('error', err.message);
    process.exit();
  });
