
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function migrate() {
    try {
        console.log('Starting migration...');
        await pool.query("ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_principal INTEGER DEFAULT 0;");
        console.log('Added stock_principal');
        await pool.query("ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_secundaria INTEGER DEFAULT 0;");
        console.log('Added stock_secundaria');
        console.log('Migration complete.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}

migrate();
