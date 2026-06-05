const { Pool } = require('pg');
const { getMasterPoolConfig } = require('./config/db');

const pool = new Pool(getMasterPoolConfig());

async function checkHistory() {
    try {
        console.log('--- Checking historial_compras ---');
        const countRes = await pool.query('SELECT COUNT(*) FROM historial_compras');
        console.log(`Total records: ${countRes.rows[0].count}`);

        const rowsRes = await pool.query('SELECT * FROM historial_compras ORDER BY id DESC LIMIT 5');
        console.log(JSON.stringify(rowsRes.rows, null, 2));
    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        pool.end();
    }
}

checkHistory();
