const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function checkHistory() {
    const client = await pool.connect();
    try {
        console.log('Checking last 5 merma movements...');
        const res = await client.query(`
            SELECT id, producto_id, cantidad, origen, destino, es_merma, fecha 
            FROM historial_movimientos 
            WHERE es_merma = true 
            ORDER BY id DESC 
            LIMIT 5
        `);
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkHistory();
