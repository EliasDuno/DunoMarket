const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

console.log('Master Pool Config:', getMasterPoolConfig());

const pool = new Pool(getMasterPoolConfig());

async function run() {
    try {
        console.log('Connecting to master DB...');
        const res = await pool.query('SELECT id, nombre, slug, db_url, status, is_provisioned FROM tenants');
        console.log('Registered Tenants:');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error('Error querying tenants:', err);
    } finally {
        await pool.end();
    }
}

run();
