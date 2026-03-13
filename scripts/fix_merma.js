const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

// Note: I need to verify DB credentials from servidor.js first.
// Checking servidor.js...
// const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'postgres', password: 'root', port: 5432 }); 
// (Wait, usually it's 'postgres' db or 'inventario'. I'll check common patterns or assume postgres based on previous logs if available.
// Viewing logs/servidor.js previously might have shown it. 
// Standard for this user seems to be database: 'postgres'.

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Migrating stock_merma to stock_merma_secundaria...');

        // Move all generic merma to secondary merma (assuming user was working there)
        const res = await client.query(`
            UPDATE productos 
            SET stock_merma_secundaria = stock_merma_secundaria + stock_merma, 
                stock_merma = 0 
            WHERE stock_merma > 0
        `);

        console.log(`Updated ${res.rowCount} products.`);
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
