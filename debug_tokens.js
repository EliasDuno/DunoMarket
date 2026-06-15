require('dotenv').config({ path: '../.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const { rows: tenants } = await pool.query('SELECT slug, db_url FROM tenants WHERE estado = $1', ['activo']);
    for (const t of tenants) {
      if (t.slug !== 'dmarket') continue; // only check dmarket for now
      console.log(`Checking tenant: ${t.slug}`);
      const tPool = new Pool({ connectionString: t.db_url });
      
      const { rows: users } = await tPool.query('SELECT id, nombre, email, rol, expo_push_token FROM usuarios');
      console.log(users);
      await tPool.end();
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
