const { createClient } = require('@libsql/client');
const { DB_URL, DB_TOKEN } = require('./config');
(async()=>{
  const db = createClient({ url: DB_URL, authToken: DB_TOKEN });
  try{
    const r = await db.execute("PRAGMA table_info('tblocali')");
    console.log('tblocali schema:');
    console.dir(r.rows, {depth:null});
  }catch(e){
    console.error('error inspecting schema', e.message);
  }
})();