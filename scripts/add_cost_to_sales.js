const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet', // Correct DB name
    password: 'Rodri%970',   // Correct Password
    port: 5432,
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Adding costo_unitario_usd to detalle_ventas...');

        // 1. Add Column
        await client.query(`
            ALTER TABLE detalle_ventas 
            ADD COLUMN IF NOT EXISTS costo_unitario_usd NUMERIC(12,2) DEFAULT 0;
        `);

        // 2. Backfill with current costs (Best effort for past sales)
        console.log('Backfilling past sales with current product costs...');
        await client.query(`
            UPDATE detalle_ventas dv
            SET costo_unitario_usd = p.costo_usd
            FROM productos p
            WHERE dv.producto_id = p.id AND (dv.costo_unitario_usd IS NULL OR dv.costo_unitario_usd = 0);
        `);

        console.log('Migration complete.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

run();
